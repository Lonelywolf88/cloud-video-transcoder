import { Router } from "express";
import fs from "fs";
import fsp from "fs/promises";
import path from "path";
import mime from "mime-types";
import { authRequired } from "../middleware/auth.js";
import { ensureVideoDir, originalPath, thumbPath } from "../lib/paths.js";

async function getPaths(db, videoId, userId, res) {
  const v = await db.get(`SELECT id, owner_id, title, thumb_path, original_path, status FROM videos WHERE id = ?`, [videoId]);
  if (!v) throw { code: 404, msg: "Not found" };
  if (v.owner_id !== userId) throw { code: 403, msg: "Forbidden" };

  const vdir = await ensureVideoDir(userId, videoId);
  if (res === "thumb") return { filePath: v.thumb_path || thumbPath(vdir), mime: "image/jpeg", filename: "thumb.jpg" };

  let filePath;
  if (res === "original") filePath = v.original_path || originalPath(vdir);
  else {
    const r = await db.get(`SELECT path FROM renditions WHERE video_id = ? AND resolution = ?`, [videoId, res]);
    if (!r) throw { code: 404, msg: "Rendition not found" };
    filePath = r.path;
  }
  const filename = (v.title || `video_${videoId}`) + `_${res}.mp4`;
  const mt = mime.lookup(filePath) || "application/octet-stream";
  return { filePath, mime: mt, filename };
}

export function mediaRoutes(db) {
  const router = Router();

  // GET /api/v1/videos/:id/stream?res=1080|720|480|original
  router.get("/videos/:id/stream", authRequired, async (req, res) => {
    try {
      const resolution = req.query.res || "original";
      const { filePath, mime } = await getPaths(db, req.params.id, req.user.id, resolution);

      const stat = await fsp.stat(filePath);
      const range = req.headers.range;

      if (!range) {
        res.setHeader("Content-Type", mime);
        res.setHeader("Content-Length", stat.size);
        fs.createReadStream(filePath).pipe(res);
        return;
      }

      // Range support
      const [startStr, endStr] = range.replace(/bytes=/, "").split("-");
      const start = parseInt(startStr, 10);
      const end = endStr ? parseInt(endStr, 10) : stat.size - 1;
      const chunkSize = (end - start) + 1;

      res.writeHead(206, {
        "Content-Range": `bytes ${start}-${end}/${stat.size}`,
        "Accept-Ranges": "bytes",
        "Content-Length": chunkSize,
        "Content-Type": mime
      });
      fs.createReadStream(filePath, { start, end }).pipe(res);
    } catch (e) {
      const code = e.code || 500;
      res.status(code).json({ error: e.msg || "Stream error" });
    }
  });

  // GET /api/v1/videos/:id/download?res=1080|720|480|original
  router.get("/videos/:id/download", authRequired, async (req, res) => {
    try {
      const resolution = req.query.res || "original";
      const { filePath, mime, filename } = await getPaths(db, req.params.id, req.user.id, resolution);
      res.setHeader("Content-Type", mime);
      res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
      fs.createReadStream(filePath).pipe(res);
    } catch (e) {
      const code = e.code || 500;
      res.status(code).json({ error: e.msg || "Download error" });
    }
  });

  // subtitles route removed

  // GET /api/v1/videos/:id/thumb
  router.get("/videos/:id/thumb", authRequired, async (req, res) => {
    try {
      const { filePath } = await getPaths(db, req.params.id, req.user.id, "thumb");
      const stat = await fsp.stat(filePath);
      res.setHeader("Content-Type", "image/jpeg");
      res.setHeader("Content-Length", stat.size);
      fs.createReadStream(filePath).pipe(res);
    } catch (e) {
      // Fallback: inline SVG placeholder for missing thumbs
      const svg = `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 160 90" width="160" height="90">
  <defs>
    <linearGradient id="g" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="#0ea5e9" stop-opacity="0.35"/>
      <stop offset="100%" stop-color="#10b981" stop-opacity="0.35"/>
    </linearGradient>
  </defs>
  <rect width="160" height="90" fill="#0f172a"/>
  <rect width="160" height="90" fill="url(#g)"/>
  <g font-family="Inter, Arial, sans-serif" font-size="12" fill="#e2e8f0" opacity="0.9">
    <text x="15" y="22">No thumbnail</text>
  </g>
  <g transform="translate(120,55)">
    <circle r="14" fill="#e2e8f0" opacity="0.15"/>
    <text x="-9" y="5" font-size="16" fill="#94a3b8">🏸</text>
  </g>
</svg>`;
      res.setHeader("Content-Type", "image/svg+xml");
      res.setHeader("Cache-Control", "no-cache");
      res.send(svg);
    }
  });

  return router;
}
