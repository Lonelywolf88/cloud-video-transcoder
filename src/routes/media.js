import { Router } from "express";
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

  async function findVideo(req) {
    const videoId = req.params.id;
    if (req.user.groups.includes("Admin")) {
      const all = await videoRepo.listAll();
      return all.find(v => v.videoId === videoId) || null;
    }
    return await videoRepo.get(req.user.sub, videoId);
  }

  // 🎬 Stream video
  router.get("/videos/:id/stream", authRequired, async (req, res) => {
    try {
      const video = await findVideo(req);
      if (!video) return res.status(404).json({ error: "Not found" });

      const resolution = (req.query.res || "original").toString();
      const key = chooseKey(video, resolution);
      if (!key) return res.status(404).json({ error: "Rendition not found" });

      const { url, expiresIn } = await createDownloadUrl({
        key,
        responseContentType: "video/mp4"
      });

      return res.json({ url, expiresIn });
    } catch (err) {
      console.error("Stream error", err);
      if (!res.headersSent) res.status(500).json({ error: "Stream error" });
    }
  });

  // 📥 Download video
  router.get("/videos/:id/download", authRequired, async (req, res) => {
    try {
      const video = await findVideo(req);
      if (!video) return res.status(404).json({ error: "Not found" });

      const resolution = (req.query.res || "original").toString();
      const key = chooseKey(video, resolution);
      if (!key) return res.status(404).json({ error: "Rendition not found" });

      const filename = `${video.title || "video"}_${resolution}.mp4`;
      const { url, expiresIn } = await createDownloadUrl({
        key,
        responseDisposition: `attachment; filename="${filename}"`
      });

      return res.json({ url, expiresIn, filename });
    } catch (err) {
      console.error("Download error", err);
      if (!res.headersSent) res.status(500).json({ error: "Download error" });
    }
  });

  // 🖼️ Thumbnail
  router.get("/videos/:id/thumb", authRequired, async (req, res) => {
    try {
      const video = await findVideo(req);
      if (!video?.thumbnailKey) throw Object.assign(new Error("No thumbnail"), { code: 404 });

      const { url, expiresIn } = await createDownloadUrl({
        key: video.thumbnailKey,
        responseContentType: "image/jpeg"
      });

      return res.json({ url, expiresIn });
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
