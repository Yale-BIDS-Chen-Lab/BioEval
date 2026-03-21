import os
from contextlib import contextmanager

import psycopg
from psycopg_pool import ConnectionPool


class DirectConnectionProvider:
  def __init__(self, conninfo: str) -> None:
    self.conninfo = conninfo

  @contextmanager
  def connection(self):
    with psycopg.connect(self.conninfo) as conn:
      yield conn


conninfo = os.environ["DATABASE_URL"]
connection_mode = os.environ.get("BIOEVAL_DB_CONNECTION_MODE", "pool").lower()

if connection_mode == "direct":
  pool = DirectConnectionProvider(conninfo)
else:
  pool = ConnectionPool(
    conninfo,
    min_size=1,
    max_size=4,
    timeout=30.0,
    check=ConnectionPool.check_connection,
  )
