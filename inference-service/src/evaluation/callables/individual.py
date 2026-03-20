from typing import Any, Literal

import evaluate
import numpy as np
import torch
from numpy.typing import NDArray

from ..libs.bartscore import BARTScorer

# Singleton instances — loaded lazily on first use to avoid loading all models at startup.
_bartscore_instance = None
_bertscore_instance = None
_rouge_instance = None
_meteor_instance = None
_metric_device = None


def get_metric_device() -> str:
  """Pick the best available device for metric models."""
  global _metric_device
  if _metric_device is not None:
    return _metric_device

  if torch.cuda.is_available():
    _metric_device = "cuda"
  elif hasattr(torch.backends, "mps") and torch.backends.mps.is_available():
    _metric_device = "mps"
  else:
    _metric_device = "cpu"

  return _metric_device


def accuracy(a: NDArray[Any], b: NDArray[Any]):
  res = []
  for i in range(len(a)):
    try:
      if isinstance(a[i], np.ndarray):
        res.append(int(np.array_equal(a[i], b[i])))
      else:
        # Case-insensitive comparison for strings
        pred = a[i].lower().strip() if isinstance(a[i], str) else a[i]
        ref = b[i].lower().strip() if isinstance(b[i], str) else b[i]
        res.append(int(pred == ref))
    except Exception as e:
      print(f"Accuracy error for sample {i}: {e}, returning 0")
      res.append(0)
  return res


# https://huggingface.co/spaces/evaluate-metric/bertscore
def bertscore(a: NDArray[Any], b: NDArray[Any]):
  global _bertscore_instance
  device = get_metric_device()
  
  if _bertscore_instance is None:
    print("Initializing BERTScore model...")
    _bertscore_instance = evaluate.load("bertscore")
    print("BERTScore model loaded successfully")

  predictions = [str(x) if x is not None else "" for x in a.tolist()]
  references = [str(x) if x is not None else "" for x in b.tolist()]
  
  try:
    results = _bertscore_instance.compute(
      predictions=predictions,
      references=references,
      model_type="bert-base-multilingual-cased",
      device=device,
    )
    if results is None:
      return np.zeros(len(a), dtype=float)  # Return 0.0 for all samples on failure

    row = np.asarray(results["f1"], dtype=float)
    return row
  except Exception as e:
    if device != "cpu":
      print(f"BERTScore failed on {device}: {e}. Retrying on CPU...")
      try:
        results = _bertscore_instance.compute(
          predictions=predictions,
          references=references,
          model_type="bert-base-multilingual-cased",
          device="cpu",
        )
        if results is None:
          return np.zeros(len(a), dtype=float)
        row = np.asarray(results["f1"], dtype=float)
        return row
      except Exception as retry_error:
        print(
          f"BERTScore retry on CPU failed: {retry_error}, returning zeros for {len(a)} samples"
        )
        return np.zeros(len(a), dtype=float)

    print(f"BERTScore error: {e}, returning zeros for {len(a)} samples")
    return np.zeros(len(a), dtype=float)


# https://github.com/neulab/BARTScore
# TODO: checkpoint should be a configurable parameter rather than hard-coded
def bartscore(a: NDArray[Any], b: NDArray[Any]):
  global _bartscore_instance
  device = get_metric_device()
  
  if _bartscore_instance is None:
    print(f"Initializing BARTScore model on {device} (this happens only once)...")
    _bartscore_instance = BARTScorer(device=device, checkpoint="facebook/bart-large-cnn")
    print("BARTScore model loaded successfully")
  
  try:
    results = _bartscore_instance.score(srcs=list(a), tgts=list(b), batch_size=8)

    row = np.asarray(results, dtype=float)
    return row
  except Exception as e:
    if device != "cpu":
      print(f"BARTScore failed on {device}: {e}. Retrying on CPU...")
      try:
        _bartscore_instance = BARTScorer(
          device="cpu", checkpoint="facebook/bart-large-cnn"
        )
        results = _bartscore_instance.score(srcs=list(a), tgts=list(b), batch_size=8)
        row = np.asarray(results, dtype=float)
        return row
      except Exception as retry_error:
        print(
          f"BARTScore retry on CPU failed: {retry_error}, returning zeros for {len(a)} samples"
        )
        return np.zeros(len(a), dtype=float)

    print(f"BARTScore error: {e}, returning zeros for {len(a)} samples")
    return np.zeros(len(a), dtype=float)


# https://huggingface.co/spaces/evaluate-metric/rouge
def rouge(variant: Literal["rouge1", "rouge2", "rougeL"]):
  def compute(
    a: NDArray[Any],
    b: NDArray[Any],
  ):
    global _rouge_instance
    
    if _rouge_instance is None:
      print("Initializing ROUGE scorer...")
      _rouge_instance = evaluate.load("rouge")
      print("ROUGE scorer loaded successfully")
    
    try:
      results = _rouge_instance.compute(predictions=a, references=b, use_aggregator=False)
      if results is None:
        return np.zeros(len(a), dtype=float)

      row = np.asarray(results[variant], dtype=float)
      return row
    except Exception as e:
      print(f"ROUGE error: {e}, returning zeros for {len(a)} samples")
      return np.zeros(len(a), dtype=float)

  return compute


# https://huggingface.co/spaces/evaluate-metric/meteor
def meteor(a: NDArray[Any], b: NDArray[Any]):
  global _meteor_instance
  
  if _meteor_instance is None:
    print("Initializing METEOR scorer...")
    _meteor_instance = evaluate.load("src/evaluation/libs/meteor.py")
    print("METEOR scorer loaded successfully")
  
  try:
    results = _meteor_instance.compute(predictions=a, references=b)
    if results is None:
      return np.zeros(len(a), dtype=float)

    row = np.asarray(results["meteor"], dtype=float)
    return row
  except Exception as e:
    print(f"METEOR error: {e}, returning zeros for {len(a)} samples")
    return np.zeros(len(a), dtype=float)
