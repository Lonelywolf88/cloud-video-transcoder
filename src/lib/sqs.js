// minimal logging-only version (no helpers)
import {
  SQSClient,
  SendMessageCommand,
  ReceiveMessageCommand,
  DeleteMessageCommand,
  ChangeMessageVisibilityCommand,
} from "@aws-sdk/client-sqs";

const REGION = process.env.SQS_REGION || process.env.AWS_REGION || "ap-southeast-2";
const QUEUE_URL = process.env.SQS_QUEUE_URL;
const DEFAULT_VIS = Number(process.env.SQS_VISIBILITY_SECONDS || 900);
const LOG_EMPTY = process.env.SQS_LOG_EMPTY === "1";

if (!QUEUE_URL) {
  console.error("❌ SQS_QUEUE_URL is not set");
  process.exit(1);
}

const sqs = new SQSClient({ region: REGION });

export async function enqueueTranscodeJob({ userId, videoId, originalKey }) {
  const body = { type: "transcode", userId, videoId, originalKey, enqueuedAt: new Date().toISOString() };
  const res = await sqs.send(new SendMessageCommand({ QueueUrl: QUEUE_URL, MessageBody: JSON.stringify(body) }));
  console.log(`[sqs] enqueued video=${videoId} user=${userId} msgId=${res.MessageId}`);
}

export async function receiveBatch({ max = 5, wait = 20, visibility = DEFAULT_VIS } = {}) {
  const WaitTimeSeconds = Math.max(1, Math.min(wait, 20));
  const MaxNumberOfMessages = Math.max(1, Math.min(max, 10));
  const res = await sqs.send(new ReceiveMessageCommand({
    QueueUrl: QUEUE_URL,
    MaxNumberOfMessages,
    WaitTimeSeconds,
    VisibilityTimeout: visibility,
  }));
  const messages = res.Messages || [];
  if (messages.length) {
    console.log(`[sqs] batch received size=${messages.length} wait=${WaitTimeSeconds}s vis=${visibility}s`);
  } else if (LOG_EMPTY) {
    console.log(`[sqs] batch received empty wait=${WaitTimeSeconds}s`);
  }
  return messages;
}

export async function deleteMessage(receiptHandle) {
  if (!receiptHandle) return;
  await sqs.send(new DeleteMessageCommand({ QueueUrl: QUEUE_URL, ReceiptHandle: receiptHandle }));
  console.log(`[sqs] deleted message rh=${String(receiptHandle).slice(0,12)}...`);
}

export async function extendVisibility(receiptHandle, seconds) {
  await sqs.send(new ChangeMessageVisibilityCommand({
    QueueUrl: QUEUE_URL, ReceiptHandle: receiptHandle, VisibilityTimeout: seconds
  }));
  // success quiet; your worker already catches errors if needed
}
