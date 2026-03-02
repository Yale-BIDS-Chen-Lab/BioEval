from psycopg.rows import dict_row

from ..pool import pool


def get_inference(id: str) -> dict | None:
  with pool.connection() as conn:
    with conn.cursor(row_factory=dict_row) as cur:
      cur.execute(
        """
        SELECT 
          inference."providerId",inference.model,inference.prompt,inference.status,inference."objectKey",inference.parameters,inference."userId",
          dataset."objectKey" AS "datasetObjectKey"
        FROM inference
        LEFT JOIN dataset ON inference."datasetId" = dataset."datasetId"
        WHERE "inferenceId" = %s
        """,
        (id,),
      )
      return cur.fetchone()


def update_inference_status(id: str, status: str) -> None:
  with pool.connection() as conn:
    with conn.cursor(row_factory=dict_row) as cur:
      cur.execute(
        'UPDATE inference SET status = %s WHERE "inferenceId" = %s', (status, id)
      )
      conn.commit()


def set_inference_object_key(id: str, object_key: str) -> None:
  with pool.connection() as conn:
    with conn.cursor(row_factory=dict_row) as cur:
      cur.execute(
        'UPDATE inference SET "objectKey" = %s WHERE "inferenceId" = %s',
        (object_key, id),
      )
      conn.commit()


def update_inference_progress(id: str, total: int, processed: int) -> None:
  with pool.connection() as conn:
    with conn.cursor(row_factory=dict_row) as cur:
      cur.execute(
        'UPDATE inference SET "totalExamples" = %s, "processedExamples" = %s WHERE "inferenceId" = %s',
        (total, processed, id),
      )
      conn.commit()
