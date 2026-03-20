import re
from typing import Dict, List

from openai import AzureOpenAI

_REASONING_PREFIXES = ("o1", "o3", "o4", "gpt-5")

_ALLOWED_COMMON = {
  "temperature",
  "top_p",
  "presence_penalty",
  "frequency_penalty",
  "stop",
  "n",
  "stream",
}

_ALLOWED_ADVANCED = {
  "logprobs",
  "response_format",
}


def format_parameters(
  model_name: str, raw_list: List[Dict[str, any]]
) -> Dict[str, any]:
  params = {p["id"]: p["value"] for p in raw_list}

  if "max_new_tokens" in params:
    params["max_tokens"] = params.pop("max_new_tokens")

  if "repetition_penalty" in params:
    params["frequency_penalty"] = params.pop("repetition_penalty")

  normalized_model_name = model_name.lower()
  is_reasoning = normalized_model_name.startswith(_REASONING_PREFIXES)
  if is_reasoning:
    # Reasoning models (o1/o3/o4 and GPT-5 family, including gpt-5.4)
    # use max_completion_tokens plus reasoning_effort. Sampling params
    # are intentionally stripped to match the model family contract.
    if "max_tokens" in params:
      params["max_completion_tokens"] = params.pop("max_tokens")
    allowed = {"max_completion_tokens", "reasoning_effort"}
    params = {k: v for k, v in params.items() if k in allowed}
    if "max_completion_tokens" not in params:
      params["max_completion_tokens"] = 4096
  else:
    allowed = _ALLOWED_COMMON | _ALLOWED_ADVANCED | {"max_tokens"}
    params = {k: v for k, v in params.items() if k in allowed}
  return params


class AzureClient:
  def __init__(self, config: dict, model_name: str, parameters) -> None:
    self.config = config
    self.model_name = model_name
    print("received parameters!", parameters)
    self.parameters = parameters
    self.client = self._create_client(config)

  def _create_client(self, config: dict) -> AzureOpenAI:
    client = AzureOpenAI(
      api_version=config["version"],
      azure_endpoint=config["endpoint"],
      api_key=config["apiKey"],
    )
    return client

  def generate(self, entries: list[str]):
    param_kwargs = format_parameters(self.model_name, self.parameters)

    result = []
    for entry in entries:
      response = self.client.chat.completions.create(
        model=self.model_name,
        messages=[{"role": "user", "content": entry}],
        **param_kwargs,
      )
      msg = response.choices[0].message if response.choices else None
      content = msg.content if msg and msg.content is not None else ""
      result.append(content)

    return result
