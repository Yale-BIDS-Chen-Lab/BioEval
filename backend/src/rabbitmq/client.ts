import { ChannelModel, ConfirmChannel, connect } from "amqplib";

const RECONNECT_INITIAL_DELAY_MS = 1_000;
const RECONNECT_MAX_DELAY_MS = 30_000;
const PUBLISH_CONFIRM_TIMEOUT_MS = 5_000;

class RabbitMQClient {
  private connection: ChannelModel | null = null;
  private channel: ConfirmChannel | null = null;
  private reconnectDelayMs = RECONNECT_INITIAL_DELAY_MS;
  private reconnectScheduled = false;

  async connect(): Promise<void> {
    const host = process.env.RABBITMQ_HOST;
    const user = process.env.RABBITMQ_USER || "guest";
    const password = process.env.RABBITMQ_PASSWORD || "guest";

    const connectionUrl = `amqp://${user}:${password}@${host}`;
    console.log(`rabbitmq: connecting to amqp://${user}:***@${host}`);

    const connection = await connect(connectionUrl);
    const channel = await connection.createConfirmChannel();

    await channel.assertQueue("inference", { durable: true });
    await channel.assertQueue("evaluation", { durable: true });

    connection.on("error", (err) =>
      console.error("rabbitmq: connection error:", err?.message ?? err)
    );
    connection.on("close", () => {
      console.warn("rabbitmq: connection closed");
      this.connection = null;
      this.channel = null;
      this.scheduleReconnect();
    });
    channel.on("error", (err) =>
      console.error("rabbitmq: channel error:", err?.message ?? err)
    );

    this.connection = connection;
    this.channel = channel;
    this.reconnectDelayMs = RECONNECT_INITIAL_DELAY_MS;
    console.log("rabbitmq: connected");
  }

  private scheduleReconnect(): void {
    if (this.reconnectScheduled) return;
    this.reconnectScheduled = true;
    const delay = this.reconnectDelayMs;
    this.reconnectDelayMs = Math.min(
      this.reconnectDelayMs * 2,
      RECONNECT_MAX_DELAY_MS
    );
    console.log(`rabbitmq: reconnecting in ${delay}ms`);
    setTimeout(() => {
      this.reconnectScheduled = false;
      this.connect().catch((err) => {
        console.error("rabbitmq: reconnect failed:", err?.message ?? err);
        this.scheduleReconnect();
      });
    }, delay);
  }

  private async publishWithConfirm(queue: string, body: string): Promise<void> {
    const channel = this.channel;
    if (!channel) {
      throw new Error(
        `rabbitmq: cannot publish to '${queue}', channel is not connected`
      );
    }

    return new Promise<void>((resolve, reject) => {
      let settled = false;
      const timeout = setTimeout(() => {
        if (settled) return;
        settled = true;
        reject(
          new Error(
            `rabbitmq: publish to '${queue}' timed out after ${PUBLISH_CONFIRM_TIMEOUT_MS}ms`
          )
        );
      }, PUBLISH_CONFIRM_TIMEOUT_MS);

      try {
        channel.sendToQueue(
          queue,
          Buffer.from(body),
          { persistent: true },
          (err) => {
            if (settled) return;
            settled = true;
            clearTimeout(timeout);
            if (err) {
              reject(
                new Error(
                  `rabbitmq: publish to '${queue}' was nack'd: ${err.message ?? err}`
                )
              );
            } else {
              resolve();
            }
          }
        );
      } catch (err: any) {
        if (settled) return;
        settled = true;
        clearTimeout(timeout);
        reject(
          new Error(
            `rabbitmq: publish to '${queue}' threw: ${err?.message ?? err}`
          )
        );
      }
    });
  }

  async sendInference(inferenceId: string): Promise<void> {
    await this.publishWithConfirm("inference", inferenceId);
    console.log("[inference] job queued:", inferenceId);
  }

  async sendEvaluation(evaluationId: string): Promise<void> {
    await this.publishWithConfirm("evaluation", evaluationId);
    console.log("[evaluation] job queued:", evaluationId);
  }
}

export const rmqClient = new RabbitMQClient();
