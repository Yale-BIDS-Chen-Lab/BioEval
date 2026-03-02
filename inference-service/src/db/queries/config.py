from ..pool import pool
from psycopg.rows import dict_row


def get_config(provider_id: str, user_id: str):
  with pool.connection() as conn:
    with conn.cursor(row_factory=dict_row) as cur:
      cur.execute(
        """
        SELECT config.settings
        FROM config
        WHERE "providerId" = %s AND "userId" = %s
        """,
        (provider_id, user_id),
      )
      return cur.fetchone()
