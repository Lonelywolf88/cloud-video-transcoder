import crypto from "node:crypto";
import { PutCommand, GetCommand } from "@aws-sdk/lib-dynamodb";
import {
  ddbDocClient,
  DDB_TABLE,
  PARTITION_KEY_ATTR,
  SORT_KEY_ATTR,
  QUT_USERNAME,
  usersKeyHelpers
} from "./paths.js";

const { userProfileSk, sanitizeUser } = usersKeyHelpers;

export const usersRepo = {
  async create({ username, passwordHash, role = "user" }) {
    const now = new Date().toISOString();
    const userId = crypto.randomUUID();

    const item = {
      [PARTITION_KEY_ATTR]: QUT_USERNAME,
      [SORT_KEY_ATTR]: userProfileSk(username),
      type: "User",
      userId,
      username,
      role,
      passwordHash,
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
    const { passwordHash: _ignored, ...rest } = sanitizeUser(item);
    return rest;
  },

  async getByUsername(username) {
    const command = new GetCommand({
      TableName: DDB_TABLE,
      Key: {
        [PARTITION_KEY_ATTR]: QUT_USERNAME,
        [SORT_KEY_ATTR]: userProfileSk(username)
      }
    });
    const { Item } = await ddbDocClient.send(command);
    return sanitizeUser(Item);
  }
};
