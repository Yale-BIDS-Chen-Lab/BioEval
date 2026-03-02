import json
import secrets
from typing import Iterable, Tuple

import numpy as np
import pyarrow

from db.queries import evaluation
from storage import duckdb, object

from .client import EvaluationClient
from .parser import (
    extract_first_character,
    extract_first_word,
    extract_spans,
    process_mcq_option,
    process_mcq_abcde,
    process_mcq_abcd,
    process_mcq_abc,
    process_mcq_yes_no_maybe,
    process_mcq_true_false,
    process_mcq_positive_negative,
    process_mlc_option,
    process_mlc_option_hoc,
    process_mlc_option_litcovid,
)


def get_duckdb_connections(
  evaluation_id, evaluation_object_key, inference_object_key, dataset_object_key
) -> tuple[duckdb.S3Connection, duckdb.S3Connection, duckdb.S3Connection]:
  if evaluation_object_key is None:
    object_key = secrets.token_hex(12) + ".parquet"
    evaluation_obj_key = object.create_evaluation(evaluation_id, object_key)
    con_evaluation = duckdb.S3Connection("evaluation", evaluation_obj_key)
  else:
    con_evaluation = duckdb.S3Connection("evaluation", evaluation_object_key)

  con_inference = duckdb.S3Connection("inference", inference_object_key)
  con_dataset = duckdb.S3Connection("dataset", dataset_object_key)

  return con_evaluation, con_inference, con_dataset


def get_parsing_function(function_id, custom_code=None):
  # If custom code is provided, dynamically execute it to define a `parse` function.
  if custom_code:
    try:
      namespace = {}
      exec(custom_code, namespace)
      if "parse" in namespace and callable(namespace["parse"]):
        return namespace["parse"]
      else:
        print(f"Custom function {function_id} does not define a 'parse' function")
        return lambda x, _: x
    except Exception as e:
      print(f"Error executing custom function {function_id}: {e}")
      return lambda x, _: x
  
  # Built-in functions
  match function_id:
    case "extract_first_word":
      return extract_first_word
    case "extract_first_character":
      return extract_first_character
    case "process_mcq_option":
      return process_mcq_option
    case "process_mcq_abcde":
      return process_mcq_abcde
    case "process_mcq_abcd":
      return process_mcq_abcd
    case "process_mcq_abc":
      return process_mcq_abc
    case "process_mcq_yes_no_maybe":
      return process_mcq_yes_no_maybe
    case "process_mcq_true_false":
      return process_mcq_true_false
    case "process_mcq_positive_negative":
      return process_mcq_positive_negative
    case "process_mlc_option":
      return process_mlc_option
    case "process_mlc_option_hoc":
      return process_mlc_option_hoc
    case "process_mlc_option_litcovid":
      return process_mlc_option_litcovid
    # case "extract_spans":
    #   return extract_spans
    case _:
      print(f"sorry, parsing function {function_id} not implemented")
      return lambda x, _: x


# TODO: move this and handle nones
def apply_parsing(inputs: list[str], parsing_functions, parsing_func_code_map=None) -> list[str]:
  parsed_inputs = [x for x in inputs]

  for function in parsing_functions:
    arguments_map = {item["id"]: item["value"] for item in function["arguments"]}
    func_id = function["id"]
    
    # Check if this is a custom function with code
    custom_code = None
    if parsing_func_code_map and func_id in parsing_func_code_map:
      custom_code = parsing_func_code_map[func_id]
    
    parsing_function = get_parsing_function(func_id, custom_code)
    parsed_inputs = [parsing_function(x, arguments_map) for x in parsed_inputs]

  return parsed_inputs


def apply_parsing_span(inputs: list[str]):
  parsed_spans = []
  for sentence_html in inputs:
    spans = extract_spans(sentence_html, None)
    spans.sort(key=lambda s: (s[0], s[1]))
    parsed_spans.append(spans)

  return parsed_spans


def normalize_span_labels(spans_list):
  """Normalize entity labels to lowercase for case-insensitive comparison."""
  normalized = []
  for spans in spans_list:
    normalized_spans = []
    for span in spans:
      # span is [start, end, label]
      normalized_spans.append([span[0], span[1], span[2].lower()])
    normalized.append(normalized_spans)
  return normalized


def _parse_label_list(text: str) -> Tuple[str, ...]:
  text = text.strip()
  if not text:
    return tuple()

  # Auto-detect delimiter: semicolon, comma, or pipe
  for sep in [";", ",", "|"]:
    if sep in text:
      return tuple(s.strip() for s in text.split(sep) if s.strip())

  return (text,)


def apply_parsing_mlc(
  inputs: list[str],
  classes: list[str],
) -> list[np.ndarray]:
  # Build case-insensitive mapping (classes are already lowercase in DB)
  class_to_idx = {lab.lower(): i for i, lab in enumerate(classes)}
  n_classes = len(classes)
  one_hot_vectors: list[np.ndarray] = []

  for txt in inputs:
    vec = np.zeros(n_classes, dtype=int)
    for lab in _parse_label_list(txt):
      # Convert to lowercase for case-insensitive matching
      idx = class_to_idx.get(lab.lower())
      if idx is not None:
        vec[idx] = 1
    one_hot_vectors.append(vec)

  return one_hot_vectors


def process_evaluation(
  evaluation_record,
  con_evaluation: duckdb.S3Connection,
  con_inference: duckdb.S3Connection,
  con_dataset: duckdb.S3Connection,
  evaluation_client: EvaluationClient,
) -> None:
  task_id = evaluation_record["taskId"]
  is_ner = task_id == "ner"
  is_mlc = task_id == "mlc"

  evaluation_row_count = con_evaluation.con.execute(
    "SELECT COALESCE(SUM(len(rows)), 0) FROM data"
  ).fetchone()[0]
  has_wrapper_row = (
    con_evaluation.con.execute("SELECT COUNT(*) FROM data").fetchone()[0] > 0
  )

  dataset_handle = con_dataset.con.execute(
    "SELECT id,reference FROM data ORDER BY id LIMIT ALL OFFSET ?",
    (evaluation_row_count,),
  )
  inference_handle = con_inference.con.execute(
    "SELECT id,output FROM data ORDER BY id LIMIT ALL OFFSET ?", (evaluation_row_count,)
  )

  print("row count", evaluation_row_count)

  # ideally batch sizes should depend on the task
  while True:
    dataset_batch = dataset_handle.fetchmany(100)
    inference_batch = inference_handle.fetchmany(100)
    if not inference_batch:
      break

    if len(inference_batch) != len(dataset_batch):
      print("mismatch between inference and dataset sizes")
      break

    dataset_ids, references = zip(*dataset_batch)
    inference_ids, predictions = zip(*inference_batch)
    if inference_ids != dataset_ids:
      print("mismatch between inference and dataset ids")
      break

    # Save original predictions before parsing
    original_predictions = predictions

    # Parse all predictions (including error messages)
    parsing_functions = evaluation_record.get("parsingFunctions", [])
    parsing_func_code_map = evaluation_record.get("parsingFuncCodeMap", {})
    
    # Auto-apply default parsing for MLC tasks if no parsing functions provided
    if not parsing_functions and is_mlc and evaluation_record.get("classes"):
      # Automatically use process_mlc_option with dataset classes
      parsing_functions = [{
        "id": "process_mlc_option",
        "arguments": [
          {"id": "labels", "value": ",".join(evaluation_record["classes"])},
          {"id": "delimiter", "value": ","}
        ]
      }]
    
    # Apply parsing to all predictions (including errors)
    predictions = apply_parsing(list(predictions), parsing_functions, parsing_func_code_map)
    
    if is_ner:
      predictions_parsed = apply_parsing_span(list(predictions))
      references_parsed = [json.loads(r) for r in references]
      # Normalize labels to lowercase for case-insensitive matching
      predictions_parsed = normalize_span_labels(predictions_parsed)
      references_parsed = normalize_span_labels(references_parsed)
    elif is_mlc:
      # For MLC: keep predictions (semicolon-separated strings) for display
      # Convert to one-hot vectors for metric calculation AND storage
      predictions_for_display = predictions  # Human-readable labels
      predictions_parsed = apply_parsing_mlc(
        list(predictions), evaluation_record["classes"]
      )
      references_parsed = apply_parsing_mlc(
        list(references), evaluation_record["classes"]
      )
    else:
      predictions_parsed = predictions
      references_parsed = list(references)

    # Calculate metrics for all samples (including errors)
    metrics = evaluation_client.calculate_individual_metrics(
      predictions=predictions_parsed, references=references_parsed
    )
    metrics_dict = {id: score for id, score in metrics if score is not None}

    # Prepare inserts for all samples
    inserts = []
    
    for i, row_id in enumerate(dataset_ids):
      row_metrics = {
        metric: float(scores[i]) for metric, scores in metrics_dict.items()
      }
      # For MLC, store human-readable labels instead of one-hot vectors
      if is_mlc:
        insert = predictions_for_display[i]
        # Also store the vectors for display purposes
        insert_dict = {
          "id": row_id,
          "metrics": row_metrics,
          "parsed": insert,
          "parsedVector": predictions_parsed[i].tolist(),
          "referenceVector": references_parsed[i].tolist(),
        }
        inserts.append(insert_dict)
        continue
      else:
        insert = (
          predictions_parsed[i].tolist()
          if isinstance(predictions_parsed[i], np.ndarray)
          else predictions_parsed[i]
        )

      insert = insert if type(insert) is str else json.dumps(insert)

      inserts.append(
        {
          "id": row_id,
          "metrics": row_metrics,
          "parsed": insert,
          "parsedVector": None,
          "referenceVector": None,
        }
      )

    batch_table = pyarrow.Table.from_pylist(
      [{"rows": inserts, "aggregate": {}}],
      schema=object.evaluation_schema,
    )
    con_evaluation.con.register("batch", batch_table)

    if not has_wrapper_row:
      con_evaluation.con.execute("INSERT INTO data SELECT * FROM batch")
      has_wrapper_row = True
    else:
      con_evaluation.con.execute(
        "UPDATE data SET rows = list_concat(data.rows, batch.rows) FROM batch"
      )

    con_evaluation.con.unregister("batch")
    con_evaluation.copy_to_s3()

  ref_handle = con_dataset.con.execute(
    "SELECT id, reference FROM data ORDER BY id"
  ).fetchall()
  pred_handle = con_inference.con.execute(
    "SELECT id, output FROM data ORDER BY id"
  ).fetchall()

  # Process all samples for aggregate metric calculation (including errors)
  all_ids = [row[0] for row in ref_handle]
  references = [row[1] for row in ref_handle]
  predictions = [row[1] for row in pred_handle]

  if is_ner:
    predictions_parsed = apply_parsing_span(list(predictions))
    references_parsed = [json.loads(r) for r in references]
    # Normalize labels to lowercase for case-insensitive matching
    predictions_parsed = normalize_span_labels(predictions_parsed)
    references_parsed = normalize_span_labels(references_parsed)
  elif is_mlc:
    predictions_parsed = apply_parsing_mlc(
      list(predictions), evaluation_record["classes"]
    )
    references_parsed = apply_parsing_mlc(
      list(references), evaluation_record["classes"]
    )
  else:
    # For aggregate calculation, use the same parsing logic
    parsing_functions = evaluation_record.get("parsingFunctions", [])
    
    # Auto-apply default parsing for MLC tasks if no parsing functions provided
    if not parsing_functions and is_mlc and evaluation_record.get("classes"):
      parsing_functions = [{
        "id": "process_mlc_option",
        "arguments": [
          {"id": "labels", "value": ",".join(evaluation_record["classes"])},
          {"id": "delimiter", "value": ","}
        ]
      }]
    
    predictions_parsed = apply_parsing(list(predictions), parsing_functions)
    references_parsed = list(references)

  metrics = evaluation_client.calculate_aggregate_metrics(
    predictions=predictions_parsed, references=references_parsed
  )

  individual_rows = dict(
    con_evaluation.con.execute("""
    SELECT 
      key,
      list(value::DOUBLE)
    FROM (
      SELECT metrics
      FROM data
      JOIN (
        SELECT
          unnest(data.rows).metrics as metrics
        FROM data
      ) AS unnested ON TRUE
    ),
    json_each(metrics) AS je(key, value)
    GROUP BY key
  """).fetchall()
  )

  # FIXME: temporary
  metrics_dict = {}
  for metric, value in metrics:
    if value is None:
      if not individual_rows.get(metric):
        print("warning! aggregate metric {} is missing individual rows".format(metric))
        continue
      metrics_dict[metric] = np.mean(individual_rows[metric])
    else:
      metrics_dict[metric] = float(value)

  batch_table = pyarrow.Table.from_pylist(
    [{"aggregate": metrics_dict}],
    schema=pyarrow.schema(
      [pyarrow.field("aggregate", pyarrow.map_(pyarrow.string(), pyarrow.float32()))]
    ),
  )

  con_evaluation.con.register("batch", batch_table)
  con_evaluation.con.execute("UPDATE data SET aggregate = batch.aggregate FROM batch")
  con_evaluation.con.unregister("batch")

  con_evaluation.copy_to_s3()


def handle_evaluation_message(evaluation_id: str) -> None:
  print("received new evaluation", evaluation_id)
  evaluation_record = evaluation.get_evaluation(evaluation_id)
  if evaluation_record is None:
    print("invalid evaluation")
    return
  if (
    evaluation_record["status"] == "done"
    or evaluation_record["inferenceStatus"] != "done"
  ):
    return

  print(evaluation_record)

  evaluation.update_evaluation_status(evaluation_id, "processing")

  try:
    # FIXME: this is prone to race conditions
    con_evaluation, con_inference, con_dataset = get_duckdb_connections(
      evaluation_id,
      evaluation_record["objectKey"],
      evaluation_record["inferenceObjectKey"],
      evaluation_record["datasetObjectKey"],
    )
    
    # Get Azure OpenAI config for LLM judge (only if needed)
    openai_api_key = None
    azure_config = None
    llm_judge_configs = evaluation_record.get("llmJudgeConfig", {})
    
    if any(m.startswith("llm_judge_") for m in evaluation_record["metrics"]):
      from db.queries import config
      azure_config_record = config.get_config("azure", evaluation_record["userId"])
      if azure_config_record:
        azure_config = azure_config_record["settings"]
        openai_api_key = azure_config["apiKey"]
    
    evaluation_client = EvaluationClient(evaluation_record["metrics"], openai_api_key, azure_config, llm_judge_configs)

    process_evaluation(
      evaluation_record,
      con_evaluation=con_evaluation,
      con_inference=con_inference,
      con_dataset=con_dataset,
      evaluation_client=evaluation_client,
    )

    evaluation.update_evaluation_status(evaluation_id, "done")
  
  except Exception as e:
    import traceback
    print(f"Error during evaluation {evaluation_id}: {type(e).__name__}: {str(e)}")
    print(traceback.format_exc())  # Print full traceback without raising
    evaluation.update_evaluation_status(evaluation_id, "failed")
