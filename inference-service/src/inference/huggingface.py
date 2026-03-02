import torch
from huggingface_hub import snapshot_download
from transformers.models import AutoModelForCausalLM, AutoTokenizer
from transformers.pipelines.text_generation import TextGenerationPipeline
from transformers.trainer_utils import set_seed


class HuggingfaceClient:
  def __init__(self, config, model_name: str, parameters) -> None:
    device = "cuda" if torch.cuda.is_available() else "cpu"
    print("Device:", device)
    self.model_name = model_name
    print("received parameters!", parameters)
    self.parameters = parameters
    self._download_model(config)

    set_seed(42)

  def _download_model(self, config) -> None:
    local_dir = snapshot_download(
      repo_id=self.model_name,
      token=config["token"],
      local_files_only=False,
    )

    dtype = torch.float16 if torch.cuda.is_available() else torch.float32
    self.model = AutoModelForCausalLM.from_pretrained(
      local_dir, device_map="auto", torch_dtype=dtype, local_files_only=True
    )
    self.tokenizer = AutoTokenizer.from_pretrained(local_dir, local_files_only=True)

  def generate(self, entries: list[str]):
    param_kwargs = {p["id"]: p["value"] for p in self.parameters}
    
    # Convert numeric parameters to float for transformers compatibility
    # transformers library requires strict float types for penalty parameters
    for key in ["temperature", "top_p", "repetition_penalty"]:
      if key in param_kwargs and isinstance(param_kwargs[key], (int, float)):
        param_kwargs[key] = float(param_kwargs[key])

    pipe = TextGenerationPipeline(
      task="text-generation",
      model=self.model,
      tokenizer=self.tokenizer,
      return_full_text=False,
    )

    result = pipe(entries, **param_kwargs)
    if result is None:
      raise Exception("huggingface inference failed")

    result = [r[0]["generated_text"] for r in result]
    return result
