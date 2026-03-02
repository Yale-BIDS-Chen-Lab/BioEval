import os

from psycopg_pool import ConnectionPool

pool = ConnectionPool(os.environ["DATABASE_URL"])
