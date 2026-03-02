import pyarrow

from db.queries.evaluation import set_evaluation_object_key
from db.queries.inference import set_inference_object_key

from . import minio

inference_schema = pyarrow.schema(
  [("id", pyarrow.string()), ("output", pyarrow.string())]
)


def create_inference(inference_id: str, object_key: str) -> str:
  minio.create_object("inference", object_key, inference_schema)
  set_inference_object_key(inference_id, object_key)
  return object_key


evaluation_row_schema = pyarrow.struct(
  [
    pyarrow.field("id", pyarrow.string()),
    pyarrow.field("parsed", pyarrow.string()),
    pyarrow.field("metrics", pyarrow.map_(pyarrow.string(), pyarrow.float32())),
    pyarrow.field("parsedVector", pyarrow.list_(pyarrow.int64()), nullable=True),
    pyarrow.field("referenceVector", pyarrow.list_(pyarrow.int64()), nullable=True),
  ]
)

evaluation_schema = pyarrow.schema(
  [
    (
      "rows",
      pyarrow.list_(evaluation_row_schema),
    ),
    pyarrow.field("aggregate", pyarrow.map_(pyarrow.string(), pyarrow.float32())),
  ]
)


def create_evaluation(evaluation_id: str, object_key: str) -> str:
  minio.create_object("evaluation", object_key, evaluation_schema)
  set_evaluation_object_key(evaluation_id, object_key)
  return object_key