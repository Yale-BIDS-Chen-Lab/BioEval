import os
import time
from typing import Callable

import torch
from huggingface_hub import snapshot_download
from transformers import StoppingCriteria, StoppingCriteriaList
from transformers.models import (
  AutoModelForCausalLM,
  AutoModelForImageTextToText,
  AutoProcessor,
  AutoTokenizer,
)
from transformers.pipelines.text_generation import TextGenerationPipeline
from transformers.trainer_utils import set_seed


def mps_is_available() -> bool:
  return hasattr(torch.backends, "mps") and torch.backends.mps.is_available()


def best_device() -> str:
  if torch.cuda.is_available():
    return "cuda"
  if mps_is_available():
    return "mps"
  return "cpu"


CHAT_TEMPLATE_MODELS = {
  "meta-llama/Llama-3.1-8B-Instruct",
  "Qwen/Qwen2.5-7B-Instruct",
}

PROCESSOR_MODELS = {
  "google/medgemma-1.5-4b-it",
}


class InferenceCanceledError(Exception):
  pass


class CancelInferenceCriteria(StoppingCriteria):
  def __init__(
    self,
    cancel_check: Callable[[], bool],
    on_cancel: Callable[[], None],
    poll_interval_seconds: float = 0.5,
  ) -> None:
    self.cancel_check = cancel_check
    self.on_cancel = on_cancel
    self.poll_interval_seconds = poll_interval_seconds
    self._last_poll_time = 0.0

  def __call__(self, input_ids, scores, **kwargs) -> bool:
    now = time.monotonic()
    if now - self._last_poll_time < self.poll_interval_seconds:
      return False

    self._last_poll_time = now
    if self.cancel_check():
      self.on_cancel()
      return True

    return False


class HuggingfaceClient:
  def __init__(
    self,
    config,
    model_name: str,
    parameters,
    cancel_check: Callable[[], bool] | None = None,
  ) -> None:
    self.device = best_device()
    print("Device:", self.device)
    self.model_name = model_name
    print("received parameters!", parameters)
    self.parameters = parameters
    self.pipe = None
    self.processor = None
    self.cancel_check = cancel_check
    self._cancellation_requested = False
    self.use_chat_template = False
    self.use_processor_model = False

    if self.device == "mps":
      # Some ops used by generation are still missing on MPS for certain models.
      os.environ.setdefault("PYTORCH_ENABLE_MPS_FALLBACK", "1")

    self._download_model(config)

    set_seed(42)

  def _download_model(self, config) -> None:
    local_dir = snapshot_download(
      repo_id=self.model_name,
      token=config["token"],
      local_files_only=False,
    )

    self.use_processor_model = self._should_use_processor_model()
    if self.use_processor_model:
      self.processor = AutoProcessor.from_pretrained(local_dir, local_files_only=True)
      self.tokenizer = self.processor.tokenizer
    else:
      self.tokenizer = AutoTokenizer.from_pretrained(local_dir, local_files_only=True)

    if self.tokenizer.pad_token is None and self.tokenizer.eos_token is not None:
      self.tokenizer.pad_token = self.tokenizer.eos_token
    self.use_chat_template = self._should_use_chat_template()

    if self.use_processor_model:
      self.model = self._load_processor_model(local_dir)
      self.model.to(self.device)
      self.model.eval()
      return

    if self.device == "cuda":
      self.model = AutoModelForCausalLM.from_pretrained(
        local_dir,
        device_map="auto",
        torch_dtype=torch.float16,
        local_files_only=True,
      )
      self.pipe = TextGenerationPipeline(
        task="text-generation",
        model=self.model,
        tokenizer=self.tokenizer,
        return_full_text=False,
      )
      return

    self.model = self._load_single_device_model(local_dir)
    self.model.to(self.device)
    self.model.eval()

  def _should_use_processor_model(self) -> bool:
    return self.model_name in PROCESSOR_MODELS

  def _load_single_device_model(self, local_dir: str):
    preferred_dtype = torch.float16 if self.device == "mps" else torch.float32

    try:
      return AutoModelForCausalLM.from_pretrained(
        local_dir,
        torch_dtype=preferred_dtype,
        local_files_only=True,
      )
    except Exception as error:
      if self.device != "mps" or preferred_dtype == torch.float32:
        raise

      print(
        f"Failed to load {self.model_name} on MPS with float16: {error}. Retrying with float32."
      )
      return AutoModelForCausalLM.from_pretrained(
        local_dir,
        torch_dtype=torch.float32,
        local_files_only=True,
      )

  def _load_processor_model(self, local_dir: str):
    if self.device in {"cuda", "mps"}:
      preferred_dtype = torch.bfloat16
    else:
      preferred_dtype = torch.float32

    try:
      return AutoModelForImageTextToText.from_pretrained(
        local_dir,
        torch_dtype=preferred_dtype,
        local_files_only=True,
      )
    except Exception as error:
      if self.device != "mps" or preferred_dtype == torch.float32:
        raise

      print(
        f"Failed to load {self.model_name} on MPS with bfloat16: {error}. Retrying with float32."
      )
      return AutoModelForImageTextToText.from_pretrained(
        local_dir,
        torch_dtype=torch.float32,
        local_files_only=True,
      )

  def _should_use_chat_template(self) -> bool:
    if not getattr(self.tokenizer, "chat_template", None):
      return False

    return self.model_name in CHAT_TEMPLATE_MODELS

  def _format_entry(self, prompt: str):
    if not self.use_chat_template:
      return prompt

    messages = [{"role": "user", "content": prompt}]
    return self.tokenizer.apply_chat_template(
      messages,
      add_generation_prompt=True,
      tokenize=False,
    )

  def _build_processor_inputs(self, prompt: str):
    messages = [
      {
        "role": "user",
        "content": [{"type": "text", "text": prompt}],
      }
    ]
    encoded = self.processor.apply_chat_template(
      messages,
      add_generation_prompt=True,
      tokenize=True,
      return_dict=True,
      return_tensors="pt",
    )

    prepared = {}
    for key, value in encoded.items():
      if isinstance(value, torch.Tensor):
        if torch.is_floating_point(value):
          prepared[key] = value.to(self.device, dtype=self.model.dtype)
        else:
          prepared[key] = value.to(self.device)
      else:
        prepared[key] = value

    return prepared

  def _mark_canceled(self) -> None:
    self._cancellation_requested = True

  def _raise_if_canceled(self) -> None:
    if self.cancel_check and self.cancel_check():
      self._mark_canceled()
    if self._cancellation_requested:
      raise InferenceCanceledError("inference was canceled during generation")

  def _build_stopping_criteria(self):
    if self.cancel_check is None:
      return None

    return StoppingCriteriaList(
      [CancelInferenceCriteria(self.cancel_check, self._mark_canceled)]
    )

  @staticmethod
  def _format_parameters(parameters) -> dict:
    param_kwargs = {p["id"]: p["value"] for p in parameters}

    # transformers requires strict primitive types for generation kwargs.
    float_keys = ["temperature", "top_p", "repetition_penalty"]
    int_keys = ["max_new_tokens", "top_k", "num_beams"]

    for key in float_keys:
      if key in param_kwargs and isinstance(param_kwargs[key], (int, float)):
        param_kwargs[key] = float(param_kwargs[key])

    for key in int_keys:
      if key in param_kwargs and isinstance(param_kwargs[key], (int, float)):
        param_kwargs[key] = int(param_kwargs[key])

    return param_kwargs

  @torch.inference_mode()
  def _generate_with_processor(self, prompt: str, generation_kwargs: dict) -> str:
    self._raise_if_canceled()
    encoded = self._build_processor_inputs(prompt)

    generated = self.model.generate(
      **encoded,
      eos_token_id=self.tokenizer.eos_token_id,
      pad_token_id=self.tokenizer.pad_token_id,
      **generation_kwargs,
    )
    if self._cancellation_requested:
      raise InferenceCanceledError("inference was canceled during generation")

    prompt_length = encoded["input_ids"].shape[-1]
    completion = generated[0][prompt_length:]
    return self.processor.decode(completion, skip_special_tokens=True)

  @torch.inference_mode()
  def _generate_single(self, prompt: str, generation_kwargs: dict) -> str:
    self._raise_if_canceled()
    if self.use_chat_template:
      encoded = self.tokenizer.apply_chat_template(
        [{"role": "user", "content": prompt}],
        add_generation_prompt=True,
        return_tensors="pt",
      )
      encoded = {"input_ids": encoded}
      if self.tokenizer.pad_token_id is not None:
        encoded["attention_mask"] = (encoded["input_ids"] != self.tokenizer.pad_token_id).long()
    else:
      encoded = self.tokenizer(prompt, return_tensors="pt")
    encoded = {key: value.to(self.device) for key, value in encoded.items()}

    generated = self.model.generate(
      **encoded,
      eos_token_id=self.tokenizer.eos_token_id,
      pad_token_id=self.tokenizer.pad_token_id,
      **generation_kwargs,
    )
    if self._cancellation_requested:
      raise InferenceCanceledError("inference was canceled during generation")

    prompt_length = encoded["input_ids"].shape[-1]
    completion = generated[0][prompt_length:]
    return self.tokenizer.decode(completion, skip_special_tokens=True)

  def generate(self, entries: list[str]):
    param_kwargs = self._format_parameters(self.parameters)
    stopping_criteria = self._build_stopping_criteria()
    if stopping_criteria is not None:
      param_kwargs["stopping_criteria"] = stopping_criteria

    if self.processor is not None:
      return [self._generate_with_processor(entry, param_kwargs) for entry in entries]

    if self.pipe is not None:
      self._raise_if_canceled()
      prompts = [self._format_entry(entry) for entry in entries]
      result = self.pipe(prompts, **param_kwargs)
      if result is None:
        raise Exception("huggingface inference failed")
      if self._cancellation_requested:
        raise InferenceCanceledError("inference was canceled during generation")
      return [r[0]["generated_text"] for r in result]

    return [self._generate_single(entry, param_kwargs) for entry in entries]
