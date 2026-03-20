import os
import duckdb as duckdb

access_key = os.environ["MINIO_ROOT_USER"]
secret_key = os.environ["MINIO_ROOT_PASSWORD"]
s3_region = os.getenv("S3_REGION", "us-east-1")
s3_url_style = os.getenv("S3_URL_STYLE", "path")
s3_endpoint = os.getenv("S3_ENDPOINT", "minio:9000")
s3_use_ssl = os.getenv("S3_USE_SSL", "false").lower() in ("1", "true", "yes", "on")


def s3_path(bucket: str, object_key: str) -> str:
  return "s3://{}/{}".format(bucket, object_key)


class S3Connection:
  def __init__(self, bucket: str, object_key: str) -> None:
    self.bucket = bucket
    self.object_key = object_key
    self.s3_path = s3_path(bucket, object_key)
    self.con = self._connect()

  # TODO: cache extensions?
  def _connect(self) -> duckdb.DuckDBPyConnection:
    con = duckdb.connect()
    con.execute("INSTALL httpfs;")
    con.execute("LOAD httpfs;")

    con.execute(f"SET s3_access_key_id='{access_key}';")
    con.execute(f"SET s3_secret_access_key='{secret_key}';")
    con.execute(f"SET s3_region='{s3_region}';")
    con.execute(f"SET s3_url_style='{s3_url_style}';")
    con.execute(f"SET s3_endpoint='{s3_endpoint}';")
    con.execute(f"SET s3_use_ssl = {'true' if s3_use_ssl else 'false'};")

    con.execute(f"CREATE TEMP TABLE data AS SELECT * FROM '{self.s3_path}';")
    return con

  def copy_to_s3(self):
    self.con.execute(f"COPY data TO '{self.s3_path}'")
