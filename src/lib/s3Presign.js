// src/lib/s3Presign.js
import { getS3Client, getS3Bucket } from "./paths.js";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { GetObjectCommand, PutObjectCommand } from "@aws-sdk/client-s3";

function bucket() {
  return getS3Bucket();
}

// 🔹 Create presigned URL for downloading (GET)
export async function createDownloadUrl({ key, expiresIn = 3600 }) {
  const command = new GetObjectCommand({
    Bucket: bucket(),
    Key: key,
  });
  const url = await getSignedUrl(getS3Client(), command, { expiresIn });
  return { url, expiresIn, method: "GET" };
}

// 🔹 Create presigned URL for uploading (PUT)
export async function createUploadUrl({ key, contentType, expiresIn = 3600 }) {
  const command = new PutObjectCommand({
    Bucket: bucket(),
    Key: key,
    ContentType: contentType || "application/octet-stream",
  });
  const url = await getSignedUrl(getS3Client(), command, { expiresIn });
  return { url, expiresIn, method: "PUT" };
}
