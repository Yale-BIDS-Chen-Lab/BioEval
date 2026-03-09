import threading

from inference.message_handler import handle_inference_message
from evaluation.message_handler import handle_evaluation_message
from rabbitmq import RabbitMQConsumer
from http_server import start_http_server


def inference_handler(body: bytes) -> None:
  inference_id = body.decode("utf-8")
  handle_inference_message(inference_id)


def evaluation_handler(body: bytes) -> None:
  evaluation_id = body.decode("utf-8")
  handle_evaluation_message(evaluation_id)


def main():
  # Start HTTP server for synchronous tasks (statistics, etc.)
  http_thread = threading.Thread(target=start_http_server, daemon=True)
  http_thread.start()

  inference_consumer = RabbitMQConsumer("inference", inference_handler)
  evaluation_consumer = RabbitMQConsumer("evaluation", evaluation_handler)

  threads = []
  for consumer in (inference_consumer, evaluation_consumer):
    thread = threading.Thread(target=consumer.connect)
    thread.start()
    threads.append(thread)

  for thread in threads:
    thread.join()


if __name__ == "__main__":
  main()
