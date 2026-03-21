import functools
import os
import threading
from typing import Callable

import pika
from pika.adapters.blocking_connection import BlockingChannel
from pika.spec import BasicProperties


class RabbitMQConsumer:
  def __init__(self, queue: str, handler: Callable[[bytes], None]) -> None:
    credentials = pika.PlainCredentials(
      username=os.environ["RABBITMQ_USER"], password=os.environ["RABBITMQ_PASSWORD"]
    )
    connection = pika.BlockingConnection(
      pika.ConnectionParameters(
        host=os.environ["RABBITMQ_HOST"], credentials=credentials
      )
    )
    self.channel = connection.channel()

    self.queue = queue
    self.handler = handler

    self.channel.queue_declare(queue=queue, durable=True)
    self.channel.basic_qos(prefetch_count=1)

    self.threads = []

  def ack_message(self, channel: BlockingChannel, delivery_tag):
    if channel.is_open:
      channel.basic_ack(delivery_tag=delivery_tag)
    else:
      print("ERROR: can't ack message! channel is closed")

  def nack_message(self, channel: BlockingChannel, delivery_tag):
    if channel.is_open:
      channel.basic_nack(delivery_tag=delivery_tag, requeue=True)
    else:
      print("ERROR: can't nack message! channel is closed")

  # Not thread-safe in general, but safe here because prefetch_count=1 limits to one active thread at a time.
  def process_message(
    self, channel: BlockingChannel, delivery_tag, body: bytes
  ) -> None:
    try:
      self.handler(body)
    except Exception as exc:
      print(f"ERROR: handler failed for queue {self.queue}: {type(exc).__name__}: {exc}")
      callback = functools.partial(self.nack_message, channel, delivery_tag)
      channel.connection.add_callback_threadsafe(callback)
      return

    callback = functools.partial(self.ack_message, channel, delivery_tag)
    channel.connection.add_callback_threadsafe(callback)

  def on_message(
    self, channel: BlockingChannel, method, properties: BasicProperties, body: bytes
  ) -> None:
    thread = threading.Thread(
      target=self.process_message, args=(channel, method.delivery_tag, body)
    )
    thread.start()
    self.threads.append(thread)

  def connect(self) -> None:
    self.channel.basic_consume(
      queue=self.queue, on_message_callback=self.on_message, auto_ack=False
    )
    print("Starting RabbitMQ consumer for queue", self.queue)
    self.channel.start_consuming()
