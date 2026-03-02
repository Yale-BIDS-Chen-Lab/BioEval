from psycopg.rows import dict_row

from ..pool import pool


def get_evaluation(id: str) -> dict | None:
  with pool.connection() as conn:
    with conn.cursor(row_factory=dict_row) as cur:
      cur.execute(
        """
        SELECT
          evaluation.metrics,evaluation."objectKey",evaluation.status,evaluation."inferenceId",evaluation."parsingFunctions",evaluation."llmJudgeConfig",evaluation."userId",
          inference.status AS "inferenceStatus",inference."objectKey" AS "inferenceObjectKey",inference."taskId",inference."providerId",
          dataset."objectKey" AS "datasetObjectKey", dataset.classes
        FROM evaluation
        JOIN inference on evaluation."inferenceId" = inference."inferenceId"
        LEFT JOIN dataset ON inference."datasetId" = dataset."datasetId"
        WHERE evaluation."evaluationId" = %s
        """,
        (id,),
      )
      result = cur.fetchone()
      
      # Fetch code for parsing functions if any
      if result and result.get("parsingFunctions"):
        parsing_func_ids = [pf["id"] for pf in result["parsingFunctions"]]
        if parsing_func_ids:
          # Get the code for each parsing function
          cur.execute(
            """
            SELECT "funcId", code
            FROM parsing_function
            WHERE "funcId" = ANY(%s)
            """,
            (parsing_func_ids,),
          )
          func_code_map = {row["funcId"]: row["code"] for row in cur.fetchall()}
          result["parsingFuncCodeMap"] = func_code_map
      
      return result


def update_evaluation_status(id: str, status: str) -> None:
  with pool.connection() as conn:
    with conn.cursor(row_factory=dict_row) as cur:
      cur.execute(
        'UPDATE evaluation SET status = %s WHERE "evaluationId" = %s', (status, id)
      )
      conn.commit()


def set_evaluation_object_key(id: str, object_key: str) -> None:
  with pool.connection() as conn:
    with conn.cursor(row_factory=dict_row) as cur:
      cur.execute(
        'UPDATE evaluation SET "objectKey" = %s WHERE "evaluationId" = %s',
        (object_key, id),
      )
      conn.commit()
