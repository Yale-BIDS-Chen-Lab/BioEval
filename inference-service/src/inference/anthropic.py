import json
from typing import Any, Dict, List
from urllib import error, request


ANTHROPIC_API_URL = "https://api.anthropic.com/v1/messages"
ANTHROPIC_VERSION = "2023-06-01"
_ALLOWED_PARAMS = {"max_tokens", "temperature"}


def format_parameters(raw_list: List[Dict[str, Any]]) -> Dict[str, Any]:
  params = {p["id"]: p["value"] for p in raw_list}
  params = {
    k: v
    for k, v in params.items()
    if k in _ALLOWED_PARAMS and v is not None and v != ""
  }

  if "max_tokens" not in params:
    params["max_tokens"] = 4096

  if "max_tokens" in params:
    params["max_tokens"] = int(params["max_tokens"])

  if "temperature" in params:
    params["temperature"] = float(params["temperature"])

  return params


class AnthropicClient:
  def __init__(self, config: dict, model_name: str, parameters) -> None:
    self.config = config
    self.model_name = model_name
    self.parameters = parameters

  def _build_request(self, entry: str) -> request.Request:
    payload = {
      "model": self.model_name,
      "messages": [{"role": "user", "content": entry}],
      **format_parameters(self.parameters),
    }

    return request.Request(
      ANTHROPIC_API_URL,
      data=json.dumps(payload).encode("utf-8"),
      headers={
        "content-type": "application/json",
        "x-api-key": self.config["apiKey"],
        "anthropic-version": ANTHROPIC_VERSION,
      },
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
        raise RuntimeError(
          f"Anthropic API error ({exc.code}): {message}"
        ) from exc
      except error.URLError as exc:
        raise RuntimeError(f"Anthropic API connection error: {exc.reason}") from exc

      payload = json.loads(raw_body)
      blocks = payload.get("content", [])
      text = "".join(
        block.get("text", "")
        for block in blocks
        if isinstance(block, dict) and block.get("type") == "text"
      )
      result.append(text)

    return result
