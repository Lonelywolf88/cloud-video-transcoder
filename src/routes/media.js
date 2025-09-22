import { Router } from "express";
import mime from "mime-types";
import { authRequired } from "../middleware/auth.js";
import { videoRepo } from "../lib/paths.js";
import { createDownloadUrl } from "../lib/s3Presign.js";

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
      const video = await videoRepo.get(req.user.sub, req.params.id);
      if (!video) {
        return res.status(404).json({ error: "Not found" });
      }

      const resolution = (req.query.res || "original").toString();
      const key = chooseKey(video, resolution);
      if (!key) {
        return res.status(404).json({ error: "Rendition not found" });
      }

      const { url } = await createDownloadUrl({
        key,
        responseContentType: "video/mp4"
      });
      return res.redirect(url);
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
      const video = await videoRepo.get(req.user.sub, req.params.id);
      if (!video) {
        return res.status(404).json({ error: "Not found" });
      }

      const resolution = (req.query.res || "original").toString();
      const key = chooseKey(video, resolution);
      if (!key) {
        return res.status(404).json({ error: "Rendition not found" });
      }

      const filename = `${video.title || "video"}_${resolution}.mp4`;
      const { url } = await createDownloadUrl({
        key,
        responseDisposition: `attachment; filename="${filename}"`
      });
      return res.redirect(url);
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
      const video = await videoRepo.get(req.user.sub, req.params.id);
      if (!video?.thumbnailKey) {
        throw Object.assign(new Error("No thumbnail"), { code: 404 });
      }
      const { url } = await createDownloadUrl({
        key: video.thumbnailKey,
        responseContentType: "image/jpeg"
      });
      return res.redirect(url);
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
