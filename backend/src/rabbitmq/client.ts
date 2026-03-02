import { Channel, ChannelModel, connect } from "amqplib";

class RabbitMQClient {
  connection: ChannelModel;
  channel: Channel;

  async connect() {
    const host = process.env.RABBITMQ_HOST;
    const user = process.env.RABBITMQ_USER || "guest";
    const password = process.env.RABBITMQ_PASSWORD || "guest";

    const connectionUrl = `amqp://${user}:${password}@${host}`;
    console.log(`rabbitmq: connecting to ${connectionUrl}`);

    this.connection = await connect(connectionUrl);
    this.channel = await this.connection.createChannel();

    // TODO: move to publisher confirms
    await this.channel.assertQueue("inference", {
      durable: true,
    });

    await this.channel.assertQueue("evaluation", {
      durable: true,
    });
  }

  sendInference(inferenceId: string) {
    this.channel.sendToQueue("inference", Buffer.from(inferenceId), {
      persistent: true,
    });
    console.log("[inference] job queued:", inferenceId);
  }

  sendEvaluation(evaluationId: string) {
    console.log("sending to eval queue");
    this.channel.sendToQueue("evaluation", Buffer.from(evaluationId), {
      persistent: true,
    });
  }
}

export const rmqClient = new RabbitMQClient();
