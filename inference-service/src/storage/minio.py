import io
import os

import boto3
import botocore.exceptions
import pyarrow
import pyarrow.parquet


def resolve_endpoint_url() -> str:
  if endpoint_url := os.getenv("S3_ENDPOINT_URL"):
    return endpoint_url

  endpoint = os.getenv("S3_ENDPOINT", "minio:9000")
  use_ssl = os.getenv("S3_USE_SSL", "false").lower() in ("1", "true", "yes", "on")
  scheme = "https" if use_ssl else "http"
  return f"{scheme}://{endpoint}"


client = boto3.client(
  service_name="s3",
  endpoint_url=resolve_endpoint_url(),
  aws_access_key_id=os.environ["MINIO_ROOT_USER"],
  aws_secret_access_key=os.environ["MINIO_ROOT_PASSWORD"],
)


def object_exists(bucket: str, object_key: str) -> bool:
  try:
    client.head_object(Bucket=bucket, Key=object_key)
  except botocore.exceptions.ClientError as e:
    if e.response["Error"]["Code"] == "404":
      return False
    if e.response["Error"]["Code"] == "403":
      print("unauthorized to access {}/{}".format(bucket, object_key))
    return False
  return True


# TODO: handle exceptions
def create_object(bucket: str, object_key: str, schema):
  table = pyarrow.Table.from_arrays(
    [pyarrow.array([], type=field.type) for field in schema],
    names=[field.name for field in schema],
  )

  buffer = io.BytesIO()
  pyarrow.parquet.write_table(table, buffer)
  buffer.seek(0)

  client.put_object(Bucket=bucket, Key=object_key, Body=buffer.getvalue())
