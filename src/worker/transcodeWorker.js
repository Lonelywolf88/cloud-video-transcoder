// src/worker/transcodeWorker.js
import fs from "node:fs";
import fsp from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { pipeline } from "node:stream/promises";
import { GetObjectCommand, PutObjectCommand } from "@aws-sdk/client-s3";
import {
  videoRepo,
  getS3Client,
  getS3Bucket,
  buildRenditionKey,
  buildThumbnailKey,
} from "../lib/paths.js";
import {
  transcodeProfiles,
  extractThumbnail,
  ffprobeDurationSeconds,
} from "../lib/ffmpeg.js";
import { classifyImageAtPath } from "../lib/tagger.js";
import { ensureParametersLoaded } from "../config/parameterStore.js";
import { receiveBatch, deleteMessage, extendVisibility } from "../lib/sqs.js";

await ensureParametersLoaded(["TRANSCODE_LOCK_TTL_MS"]);

const WORKER_ID = `${os.hostname()}-${process.pid}-${Math.random()
  .toString(36)
  .slice(2, 8)}`;
const POLL_INTERVAL_MS = Number(process.env.TRANSCODE_POLL_MS || 5000);
const LOCK_TTL_MS = Number(process.env.TRANSCODE_LOCK_TTL_MS || 5 * 60 * 1000);

let current = null; // { userId, videoId, abortController }
let running = false;
let scheduled = false;

function bucket() {
  return getS3Bucket();
}

async function downloadOriginal(video, destination) {
  const data = await getS3Client().send(
    new GetObjectCommand({ Bucket: bucket(), Key: video.originalKey })
  );
  if (!data.Body) throw new Error("Original object missing");
  await pipeline(data.Body, fs.createWriteStream(destination));
}

async function uploadFileToS3(localPath, key, contentType) {
  const body = fs.createReadStream(localPath);
  await getS3Client().send(
    new PutObjectCommand({
      Bucket: bucket(),
      Key: key,
      Body: body,
      ContentType: contentType,
    })
  );
  const stat = await fsp.stat(localPath);
  return stat.size;
}

async function processVideo(video) {
  const { userId, videoId } = video;
  const abortController = new AbortController();
  let tmpDir;

  try {
    current = { userId, videoId, abortController };

    tmpDir = await fsp.mkdtemp(path.join(os.tmpdir(), "cab432-"));
    const originalPath = path.join(tmpDir, "original.mp4");
    await downloadOriginal(video, originalPath);

    const duration = await ffprobeDurationSeconds(originalPath);

    const profiles = [
      {
        resolution: "1080",
        vf: "scale=-2:1080",
        crf: 22,
        ab: "128k",
        file: path.join(tmpDir, "1080.mp4"),
      },
      {
        resolution: "720",
        vf: "scale=-2:720",
        crf: 23,
        ab: "128k",
        file: path.join(tmpDir, "720.mp4"),
      },
      {
        resolution: "480",
        vf: "scale=-2:480",
        crf: 24,
        ab: "96k",
        file: path.join(tmpDir, "480.mp4"),
      },
    ];

    await transcodeProfiles(
      originalPath,
      profiles.map((p) => ({ vf: p.vf, out: p.file, crf: p.crf, ab: p.ab })),
      { signal: abortController.signal }
    );

    const renditions = [];
    for (const profile of profiles) {
      const key = buildRenditionKey(userId, videoId, profile.resolution);
      const sizeBytes = await uploadFileToS3(profile.file, key, "video/mp4");
      renditions.push({
        resolution: profile.resolution,
        s3Key: key,
        sizeBytes,
      });
    }

    const thumbnailPath = path.join(tmpDir, "thumbnail.jpg");
    await extractThumbnail(originalPath, thumbnailPath, 3, {
      signal: abortController.signal,
    });
    const thumbnailKey = buildThumbnailKey(userId, videoId);
    await uploadFileToS3(thumbnailPath, thumbnailKey, "image/jpeg");

    let tags = [];
    try {
      tags = await classifyImageAtPath(thumbnailPath);
    } catch (tagErr) {
      console.warn("[worker] tagging failed", tagErr?.message || tagErr);
    }

    await videoRepo.markCompleted(userId, videoId, {
      duration,
      thumbnailKey,
      renditions,
      tags,
    });
  } catch (err) {
    const message =
      err?.name === "AbortError"
        ? "Canceled by user"
        : err?.message || "Transcode failed";
    console.error("[worker] transcode failed", userId, videoId, err);
    await videoRepo.markFailed(userId, videoId, message).catch(() => {});
    // Re-throw so the SQS message is NOT deleted by the caller.
    throw err;
  } finally {
    current = null;
    if (tmpDir) {
      await fsp.rm(tmpDir, { recursive: true, force: true }).catch(() => {});
    }
  }
}

async function reclaimStaleJobs() {
  const cutoffIso = new Date(Date.now() - LOCK_TTL_MS).toISOString();
  const stale = await videoRepo.findStaleProcessing(cutoffIso, 10);
  for (const job of stale) {
    const reset = await videoRepo.requeueVideo(job.userId, job.videoId);
    if (reset) console.warn(`[worker] Re-queued stale job ${job.videoId}`);
  }
}

async function workCycle() {
  if (running) {
    scheduled = true;
    return;
  }
  running = true;
  try {
    const messages = await receiveBatch({ max: 5, wait: 20 });
    if (!messages.length) return; // idle, next tick will poll again
    for (const m of messages) {
      await handleMessage(m); // sequential is OK for ffmpeg I/O
    }
  } catch (err) {
    console.error("[worker] cycle error", err);
  } finally {
    running = false;
    if (scheduled) {
      scheduled = false;
      queueMicrotask(workCycle);
    }
  }
}

async function handleMessage(msg) {
  let parsed;
  try {
    parsed = JSON.parse(msg.Body || "{}");
  } catch {
    // bad message: drop it
    await deleteMessage(msg.ReceiptHandle);
    return;
  }

  const { userId, videoId } = parsed || {};
  if (!userId || !videoId) {
    await deleteMessage(msg.ReceiptHandle);
    return;
  }

  console.log(
    `[worker] got message: user=${userId} video=${videoId} rh=${msg.ReceiptHandle.slice(
      0,
      12
    )}...`
  );

  // Claim in DDB to ensure only one worker does the job
  let claimed;
  try {
    claimed = await videoRepo.markProcessing(userId, videoId, WORKER_ID);
  } catch (err) {
    if (err?.name === "ConditionalCheckFailedException") {
      await deleteMessage(msg.ReceiptHandle);
      return;
    }
    // transient error → let message reappear
    console.error("[worker] markProcessing error:", err?.message || err);
    return;
  }
  if (!claimed) {
    await deleteMessage(msg.ReceiptHandle);
    return;
  }

  // Heartbeat: extend visibility while ffmpeg runs
  const visSeconds = Number(process.env.SQS_VISIBILITY_SECONDS || 900);
  const hbMs = Math.max(60_000, Math.floor((visSeconds * 1000) / 3));
  let hbTimer = setInterval(() => {
    extendVisibility(msg.ReceiptHandle, visSeconds).catch(() => {});
  }, hbMs);

  try {
    await processVideo(claimed);
    clearInterval(hbTimer);
    console.log(
      `[worker] completed: user=${userId} video=${videoId} (deleting SQS message)`
    );
    await deleteMessage(msg.ReceiptHandle);
  } catch (err) {
    clearInterval(hbTimer);
    console.error("[worker] processing failed:", err?.message || err);
    // DO NOT delete → SQS will redeliver / DLQ after maxReceiveCount
  }
}

let pollTimer = null;

function schedulePolling() {
  if (pollTimer) clearInterval(pollTimer);
  pollTimer = setInterval(() => {
    workCycle();
  }, POLL_INTERVAL_MS);
}

export function startTranscodeWorker() {
  console.log(`[worker] ${WORKER_ID} starting`);
  schedulePolling();
  workCycle();
}

export function notifyTranscodeWorker() {
  queueMicrotask(workCycle);
}

export function getCurrentTranscodeId() {
  return current?.videoId ?? null;
}

export function cancelCurrentTranscode() {
  if (current?.abortController) {
    current.abortController.abort();
    return true;
  }
  return false;
}
