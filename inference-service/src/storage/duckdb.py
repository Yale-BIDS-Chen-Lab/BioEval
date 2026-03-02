import os
import duckdb as duckdb

access_key = os.environ["MINIO_ROOT_USER"]
secret_key = os.environ["MINIO_ROOT_PASSWORD"]


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
    con.execute("SET s3_region='us-east-1';")
    con.execute("SET s3_url_style='path'")
    con.execute("SET s3_endpoint='minio:9000';")
    con.execute("SET s3_use_ssl = false;")

    con.execute(f"CREATE TEMP TABLE data AS SELECT * FROM '{self.s3_path}';")
    return con

  def copy_to_s3(self):
    self.con.execute(f"COPY data TO '{self.s3_path}'")
