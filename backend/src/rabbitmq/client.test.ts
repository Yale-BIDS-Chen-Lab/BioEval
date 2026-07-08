import { test } from "node:test";
import { strict as assert } from "node:assert";
import { RabbitMQClient } from "./client";

// A fake confirm-channel: sendToQueue(queue, content, options, callback).
// The callback is the publisher-confirm hook — cb(undefined) = ack, cb(err) = nack.
type SendToQueue = (
  queue: string,
  content: Buffer,
  options: any,
  callback: (err?: any) => void
) => void;

function clientWithChannel(sendToQueue: SendToQueue): RabbitMQClient {
  const client = new RabbitMQClient();
  (client as any).channel = { sendToQueue };
  return client;
}

test("sendInference resolves and publishes persistently once the broker acks", async () => {
  const calls: { queue: string; body: string; opts: any }[] = [];
  const client = clientWithChannel((queue, content, options, cb) => {
    calls.push({ queue, body: content.toString(), opts: options });
    cb(undefined); // broker ack
  });

  await client.sendInference("job-1");

  assert.equal(calls.length, 1);
  assert.equal(calls[0].queue, "inference");
  assert.equal(calls[0].body, "job-1");
  assert.equal(calls[0].opts.persistent, true);
});

test("sendEvaluation targets the evaluation queue", async () => {
  const calls: string[] = [];
  const client = clientWithChannel((queue, _content, _options, cb) => {
    calls.push(queue);
    cb(undefined);
  });

  await client.sendEvaluation("eval-1");
  assert.deepEqual(calls, ["evaluation"]);
});

test("publish REJECTS when the broker nacks (does not silently drop)", async () => {
  const client = clientWithChannel((_q, _c, _o, cb) => cb(new Error("no route")));
  await assert.rejects(() => client.sendEvaluation("eval-2"), /nack'd/);
});

test("publish REJECTS on confirm timeout when no ack ever arrives", async () => {
  const client = clientWithChannel(() => {
    /* never invokes the confirm callback */
  });
  client.publishConfirmTimeoutMs = 20; // keep the test fast
  await assert.rejects(() => client.sendInference("job-2"), /timed out/);
});

test("publish REJECTS clearly when the channel is not connected", async () => {
  const client = new RabbitMQClient(); // channel stays null (never connected)
  await assert.rejects(() => client.sendInference("job-3"), /not connected/);
});

test("publish REJECTS when sendToQueue throws synchronously", async () => {
  const client = clientWithChannel(() => {
    throw new Error("boom");
  });
  await assert.rejects(() => client.sendInference("job-4"), /threw/);
});
