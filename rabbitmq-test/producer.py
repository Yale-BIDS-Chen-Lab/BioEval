import pika

connection = pika.BlockingConnection(pika.ConnectionParameters("localhost"))
channel = connection.channel()

channel.queue_declare(queue="hello", durable=True)

channel.basic_publish(
  exchange="",
  routing_key="hello",
  body="Hello World.....",
  properties=pika.BasicProperties(delivery_mode=pika.DeliveryMode.Persistent),
)
print("Sent Hello World!")

connection.close()
