from typing import Any, Callable, Optional, Dict

import numpy as np
from numpy.typing import NDArray

from .callables.aggregate import (
  exact_match,
  macro_f1,
  weighted_f1,
)
from .callables.individual import (
  accuracy,
  bartscore,
  bertscore,
  meteor,
  rouge,
)
from .callables.llm_judge import llm_judge_metric


class EvaluationClient:
  def __init__(self, metric_ids: list[str], openai_api_key: Optional[str] = None, azure_config: Optional[Dict[str, str]] = None, llm_judge_configs: Optional[Dict[str, Any]] = None) -> None:
    self.metric_ids = metric_ids
    self.openai_api_key = openai_api_key
    self.azure_config = azure_config
    self.llm_judge_configs = llm_judge_configs or {}
    self._individual_callables = [
      (metric_id, self._generate_individual_callables(metric_id))
      for metric_id in metric_ids
    ]
    self._aggregate_callables = [
      (metric_id, self._generate_aggregate_callables(metric_id))
      for metric_id in metric_ids
    ]

  def _generate_individual_callables(
    self, metric_id: str
  ) -> Callable[[NDArray[Any], NDArray[Any]], Any | None] | None:
    match metric_id:
      case (
        "macro_f1"
        | "weighted_f1"
        | "exact_match_precision"
        | "exact_match_recall"
        | "exact_match_f1"
        | "human_evaluation"
      ):
        return None
      case "accuracy":
        return accuracy
      case "bertscore":
        return bertscore
      case "bartscore":
        return bartscore
      case "rouge1":
        return rouge("rouge1")
      case "rouge2":
        return rouge("rouge2")
      case "rougeL":
        return rouge("rougeL")
      case "meteor":
        return meteor
      case "llm_judge_correctness":
        return llm_judge_metric("correctness", self.openai_api_key, self.azure_config, self.llm_judge_configs.get(metric_id, {}))
      case "llm_judge_completeness":
        return llm_judge_metric("completeness", self.openai_api_key, self.azure_config, self.llm_judge_configs.get(metric_id, {}))
      case "llm_judge_relevance":
        return llm_judge_metric("relevance", self.openai_api_key, self.azure_config, self.llm_judge_configs.get(metric_id, {}))
      case _:
        print(
          "sorry, individual calculation for metric {} not implemented yet".format(
            metric_id
          )
        )
        return None

  def _generate_aggregate_callables(
    self, metric_id: str
  ) -> Callable[[NDArray[Any], NDArray[Any]], Any] | None:
    match metric_id:
      case (
        "accuracy"
        | "bertscore"
        | "bartscore"
        | "rouge1"
        | "rouge2"
        | "rougeL"
        | "meteor"
        | "llm_judge_correctness"
        | "llm_judge_completeness"
        | "llm_judge_relevance"
        | "human_evaluation"
      ):
        return None
      case "macro_f1":
        return macro_f1
      case "weighted_f1":
        return weighted_f1
      case "exact_match_precision":
        return exact_match("precision")
      case "exact_match_recall":
        return exact_match("recall")
      case "exact_match_f1":
        return exact_match("f1")
      case _:
        print(
          "sorry, aggregate calculation for metric {} not implemented yet".format(
            metric_id
          )
        )
        return None

  def calculate_individual_metrics(
    self, predictions: list[str], references: list[str]
  ) -> list[tuple[str, tuple[NDArray[Any], Any] | None]]:
    parsed_preds = self._to_metric_array(predictions)
    parsed_refs = self._to_metric_array(references)

    metrics = []
    for metric_id, callable in self._individual_callables:
      result = None if callable is None else callable(parsed_preds, parsed_refs)
      metrics.append((metric_id, result))

    return metrics

  def calculate_aggregate_metrics(
    self, predictions: list[str], references: list[str]
  ) -> list[tuple[str, float]]:
    parsed_preds = self._to_metric_array(predictions)
    parsed_refs = self._to_metric_array(references)

    metrics = []
    for metric_id, callable in self._aggregate_callables:
      result = None if callable is None else callable(parsed_preds, parsed_refs)
      metrics.append((metric_id, result))

    return metrics

  @staticmethod
  def _to_metric_array(values: list[Any]) -> NDArray[Any]:
    try:
      return np.asarray(values)
    except ValueError:
      # Structured predictions such as NER span lists are ragged by design.
      return np.asarray(values, dtype=object)
