import {
  SSMClient,
  GetParametersCommand,
} from "@aws-sdk/client-ssm";
import {
  SQSClient,
  SendMessageCommand,
} from "@aws-sdk/client-sqs";

const REGION = process.env.AWS_REGION || "ap-southeast-2";
const PARAMETER_PREFIX =
  process.env.PARAMETER_STORE_PREFIX || "/cab432/g57/app/";
const QUEUE_PARAM_KEY = process.env.SQS_QUEUE_PARAM_KEY || "SQS_QUEUE_URL";
const EXPECTED_BUCKET = process.env.EXPECTED_BUCKET_NAME;

const ssm = new SSMClient({ region: REGION });
const sqs = new SQSClient({ region: REGION });

async function resolveQueueUrl() {
  if (process.env.SQS_QUEUE_URL) {
    return process.env.SQS_QUEUE_URL;
  }
  const name = `${PARAMETER_PREFIX}${QUEUE_PARAM_KEY}`;
  const res = await ssm.send(
    new GetParametersCommand({
      Names: [name],
      WithDecryption: true,
    })
  );
  const param = res.Parameters?.[0];
  if (!param?.Value) {
    throw new Error(
      `SQS queue URL not found in Parameter Store (${name} missing)`
    );
  }
  return param.Value;
}

function parseKey(key) {
  // Expect format user/<userId>/videos/<videoId>/original.mp4
  const parts = key.split("/");
  if (parts.length < 5) return null;
  const [prefix, userId, videosLiteral, videoId, filename] = parts;
  if (
    prefix !== "user" ||
    !userId ||
    videosLiteral !== "videos" ||
    !videoId ||
    !filename?.startsWith("original")
  ) {
    return null;
  }
  return { userId, videoId, originalKey: key };
}

export const handler = async (event = {}) => {
  if (!event.Records?.length) {
    console.log("[lambda] no records");
    return { statusCode: 200, body: JSON.stringify({ dispatched: 0 }) };
  }

  const queueUrl = await resolveQueueUrl();
  let dispatched = 0;
  for (const record of event.Records) {
    const { s3 } = record;
    if (!s3?.bucket?.name || !s3?.object?.key) {
      continue;
    }
    if (EXPECTED_BUCKET && s3.bucket.name !== EXPECTED_BUCKET) {
      console.warn(
        `[lambda] skipping object from unexpected bucket ${s3.bucket.name}`
      );
      continue;
    }
    const key = decodeURIComponent(s3.object.key.replace(/\+/g, " "));
    const parsed = parseKey(key);
    if (!parsed) {
      console.warn(`[lambda] ignoring object with key ${key}`);
      continue;
    }
    const message = {
      type: "transcode",
      ...parsed,
      s3Bucket: s3.bucket.name,
      eventTime: record.eventTime,
    };
    await sqs.send(
      new SendMessageCommand({
        QueueUrl: queueUrl,
        MessageBody: JSON.stringify(message),
      })
    );
    dispatched += 1;
    console.log(
      `[lambda] dispatched SQS message for user=${parsed.userId} video=${parsed.videoId}`
    );
  }

  return {
    statusCode: 200,
    body: JSON.stringify({ dispatched }),
  };
};
