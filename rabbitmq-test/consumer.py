import pika
import sys
import time


def main():
  connection = pika.BlockingConnection(pika.ConnectionParameters("localhost"))
  channel = connection.channel()

  channel.queue_declare(queue="hello", durable=True)

  def callback(ch, method, properties, body):
    print(f"Received {body}")
    time.sleep(body.count(b"."))
    print("Done")
    ch.basic_ack(delivery_tag=method.delivery_tag)

  channel.basic_qos(prefetch_count=1)
  channel.basic_consume(queue="hello", on_message_callback=callback)

  print("Waiting for messages")
  channel.start_consuming()


if __name__ == "__main__":
  try:
    main()
  except KeyboardInterrupt:
    print("Interrupted")
    sys.exit()
