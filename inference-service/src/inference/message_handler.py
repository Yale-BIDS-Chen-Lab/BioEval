import secrets

import storage.object
from db.queries import inference, config
from inference.huggingface import HuggingfaceClient, InferenceCanceledError
from inference.azure import AzureClient
from storage import duckdb, minio


def get_duckdb_connections(
  inference_id, inference_object_key, dataset_object_key
) -> tuple[duckdb.S3Connection, duckdb.S3Connection]:
  if inference_object_key is None:
    object_key = secrets.token_hex(12) + ".parquet"
    inference_obj_key = storage.object.create_inference(inference_id, object_key)
    con_output = duckdb.S3Connection("inference", inference_obj_key)
  else:
    con_output = duckdb.S3Connection("inference", inference_object_key)
  con_dataset = duckdb.S3Connection("dataset", dataset_object_key)

  return con_dataset, con_output


# TODO: move me
def format_prompt(raw_prompt: str, raw_input: str):
  return raw_prompt.replace("{{input}}", raw_input)


def is_inference_canceled(inference_id: str) -> bool:
  inference_record = inference.get_inference(inference_id)
  return bool(inference_record and inference_record["status"] == "canceled")


def process_dataset(
  con_dataset: duckdb.S3Connection,
  con_output: duckdb.S3Connection,
  client,
  raw_prompt: str,
  inference_id: str,
) -> None:
  # Get total number of examples in dataset
  total_examples = con_dataset.con.sql("SELECT COUNT(*) FROM data").fetchone()[0]
  
  output_count = con_output.con.sql("SELECT COUNT(*) FROM data").fetchone()[0]
  handle = con_dataset.con.execute(
    "SELECT id,input from data ORDER BY id LIMIT ALL OFFSET ?", (output_count,)
  )

  # Initialize progress
  inference.update_inference_progress(inference_id, total_examples, output_count)

  while batch := handle.fetchmany(1):
    # Check if inference was canceled before processing each batch
    inference_record = inference.get_inference(inference_id)
    if inference_record and inference_record["status"] == "canceled":
      print(f"Inference {inference_id} was canceled during processing, stopping...")
      return
    
    inputs = [format_prompt(raw_prompt, row[1]) for row in batch]
    ids = [row[0] for row in batch]

    # Process each example with error handling
    outputs = []
    for idx, input_text in enumerate(inputs):
      try:
        result = client.generate([input_text])
        outputs.append(result[0] if result else None)
      except InferenceCanceledError:
        print(f"Inference {inference_id} was canceled while generating example {ids[idx]}")
        return
      except Exception as e:
        # Record error for this specific example
        error_msg = f"[ERROR: {type(e).__name__}]"
        if "content_filter" in str(e).lower():
          error_msg = "[ERROR: Content filter triggered]"
        elif "rate_limit" in str(e).lower():
          error_msg = "[ERROR: Rate limit exceeded]"
        print(f"Error processing example {ids[idx]}: {type(e).__name__}: {str(e)}")
        outputs.append(error_msg)

    con_output.con.executemany(
      "INSERT INTO data (id, output) VALUES (?, ?)", list(zip(ids, outputs))
    )
    con_output.copy_to_s3()
    
    # Update progress after each batch
    output_count += len(batch)
    inference.update_inference_progress(inference_id, total_examples, output_count)


def handle_inference_message(inference_id: str) -> None:
  print("received new inference", inference_id)
  inference_record = inference.get_inference(inference_id)
  if inference_record is None:
    print("invalid inference")
    return
  if inference_record["status"] == "done":
    return
  if inference_record["status"] == "canceled":
    print("inference was canceled, skipping")
    return

  print(inference_record)

  inference.update_inference_status(inference_id, "processing")

  try:
    con_dataset, con_output = get_duckdb_connections(
      inference_id, inference_record["objectKey"], inference_record["datasetObjectKey"]
    )

    client = None
    config_record = config.get_config(
      inference_record["providerId"], inference_record["userId"]
    )
    if not config_record:
      print("user config is empty")
      inference.update_inference_status(inference_id, "failed")
      return

    print(
      "user integration config for provider {}: {}".format(
        inference_record["providerId"], config_record
      )
    )

    match inference_record["providerId"]:
      case "huggingface":
        client = HuggingfaceClient(
          config_record["settings"],
          inference_record["model"],
          inference_record["parameters"],
          cancel_check=lambda: is_inference_canceled(inference_id),
        )
      case "azure":
        client = AzureClient(
          config_record["settings"],
          inference_record["model"],
          inference_record["parameters"],
        )
      case _:
        raise Exception(
          f"provider {inference_record['providerId']} is not implemented yet"
        )

    if is_inference_canceled(inference_id):
      print(f"Inference {inference_id} was canceled during setup, stopping...")
      return

    process_dataset(
      con_dataset=con_dataset,
      con_output=con_output,
      client=client,
      raw_prompt=inference_record["prompt"],
      inference_id=inference_id,
    )

    # Check status again after processing - don't override if it was canceled
    final_status_check = inference.get_inference(inference_id)
    if final_status_check and final_status_check["status"] != "canceled":
      inference.update_inference_status(inference_id, "done")
  
  except Exception as e:
    import traceback
    print(f"Error during inference {inference_id}: {type(e).__name__}: {str(e)}")
    print(traceback.format_exc())  # Print full traceback without raising
    inference.update_inference_status(inference_id, "failed")
