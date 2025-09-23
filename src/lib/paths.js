import { S3Client, DeleteObjectCommand, PutObjectCommand, GetObjectCommand, HeadObjectCommand } from "@aws-sdk/client-s3";
import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { ensureParametersLoaded } from "../config/parameterStore.js";

await ensureParametersLoaded(["AWS_REGION", "QUT_USERNAME"]);
import {
  DynamoDBDocumentClient,
  PutCommand,
  GetCommand,
  QueryCommand,
  UpdateCommand,
  DeleteCommand
} from "@aws-sdk/lib-dynamodb";

const AWS_REGION = process.env.AWS_REGION;
export const S3_BUCKET = process.env.S3_BUCKET;
export const DDB_TABLE = process.env.DDB_TABLE;
export const QUT_USERNAME = process.env.QUT_USERNAME;

export const PARTITION_KEY_ATTR = "qut-username";
export const SORT_KEY_ATTR = "SK";

if (!AWS_REGION) {
  throw new Error("AWS_REGION env var must be set");
}
if (!S3_BUCKET) {
  throw new Error("S3_BUCKET env var must be set");
}
if (!DDB_TABLE) {
  throw new Error("DDB_TABLE env var must be set");
}
if (!QUT_USERNAME) {
  throw new Error("QUT_USERNAME env var must be set");
}

export const s3Client = new S3Client({ region: AWS_REGION });
const dynamoClient = new DynamoDBClient({ region: AWS_REGION });
export const ddbDocClient = DynamoDBDocumentClient.from(dynamoClient, {
  marshallOptions: {
    removeUndefinedValues: true
  }
});

const USER_PREFIX = "USER#";
const VIDEO_SEGMENT = "#VIDEO#";
const USERPROFILE_PREFIX = "USERPROFILE#";
const TYPE_VIDEO = "Video";
const LOCKED_BY_ATTR = "transcodeLockedBy";
const LOCKED_AT_ATTR = "transcodeLockedAt";

const videoSk = (userId, videoId) => `${USER_PREFIX}${userId}${VIDEO_SEGMENT}${videoId}`;
const videoPrefixForUser = (userId) => `${USER_PREFIX}${userId}${VIDEO_SEGMENT}`;
const userProfileSk = (username) => `${USERPROFILE_PREFIX}${username}`;

export function buildVideoBaseKey(userId, videoId) {
  return `user/${userId}/videos/${videoId}`;
}

export function buildOriginalKey(userId, videoId) {
  return `${buildVideoBaseKey(userId, videoId)}/original.mp4`;
}

export function buildThumbnailKey(userId, videoId) {
  return `${buildVideoBaseKey(userId, videoId)}/thumbnail.jpg`;
}

export function buildRenditionKey(userId, videoId, resolution) {
  return `${buildVideoBaseKey(userId, videoId)}/renditions/${resolution}.mp4`;
}

function sanitizeVideo(item) {
  if (!item || item.type !== TYPE_VIDEO) {
    return null;
  }

  return {
    userId: item.userId,
    videoId: item.videoId,
    title: item.title,
    status: item.status,
    originalKey: item.originalKey,
    baseKey: item.baseKey,
    thumbnailKey: item.thumbnailKey || null,
    renditions: Array.isArray(item.renditions) ? item.renditions : [],
    tags: Array.isArray(item.tags) ? item.tags : [],
    duration: item.duration ?? null,
    errorMessage: item.errorMessage,
    sourceType: item.sourceType,
    sourceUrl: item.sourceUrl,
    createdAt: item.createdAt,
    updatedAt: item.updatedAt,
    transcodeLockedBy: item[LOCKED_BY_ATTR] || null,
    transcodeLockedAt: item[LOCKED_AT_ATTR] || null
  };
}

export const videoRepo = {
  async create({ userId, videoId, title, originalKey, duration, sourceType = "upload", sourceUrl = null }) {
    const now = new Date().toISOString();
    const item = {
      [PARTITION_KEY_ATTR]: QUT_USERNAME,
      [SORT_KEY_ATTR]: videoSk(userId, videoId),
      type: TYPE_VIDEO,
      userId,
      videoId,
      title,
      status: "queued",
      originalKey,
      baseKey: buildVideoBaseKey(userId, videoId),
      thumbnailKey: null,
      renditions: [],
      tags: [],
      duration: duration ?? null,
      errorMessage: null,
      sourceType,
      sourceUrl,
      createdAt: now,
      updatedAt: now
    };

    const command = new PutCommand({
      TableName: DDB_TABLE,
      Item: item,
      ConditionExpression: "attribute_not_exists(#pk) AND attribute_not_exists(#sk)",
      ExpressionAttributeNames: {
        "#pk": PARTITION_KEY_ATTR,
        "#sk": SORT_KEY_ATTR
      }
    });
    await ddbDocClient.send(command);
    return sanitizeVideo(item);
  },

  // ✅ Put listAll() here, NOT inside create()
  async listAll() {
    const items = [];
    let ExclusiveStartKey;

    do {
      const command = new QueryCommand({
        TableName: DDB_TABLE,
        KeyConditionExpression: "#pk = :pk AND begins_with(#sk, :prefix)",
        ExpressionAttributeNames: {
          "#pk": PARTITION_KEY_ATTR,
          "#sk": SORT_KEY_ATTR,
        },
        ExpressionAttributeValues: {
          ":pk": QUT_USERNAME,
          ":prefix": "USER#",   // matches all users
        },
        ExclusiveStartKey,
      });

      const { Items = [], LastEvaluatedKey } = await ddbDocClient.send(command);
      items.push(...Items.map(sanitizeVideo).filter(Boolean));
      ExclusiveStartKey = LastEvaluatedKey;
    } while (ExclusiveStartKey);

    return items.sort((a, b) =>
      (b.createdAt || "").localeCompare(a.createdAt || "")
    );
  },


  async get(userId, videoId) {
    const command = new GetCommand({
      TableName: DDB_TABLE,
      Key: {
        [PARTITION_KEY_ATTR]: QUT_USERNAME,
        [SORT_KEY_ATTR]: videoSk(userId, videoId)
      }
    });
    const { Item } = await ddbDocClient.send(command);
    return sanitizeVideo(Item);
  },

  async listByUser(userId) {
    const command = new QueryCommand({
      TableName: DDB_TABLE,
      KeyConditionExpression: "#pk = :pk AND begins_with(#sk, :prefix)",
      ExpressionAttributeNames: {
        "#pk": PARTITION_KEY_ATTR,
        "#sk": SORT_KEY_ATTR
      },
      ExpressionAttributeValues: {
        ":pk": QUT_USERNAME,
        ":prefix": videoPrefixForUser(userId)
      }
    });
    const { Items = [] } = await ddbDocClient.send(command);
    return Items.map(sanitizeVideo).filter(Boolean).sort((a, b) => (b.createdAt || "").localeCompare(a.createdAt || ""));
  },

  async markProcessing(userId, videoId, workerId) {
    const now = new Date().toISOString();
    const command = new UpdateCommand({
      TableName: DDB_TABLE,
      Key: {
        [PARTITION_KEY_ATTR]: QUT_USERNAME,
        [SORT_KEY_ATTR]: videoSk(userId, videoId)
      },
      UpdateExpression:
        'SET #status = :processing, #updatedAt = :updatedAt, #lockedBy = :lockedBy, #lockedAt = :lockedAt REMOVE #errorMessage',
      ConditionExpression:
        '#status = :queued AND attribute_not_exists(#lockedBy)',
      ExpressionAttributeNames: {
        '#status': 'status',
        '#updatedAt': 'updatedAt',
        '#errorMessage': 'errorMessage',
        '#lockedBy': LOCKED_BY_ATTR,
        '#lockedAt': LOCKED_AT_ATTR
      },
      ExpressionAttributeValues: {
        ':processing': 'processing',
        ':updatedAt': now,
        ':queued': 'queued',
        ':lockedBy': workerId,
        ':lockedAt': now
      },
      ReturnValues: 'ALL_NEW'
    });

    const { Attributes } = await ddbDocClient.send(command);
    return sanitizeVideo(Attributes);
  },

  async findQueuedVideos(limit = 10) {
    const items = [];
    let ExclusiveStartKey;

    while (items.length < limit) {
      const command = new QueryCommand({
        TableName: DDB_TABLE,
        KeyConditionExpression: '#pk = :pk AND begins_with(#sk, :prefix)',
        ExpressionAttributeNames: {
          '#pk': PARTITION_KEY_ATTR,
          '#sk': SORT_KEY_ATTR,
          '#status': 'status'
        },
        ExpressionAttributeValues: {
          ':pk': QUT_USERNAME,
          ':prefix': USER_PREFIX,
          ':queued': 'queued'
        },
        FilterExpression: '#status = :queued',
        Limit: Math.max(limit, 10),
        ExclusiveStartKey
      });

      const { Items = [], LastEvaluatedKey } = await ddbDocClient.send(command);
      for (const raw of Items) {
        if (items.length >= limit) break;
        items.push(sanitizeVideo(raw));
      }
      if (!LastEvaluatedKey) {
        break;
      }
      ExclusiveStartKey = LastEvaluatedKey;
    }

    return items;
  },

  async claimNextQueuedVideo(workerId, limit = 5) {
    const queued = await this.findQueuedVideos(limit);
    for (const video of queued) {
      try {
        return await this.markProcessing(video.userId, video.videoId, workerId);
      } catch (err) {
        if (err?.name === 'ConditionalCheckFailedException') {
          continue;
        }
        throw err;
      }
    }
    return null;
  },

  async findStaleProcessing(cutoffIso, limit = 10) {
    const items = [];
    let ExclusiveStartKey;

    while (items.length < limit) {
      const command = new QueryCommand({
        TableName: DDB_TABLE,
        KeyConditionExpression: '#pk = :pk AND begins_with(#sk, :prefix)',
        ExpressionAttributeNames: {
          '#pk': PARTITION_KEY_ATTR,
          '#sk': SORT_KEY_ATTR,
          '#status': 'status',
          '#lockedAt': LOCKED_AT_ATTR
        },
        ExpressionAttributeValues: {
          ':pk': QUT_USERNAME,
          ':prefix': USER_PREFIX,
          ':processing': 'processing',
          ':cutoff': cutoffIso
        },
        FilterExpression: '#status = :processing AND attribute_exists(#lockedAt) AND #lockedAt <= :cutoff',
        Limit: Math.max(limit, 10),
        ExclusiveStartKey
      });

      const { Items = [], LastEvaluatedKey } = await ddbDocClient.send(command);
      for (const raw of Items) {
        if (items.length >= limit) break;
        items.push(sanitizeVideo(raw));
      }
      if (!LastEvaluatedKey) {
        break;
      }
      ExclusiveStartKey = LastEvaluatedKey;
    }

    return items;
  },

  async requeueVideo(userId, videoId) {
    const now = new Date().toISOString();
    const command = new UpdateCommand({
      TableName: DDB_TABLE,
      Key: {
        [PARTITION_KEY_ATTR]: QUT_USERNAME,
        [SORT_KEY_ATTR]: videoSk(userId, videoId)
      },
      UpdateExpression: 'SET #status = :queued, #updatedAt = :updatedAt REMOVE #lockedBy, #lockedAt, #errorMessage',
      ConditionExpression: '#status = :processing',
      ExpressionAttributeNames: {
        '#status': 'status',
        '#updatedAt': 'updatedAt',
        '#lockedBy': LOCKED_BY_ATTR,
        '#lockedAt': LOCKED_AT_ATTR,
        '#errorMessage': 'errorMessage'
      },
      ExpressionAttributeValues: {
        ':queued': 'queued',
        ':processing': 'processing',
        ':updatedAt': now
      },
      ReturnValues: 'ALL_NEW'
    });

    try {
      const { Attributes } = await ddbDocClient.send(command);
      return sanitizeVideo(Attributes);
    } catch (err) {
      if (err?.name === 'ConditionalCheckFailedException') {
        return null;
      }
      throw err;
    }
  },

  async markCompleted(userId, videoId, { duration, thumbnailKey, renditions, tags }) {
    const now = new Date().toISOString();
    const command = new UpdateCommand({
      TableName: DDB_TABLE,
      Key: {
        [PARTITION_KEY_ATTR]: QUT_USERNAME,
        [SORT_KEY_ATTR]: videoSk(userId, videoId)
      },
      UpdateExpression:
        'SET #status = :completed, #updatedAt = :updatedAt, #duration = :duration, #thumbnailKey = :thumbnailKey, #renditions = :renditions, #tags = :tags REMOVE #errorMessage, #lockedBy, #lockedAt',
      ExpressionAttributeNames: {
        '#status': 'status',
        '#updatedAt': 'updatedAt',
        '#duration': 'duration',
        '#thumbnailKey': 'thumbnailKey',
        '#renditions': 'renditions',
        '#tags': 'tags',
        '#errorMessage': 'errorMessage',
        '#lockedBy': LOCKED_BY_ATTR,
        '#lockedAt': LOCKED_AT_ATTR
      },
      ExpressionAttributeValues: {
        ':completed': 'completed',
        ':updatedAt': now,
        ':duration': duration ?? null,
        ':thumbnailKey': thumbnailKey ?? null,
        ':renditions': renditions ?? [],
        ':tags': tags ?? []
      },
      ReturnValues: 'ALL_NEW'
    });

    const { Attributes } = await ddbDocClient.send(command);
    return sanitizeVideo(Attributes);
  },

  async markFailed(userId, videoId, message = "Unknown error") {
    const now = new Date().toISOString();
    const command = new UpdateCommand({
      TableName: DDB_TABLE,
      Key: {
        [PARTITION_KEY_ATTR]: QUT_USERNAME,
        [SORT_KEY_ATTR]: videoSk(userId, videoId)
      },
      UpdateExpression:
        'SET #status = :failed, #updatedAt = :updatedAt, #errorMessage = :message REMOVE #lockedBy, #lockedAt',
      ExpressionAttributeNames: {
        '#status': 'status',
        '#updatedAt': 'updatedAt',
        '#errorMessage': 'errorMessage',
        '#lockedBy': LOCKED_BY_ATTR,
        '#lockedAt': LOCKED_AT_ATTR
      },
      ExpressionAttributeValues: {
        ':failed': 'failed',
        ':updatedAt': now,
        ':message': message
      },
      ReturnValues: 'ALL_NEW'
    });

    const { Attributes } = await ddbDocClient.send(command);
    return sanitizeVideo(Attributes);
  },

  async markCanceled(userId, videoId) {
    return this.markFailed(userId, videoId, "Canceled by user");
  },

  async remove(userId, videoId) {
    const command = new DeleteCommand({
      TableName: DDB_TABLE,
      Key: {
        [PARTITION_KEY_ATTR]: QUT_USERNAME,
        [SORT_KEY_ATTR]: videoSk(userId, videoId)
      }
    });
    await ddbDocClient.send(command);
  }
};

export const usersKeyHelpers = {
  userProfileSk,
  sanitizeUser(item) {
    if (!item || item.type !== "User") {
      return null;
    }
    return {
      userId: item.userId,
      username: item.username,
      role: item.role || "user",
      passwordHash: item.passwordHash,
      createdAt: item.createdAt,
      updatedAt: item.updatedAt
    };
  }
};


export { PutObjectCommand, GetObjectCommand, DeleteObjectCommand, HeadObjectCommand };
