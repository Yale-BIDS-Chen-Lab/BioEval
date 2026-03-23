import json
from typing import Any, Dict, List
from urllib import error, parse, request


GEMINI_API_BASE_URL = "https://generativelanguage.googleapis.com/v1beta/models"
_ALLOWED_PARAMS = {"max_tokens", "temperature", "top_p"}


def format_parameters(raw_list: List[Dict[str, Any]]) -> Dict[str, Any]:
  params = {p["id"]: p["value"] for p in raw_list}
  params = {
    k: v
    for k, v in params.items()
    if k in _ALLOWED_PARAMS and v is not None and v != ""
  }

  generation_config: Dict[str, Any] = {}

  if "max_tokens" in params:
    generation_config["maxOutputTokens"] = int(params["max_tokens"])
  else:
    generation_config["maxOutputTokens"] = 4096

  if "temperature" in params:
    generation_config["temperature"] = float(params["temperature"])

  if "top_p" in params:
    generation_config["topP"] = float(params["top_p"])

  return generation_config


class GoogleClient:
  def __init__(self, config: dict, model_name: str, parameters) -> None:
    self.config = config
    self.model_name = model_name
    self.parameters = parameters

  def _build_request(self, entry: str) -> request.Request:
    api_key = parse.quote(self.config["apiKey"], safe="")
    url = f"{GEMINI_API_BASE_URL}/{self.model_name}:generateContent?key={api_key}"
    payload = {
      "contents": [
        {
          "role": "user",
          "parts": [{"text": entry}],
        }
      ],
      "generationConfig": format_parameters(self.parameters),
    }

    return request.Request(
      url,
      data=json.dumps(payload).encode("utf-8"),
      headers={"content-type": "application/json"},
      method="POST",
    )

  def generate(self, entries: list[str]):
    result = []
    for entry in entries:
      req = self._build_request(entry)
      try:
        with request.urlopen(req, timeout=300) as response:
          raw_body = response.read().decode("utf-8")
      except error.HTTPError as exc:
        body = exc.read().decode("utf-8", errors="replace")
        try:
          error_payload = json.loads(body)
          error_info = error_payload.get("error", {})
          message = error_info.get("message") or body
        except json.JSONDecodeError:
          message = body or str(exc)
        raise RuntimeError(f"Gemini API error ({exc.code}): {message}") from exc
      except error.URLError as exc:
        raise RuntimeError(f"Gemini API connection error: {exc.reason}") from exc

      payload = json.loads(raw_body)
      candidates = payload.get("candidates", [])
      if not candidates:
        prompt_feedback = payload.get("promptFeedback", {})
        block_reason = prompt_feedback.get("blockReason")
        if block_reason:
          raise RuntimeError(f"Gemini blocked prompt: {block_reason}")
        raise RuntimeError("Gemini returned no candidates")

      parts = candidates[0].get("content", {}).get("parts", [])
      text = "".join(
        part.get("text", "")
        for part in parts
        if isinstance(part, dict) and isinstance(part.get("text"), str)
      )
      if not text:
        finish_reason = candidates[0].get("finishReason")
        if finish_reason:
          raise RuntimeError(f"Gemini returned no text (finishReason={finish_reason})")
      result.append(text)

    return result
