import { Router } from "express";
import { GetObjectCommand } from "@aws-sdk/client-s3";
import mime from "mime-types";
import { authRequired } from "../middleware/auth.js";
import { videoRepo, s3Client, S3_BUCKET } from "../lib/paths.js";

async function streamS3Object({ key, range }, res, attachmentName) {
  const params = { Bucket: S3_BUCKET, Key: key };
  if (range) {
    params.Range = range;
  }

  const data = await s3Client.send(new GetObjectCommand(params));
  if (!data.Body) {
    throw Object.assign(new Error("Empty object"), { code: 500 });
  }

  const statusCode = range && data.ContentRange ? 206 : 200;
  res.status(statusCode);

  const contentType = data.ContentType || mime.lookup(key) || "application/octet-stream";
  res.setHeader("Content-Type", contentType);

  if (attachmentName) {
    res.setHeader("Content-Disposition", `attachment; filename="${attachmentName}"`);
  } else {
    res.setHeader("Content-Disposition", "inline");
  }

  if (data.AcceptRanges) {
    res.setHeader("Accept-Ranges", data.AcceptRanges);
  }
  if (data.ContentLength !== undefined) {
    res.setHeader("Content-Length", data.ContentLength.toString());
  }
  if (data.ContentRange) {
    res.setHeader("Content-Range", data.ContentRange);
  }
  if (data.LastModified instanceof Date) {
    res.setHeader("Last-Modified", data.LastModified.toUTCString());
  }

  const bodyStream = data.Body;
  bodyStream.on?.("error", (err) => {
    res.destroy(err);
  });
  bodyStream.pipe(res);
}

function chooseKey(video, resolution) {
  if (resolution === "original") {
    return video.originalKey;
  }
  const renditions = Array.isArray(video.renditions) ? video.renditions : [];
  const match = renditions.find((r) => String(r?.resolution) === String(resolution));
  return match?.s3Key;
}

export function mediaRoutes() {
  const router = Router();

  router.get("/videos/:id/stream", authRequired, async (req, res) => {
    try {
      const video = await videoRepo.get(req.user.id, req.params.id);
      if (!video) {
        return res.status(404).json({ error: "Not found" });
      }

      const resolution = (req.query.res || "original").toString();
      const key = chooseKey(video, resolution);
      if (!key) {
        return res.status(404).json({ error: "Rendition not found" });
      }

      const range = req.headers.range;
      await streamS3Object({ key, range }, res);
    } catch (err) {
      const code = err.code && Number.isInteger(err.code) ? err.code : 500;
      console.error("Stream error", err);
      if (!res.headersSent) {
        res.status(code).json({ error: "Stream error" });
      }
    }
  });

  router.get("/videos/:id/download", authRequired, async (req, res) => {
    try {
      const video = await videoRepo.get(req.user.id, req.params.id);
      if (!video) {
        return res.status(404).json({ error: "Not found" });
      }

      const resolution = (req.query.res || "original").toString();
      const key = chooseKey(video, resolution);
      if (!key) {
        return res.status(404).json({ error: "Rendition not found" });
      }

      const filename = `${video.title || "video"}_${resolution}.mp4`;
      await streamS3Object({ key }, res, filename);
    } catch (err) {
      const code = err.code && Number.isInteger(err.code) ? err.code : 500;
      console.error("Download error", err);
      if (!res.headersSent) {
        res.status(code).json({ error: "Download error" });
      }
    }
  });

  router.get("/videos/:id/thumb", authRequired, async (req, res) => {
    try {
      const video = await videoRepo.get(req.user.id, req.params.id);
      if (!video?.thumbnailKey) {
        throw Object.assign(new Error("No thumbnail"), { code: 404 });
      }
      await streamS3Object({ key: video.thumbnailKey }, res);
    } catch (err) {
      const svg = `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 160 90" width="160" height="90">
  <rect width="160" height="90" fill="#0f172a"/>
  <text x="20" y="50" font-family="Arial" font-size="14" fill="#e2e8f0">No thumbnail</text>
</svg>`;
      res.setHeader("Content-Type", "image/svg+xml");
      res.setHeader("Cache-Control", "no-cache");
      res.send(svg);
    }
  });

  return router;
}
