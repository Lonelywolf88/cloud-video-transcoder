import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { PutObjectCommand, GetObjectCommand } from "@aws-sdk/client-s3";
import { s3Client, S3_BUCKET } from "./paths.js";

const DEFAULT_URL_TTL = Number(process.env.S3_SIGNED_URL_TTL_SECONDS || 900);

export async function createUploadUrl({ key, contentType, expiresIn = DEFAULT_URL_TTL }) {
  const command = new PutObjectCommand({
    Bucket: S3_BUCKET,
    Key: key,
    ContentType: contentType || "application/octet-stream"
  });

  const url = await getSignedUrl(s3Client, command, { expiresIn });
  return { url, expiresIn };
}

export async function createDownloadUrl({ key, expiresIn = DEFAULT_URL_TTL, responseContentType, responseDisposition }) {
  const command = new GetObjectCommand({
    Bucket: S3_BUCKET,
    Key: key,
    ResponseContentType: responseContentType,
    ResponseContentDisposition: responseDisposition
  });

  const url = await getSignedUrl(s3Client, command, { expiresIn });
  return { url, expiresIn };
}
