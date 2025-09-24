import { Router } from "express";
import { authRequired } from "../middleware/auth.js";
import { videoRepo } from "../lib/paths.js";
import { createDownloadUrl } from "../lib/s3Presign.js";
import { cacheGetBuffer, cacheSetBuffer } from "../lib/cache.js";
import crypto from "node:crypto";
import { GetObjectCommand } from "@aws-sdk/client-s3";
import { getS3Client, getS3Bucket } from "../lib/paths.js";

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

  // 🖼️ Thumbnail (cached bytes)
  router.get("/videos/:id/thumb", authRequired, async (req, res) => {
    // ===== DEBUG TEMP (thumbnail trace) BEGIN =====
    console.log('[DBG thumb] handler enter id=', req.params.id);
    const svgFallback = () => {
      const svg = `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 160 90" width="160" height="90">
  <rect width="160" height="90" fill="#0f172a"/>
  <text x="20" y="50" font-family="Arial" font-size="14" fill="#e2e8f0">No thumbnail</text>
</svg>`;
      res.setHeader("Content-Type", "image/svg+xml");
      res.setHeader("Cache-Control", "no-cache");
      return res.send(svg);
    };
    try {
      const video = await findVideo(req);
      console.log('[DBG thumb] video lookup', !!video, video?.thumbnailKey);
      if (!video?.thumbnailKey) return svgFallback();

      // Version component if available
      const version = (video.thumbnailUpdatedAt && Date.parse(video.thumbnailUpdatedAt)) || 0;
      const cacheKey = `thumb:${video.thumbnailKey}:v${version}`;

      let buf = await cacheGetBuffer(cacheKey);
      const cacheHit = !!buf;
      if (cacheHit) console.log('[DBG thumb] cache HIT', cacheKey, 'bytes', buf.length);
      if (!cacheHit) {
        console.log('[DBG thumb] cache MISS', cacheKey, 'fetching S3');
        // Download from S3
        const cmd = new GetObjectCommand({ Bucket: getS3Bucket(), Key: video.thumbnailKey });
        const { Body } = await getS3Client().send(cmd);
        if (!Body) return svgFallback();
        buf = typeof Body.transformToByteArray === "function"
          ? Buffer.from(await Body.transformToByteArray())
          : await new Promise((resolve, reject) => {
              const chunks = [];
              Body.on("data", c => chunks.push(c));
              Body.on("end", () => resolve(Buffer.concat(chunks)));
              Body.on("error", reject);
            });
        // Cache for 20 minutes
        await cacheSetBuffer(cacheKey, buf, 20 * 60);
        console.log('[DBG thumb] stored in cache', cacheKey);
      }

      const etag = 'W/"' + crypto.createHash("sha1").update(buf).digest("hex") + '"';
      const inm = req.headers["if-none-match"]; // possibly array/string
      console.log('[DBG thumb] etag', etag, 'if-none-match', inm, 'cacheHit', cacheHit);
      // ===== DEBUG TEMP (verify JPEG) BEGIN =====
      if (buf.length >= 4) {
        const sig = buf.slice(0,4).toString('hex');
        const tail = buf.slice(-2).toString('hex');
        console.log('[DBG thumb] jpeg signature head=', sig, 'tail=', tail, 'len=', buf.length);
      } else {
        console.log('[DBG thumb] buffer too small', buf.length);
      }
      // ===== DEBUG TEMP (verify JPEG) END =====
      if (cacheHit && inm === etag) {
        res.statusCode = 304;
        return res.end();
      }
      res.setHeader("Content-Type", "image/jpeg");
      res.setHeader("Content-Length", buf.length);
      res.setHeader("Cache-Control", "public, max-age=1800, stale-while-revalidate=60");
      res.setHeader("ETag", etag);
      return res.end(buf);
    } catch (err) {
      console.error("Thumbnail error", err?.message || err);
      return svgFallback();
    }
    // ===== DEBUG TEMP (thumbnail trace) END =====
  });

  return router;
}
