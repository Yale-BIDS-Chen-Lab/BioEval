from typing import Any, Callable, Iterable, Literal

import numpy as np
from numpy.typing import NDArray
from sklearn.metrics import f1_score, precision_recall_fscore_support


def _stack_one_hot(batch: NDArray[Any]) -> np.ndarray:
  if len(batch) > 0 and batch.dtype.type is np.str_:
    # Normalize strings to lowercase for case-insensitive comparison
    return np.array([s.lower().strip() if isinstance(s, str) else s for s in batch])

  # If already a 2D int/bool array, return as-is
  if batch.ndim == 2 and batch.dtype in [np.int64, np.int32, np.bool_, int]:
    return np.asarray(batch, dtype=int)

  batch = np.asarray(batch, dtype=object).ravel()

  if batch.ndim == 1 and batch.size and not isinstance(batch[0], (list, np.ndarray)):
    batch = np.array([batch], dtype=int)

  if batch.dtype == object:
    rows = [np.asarray(x, dtype=int).ravel() for x in batch]
    return np.stack(rows).astype(int)

  return np.asarray(batch, dtype=int)


def macro_f1(a: NDArray[Any], b: NDArray[Any]):
  y_pred = _stack_one_hot(a)
  y_true = _stack_one_hot(b)
  return f1_score(y_true, y_pred, average="macro", zero_division=0)


def weighted_f1(a: NDArray[Any], b: NDArray[Any]):
  y_pred = _stack_one_hot(a)
  y_true = _stack_one_hot(b)
  return f1_score(y_true, y_pred, average="weighted", zero_division=0)


def exact_match(variant: Literal["precision", "recall", "f1"]) -> Callable:
  def _to_tuple_set(arr: Iterable[Any]) -> set[tuple]:
    return {tuple(x) for x in arr}

  def compute(predictions: NDArray[Any], references: NDArray[Any]):
    print("exact match computation", predictions, references)

    preds = np.asarray(predictions, dtype=object).ravel()
    refs = np.asarray(references, dtype=object).ravel()

    label_set: set[tuple] = set()
    for sample in np.concatenate([preds, refs]):
      if sample:
        label_set.update(tuple(span) for span in sample)

    label_list = list(label_set)
    idx = {lab: i for i, lab in enumerate(label_list)}

    n_samples = max(len(preds), len(refs))
    n_labels = len(label_list)

    y_pred = np.zeros((n_samples, n_labels), dtype=int)
    y_true = np.zeros((n_samples, n_labels), dtype=int)

    for i in range(n_samples):
      pred_spans = preds[i] if i < len(preds) else []
      for span in pred_spans:
        y_pred[i, idx[tuple(span)]] = 1

    for i in range(n_samples):
      ref_spans = refs[i] if i < len(refs) else []
      for span in ref_spans:
        y_true[i, idx[tuple(span)]] = 1

    print("computing exact match", y_true, y_pred)

    precision, recall, f1, _ = precision_recall_fscore_support(
      y_true,
      y_pred,
      average="micro",
      zero_division=0,
    )

    return {"precision": precision, "recall": recall, "f1": f1}[variant]

  return compute
