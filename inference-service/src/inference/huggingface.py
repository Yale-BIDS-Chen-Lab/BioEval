import os
import time
from typing import Callable

import torch
from huggingface_hub import snapshot_download
from transformers import StoppingCriteria, StoppingCriteriaList
from transformers.models import AutoModelForCausalLM, AutoTokenizer
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
    self.cancel_check = cancel_check
    self._cancellation_requested = False

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

    self.tokenizer = AutoTokenizer.from_pretrained(local_dir, local_files_only=True)
    if self.tokenizer.pad_token is None and self.tokenizer.eos_token is not None:
      self.tokenizer.pad_token = self.tokenizer.eos_token

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
  def _generate_single(self, prompt: str, generation_kwargs: dict) -> str:
    self._raise_if_canceled()
    encoded = self.tokenizer(prompt, return_tensors="pt")
    encoded = {key: value.to(self.device) for key, value in encoded.items()}

    generated = self.model.generate(
      **encoded,
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

    if self.pipe is not None:
      self._raise_if_canceled()
      result = self.pipe(entries, **param_kwargs)
      if result is None:
        raise Exception("huggingface inference failed")
      if self._cancellation_requested:
        raise InferenceCanceledError("inference was canceled during generation")
      return [r[0]["generated_text"] for r in result]

    return [self._generate_single(entry, param_kwargs) for entry in entries]
