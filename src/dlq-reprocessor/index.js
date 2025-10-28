// src/dlq-reprocessor/index.js
import {
  SQSClient,
  ReceiveMessageCommand,
  DeleteMessageBatchCommand,
  SendMessageCommand,
} from "@aws-sdk/client-sqs";

const {
  AWS_REGION = "ap-southeast-2",
  DLQ_URL,
  MAIN_QUEUE_URL,
  WAIT_SECONDS = "20",
  MAX_BATCH = "5",
  VIS_SECONDS = "300",
} = process.env;

if (!DLQ_URL) throw new Error("DLQ_URL is required");
if (!MAIN_QUEUE_URL) throw new Error("MAIN_QUEUE_URL is required");

const sqs = new SQSClient({ region: AWS_REGION });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function processBatch(messages) {
  const deletes = [];

  for (const m of messages) {
    const body = m.Body || "";
    let parsed = null;

    try {
      parsed = JSON.parse(body);
    } catch {
      console.warn("[dlq] invalid JSON, deleting only id=", m.MessageId);
      deletes.push({ Id: m.MessageId, ReceiptHandle: m.ReceiptHandle });
      continue;
    }

    try {
      // re-enqueue to the main queue
      await sqs.send(
        new SendMessageCommand({
          QueueUrl: MAIN_QUEUE_URL,
          MessageBody: JSON.stringify(parsed),
        })
      );
      console.log("[dlq] re-enqueued id=", m.MessageId);
      // delete from DLQ only after successful re-enqueue
      deletes.push({ Id: m.MessageId, ReceiptHandle: m.ReceiptHandle });
    } catch (e) {
      console.error("[dlq] send failed, keeping in DLQ:", e?.message || e);
    }
  }

  if (deletes.length) {
    await sqs.send(
      new DeleteMessageBatchCommand({
        QueueUrl: DLQ_URL,
        Entries: deletes,
      })
    );
    console.log(`[dlq] deleted ${deletes.length} from DLQ`);
  }
}

async function poll() {
  console.log("[dlq] starting DLQ poller");
  console.log("[dlq] DLQ_URL=", DLQ_URL);
  console.log("[dlq] MAIN_QUEUE_URL=", MAIN_QUEUE_URL);

  while (true) {
    try {
      const resp = await sqs.send(
        new ReceiveMessageCommand({
          QueueUrl: DLQ_URL,
          MaxNumberOfMessages: Number(MAX_BATCH),
          WaitTimeSeconds: Number(WAIT_SECONDS),     // long-poll
          VisibilityTimeout: Number(VIS_SECONDS),    // time to process
          AttributeNames: ["All"],
          MessageAttributeNames: ["All"],
        })
      );

      const msgs = resp.Messages || [];
      if (msgs.length) {
        console.log(`[dlq] received ${msgs.length} message(s)`);
        await processBatch(msgs);
      } else {
        // quiet period — small sleep to avoid tight loop
        await sleep(2000);
      }
    } catch (e) {
      console.error("[dlq] poll error:", e?.message || e);
      await sleep(5000);
    }
  }
}

process.on("SIGTERM", () => {
  console.log("[dlq] received SIGTERM, exiting");
  process.exit(0);
});
process.on("SIGINT", () => {
  console.log("[dlq] received SIGINT, exiting");
  process.exit(0);
});

poll();
