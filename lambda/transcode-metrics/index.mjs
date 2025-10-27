import {
  SSMClient,
  GetParametersCommand,
} from "@aws-sdk/client-ssm";
import {
  SQSClient,
  GetQueueAttributesCommand,
} from "@aws-sdk/client-sqs";
import {
  ECSClient,
  DescribeServicesCommand,
} from "@aws-sdk/client-ecs";
import {
  CloudWatchClient,
  PutMetricDataCommand,
} from "@aws-sdk/client-cloudwatch";

const DEFAULT_REGION ="ap-southeast-2";
const METRIC_NAMESPACE =
  process.env.CUSTOM_METRIC_NAMESPACE ;
const PARAMETER_PREFIX =
  process.env.PARAMETER_STORE_PREFIX ;
const QUEUE_PARAM_KEY = process.env.SQS_QUEUE_PARAM_KEY;
const WORKER_COUNT_BASELINE = Number(
  process.env.WORKER_COUNT_BASELINE || 1
);

const ssm = new SSMClient({ region: DEFAULT_REGION });
const sqs = new SQSClient({ region: DEFAULT_REGION });
const ecs = new ECSClient({ region: DEFAULT_REGION });
const cloudwatch = new CloudWatchClient({ region: DEFAULT_REGION });

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

async function getQueueStats(queueUrl) {
  const attributes = await sqs.send(
    new GetQueueAttributesCommand({
      QueueUrl: queueUrl,
      AttributeNames: [
        "ApproximateNumberOfMessages",
        "ApproximateNumberOfMessagesNotVisible",
      ],
    })
  );
  const visible = Number(
    attributes.Attributes?.ApproximateNumberOfMessages ?? 0
  );
  const notVisible = Number(
    attributes.Attributes?.ApproximateNumberOfMessagesNotVisible ?? 0
  );
  return { visible, notVisible };
}

async function getRunningWorkerCount() {
  const cluster = process.env.ECS_CLUSTER_NAME;
  const service = process.env.ECS_SERVICE_NAME;
  if (!cluster || !service) {
    return WORKER_COUNT_BASELINE;
  }
  try {
    const res = await ecs.send(
      new DescribeServicesCommand({
        cluster,
        services: [service],
      })
    );
    const svc = res.services?.[0];
    return Number(svc?.runningCount ?? WORKER_COUNT_BASELINE);
  } catch (err) {
    if (err?.name === "AccessDeniedException") {
      console.warn(
        "[lambda] Access denied reading ECS; using baseline worker count"
      );
      return WORKER_COUNT_BASELINE;
    }
    console.error(
      "[lambda] Failed to read ECS service; using baseline worker count",
      err?.message || err
    );
    return WORKER_COUNT_BASELINE;
  }
}

async function publishMetrics({
  visible,
  notVisible,
  runningCount,
  backlogPerWorker,
}) {
  await cloudwatch.send(
    new PutMetricDataCommand({
      Namespace: METRIC_NAMESPACE,
      MetricData: [
        {
          MetricName: "QueueVisible",
          Value: visible,
          Unit: "Count",
        },
        {
          MetricName: "QueueNotVisible",
          Value: notVisible,
          Unit: "Count",
        },
        {
          MetricName: "RunningWorkerTasks",
          Value: runningCount,
          Unit: "Count",
        },
        {
          MetricName: "BacklogPerWorker",
          Value: backlogPerWorker,
          Unit: "Count",
        },
      ],
    })
  );
}

export const handler = async () => {
  const queueUrl = await resolveQueueUrl();
  const { visible, notVisible } = await getQueueStats(queueUrl);
  const runningCount = await getRunningWorkerCount();
  const backlogPerWorker =
    runningCount > 0 ? visible / runningCount : visible;

  await publishMetrics({ visible, notVisible, runningCount, backlogPerWorker });

  return {
    statusCode: 200,
    body: JSON.stringify({
      queueUrl,
      visible,
      notVisible,
      runningCount,
      backlogPerWorker,
      namespace: METRIC_NAMESPACE,
    }),
  };
};
