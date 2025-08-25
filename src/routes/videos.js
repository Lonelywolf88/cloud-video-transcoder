import { Router } from "express";
import { body, query, validationResult } from "express-validator";
import { authRequired } from "../middleware/auth.js";
import { upload } from "../lib/upload.js";
import { ensureVideoDir, originalPath } from "../lib/paths.js";
import fs from "fs/promises";
import path from "path";
import slugify from "slugify";
import { exec as execCb } from "child_process";
import { promisify } from "util";
import ytdlp from "yt-dlp-exec";
import { getCurrentTranscodeId, cancelCurrentTranscode } from "../worker/transcodeWorker.js";

const exec = promisify(execCb);

export function videoRoutes(db) {
  const router = Router();

  // POST /api/v1/videos : file upload OR youtube_url
  router.post(
    "/videos",
    authRequired,
    upload.single("file"),
    body("youtube_url").optional().isURL(),
    body("title").optional().isString().trim().isLength({ min: 1 }),
    async (req, res) => {
      const errors = validationResult(req);
      if (!errors.isEmpty() && !req.file && !req.body.youtube_url) {
        return res.status(400).json({ error: "Provide a file upload or youtube_url" });
      }

      const user = req.user; // from JWT
      const { youtube_url } = req.body;
      const title = req.body.title;
      let videoId;

      try {
        // 1) Create DB row to get videoId
        const defaultTitle = title || (req.file?.originalname || youtube_url || "video");
        const slug = slugify(defaultTitle, { lower: true, strict: true }) || "video";

        const result = await db.run(
          `INSERT INTO videos (owner_id, title, source_type, source_url, original_path, status)
           VALUES (?, ?, ?, ?, ?, 'ingesting')`,
          [user.id, slug, youtube_url ? "youtube" : "upload", youtube_url || null, "PENDING"]
        );
        videoId = result.lastID;

        // 2) Prepare final dir & original path
        const vdir = await ensureVideoDir(user.id, videoId);
        const dst = originalPath(vdir);
        await fs.mkdir(path.dirname(dst), { recursive: true });

        // 3) Move or download the original
        if (youtube_url) {
          await ytdlp(youtube_url, {
            output: dst,                 // final path
            format: "bv*+ba/b",          // best video+audio or best
            recodeVideo: "mp4",          // force mp4 output (more reliable)
            noCheckCertificates: true,
            noWarnings: true,
            restrictFilenames: true
          });
          // verify file exists after download
          await fs.access(dst);
        } else if (req.file) {
          await fs.rename(req.file.path, dst);
        } else {
          throw new Error("No input provided");
        }

  // 4) Update original_path and mark as queued now that we have it
  await db.run(`UPDATE videos SET original_path = ?, status = 'queued' WHERE id = ?`, [dst, videoId]);

        return res.status(201).json({
          videoId,
          status: "queued",
          message: "Video ingested. Ready for transcoding."
        });
      } catch (e) {
        console.error("Ingest failed:", e);
        // cleanup temp file if exists
        if (req.file?.path) { try { await fs.unlink(req.file.path); } catch {} }
        if (videoId) {
          try {
            await db.run(
              `UPDATE videos SET status = 'failed', error_msg = ? WHERE id = ?`,
              [String(e?.message || e).slice(0, 500), videoId]
            );
          } catch {}
        }
        return res.status(500).json({ error: "Failed to ingest video" });
      }
    }
  );

  // GET /api/v1/videos?status=&q=&page=&pageSize=
  router.get(
    "/videos",
    authRequired,
    query("status").optional().isString(),
    query("q").optional().isString(),
    query("page").optional().isInt({ min: 1 }).toInt(),
    query("pageSize").optional().isInt({ min: 1, max: 100 }).toInt(),
    async (req, res) => {
      const user = req.user;
      const { status, q } = req.query;
      const page = req.query.page || 1;
      const pageSize = req.query.pageSize || 10;
      const offset = (page - 1) * pageSize;

      const where = ["owner_id = ?"];
      const params = [user.id];

      if (status) {
        where.push("status = ?");
        params.push(status);
      }
      if (q) {
        where.push("title LIKE ?");
        params.push(`%${q}%`);
      }
      const whereSql = where.length ? `WHERE ${where.join(" AND ")}` : "";

      const rows = await db.all(
        `SELECT id, title, status, source_url, error_msg, created_at
         FROM videos
         ${whereSql}
         ORDER BY created_at DESC
         LIMIT ? OFFSET ?`,
        [...params, pageSize, offset]
      );

      const { count } = await db.get(
        `SELECT COUNT(*) as count FROM videos ${whereSql}`,
        params
      );

      res.json({
        page, pageSize, total: count,
        items: rows
      });
    }
  );

  // GET /api/v1/videos/:id
  router.get("/videos/:id", authRequired, async (req, res) => {
    const user = req.user;
    const { id } = req.params;

    const video = await db.get(
        `SELECT id, owner_id, title, status, original_path, thumb_path, duration_s, source_type, source_url, error_msg, created_at
       FROM videos WHERE id = ?`,
      [id]
    );
    if (!video) return res.status(404).json({ error: "Not found" });
    if (video.owner_id !== user.id) return res.status(403).json({ error: "Forbidden" });

    const renditions = await db.all(
      `SELECT id, resolution, path, size_bytes, created_at FROM renditions WHERE video_id = ? ORDER BY resolution DESC`,
      [id]
    );

    res.json({
      id: video.id,
      title: video.title,
      status: video.status,
      source_type: video.source_type,
      source_url: video.source_url,
      duration_s: video.duration_s,
      original_path: video.original_path,
      thumb_path: video.thumb_path,
      error_msg: video.error_msg,
      renditions
    });
  });

  // POST /api/v1/videos/:id/cancel
  router.post("/videos/:id/cancel", authRequired, async (req, res) => {
    const { id } = req.params;
    const v = await db.get(`SELECT id, owner_id, status FROM videos WHERE id = ?`, [id]);
    if (!v) return res.status(404).json({ error: "Not found" });
    if (v.owner_id !== req.user.id) return res.status(403).json({ error: "Forbidden" });

    if (v.status === "queued") {
      await db.run(`UPDATE videos SET status = 'failed', error_msg = 'canceled by user' WHERE id = ?`, [id]);
      return res.json({ canceled: true, status: "failed" });
    }

    if (v.status === "processing") {
      if (getCurrentTranscodeId() === v.id) {
        cancelCurrentTranscode();
        return res.json({ canceling: true, status: "processing" });
      }
      return res.status(409).json({ error: "Worker is not on this video right now" });
    }

    return res.status(400).json({ error: `Cannot cancel in status ${v.status}` });
  });

  // DELETE /api/v1/videos/:id
  router.delete("/videos/:id", authRequired, async (req, res) => {
    const { id } = req.params;
    const v = await db.get(
      `SELECT id, owner_id, status, original_path FROM videos WHERE id = ?`,
      [id]
    );
    if (!v) return res.status(404).json({ error: "Not found" });
    if (v.owner_id !== req.user.id) return res.status(403).json({ error: "Forbidden" });

    // If currently processing, try to cancel gracefully
    if (v.status === "processing" && getCurrentTranscodeId() === v.id) {
      try { cancelCurrentTranscode(); } catch {}
    }

    // Try to remove files/folder; ignore errors
    try {
      if (v.original_path) {
        const dir = path.dirname(v.original_path);
        await fs.rm(dir, { recursive: true, force: true });
      }
    } catch {}

    // Remove DB row (cascade deletes renditions)
  await db.run(`DELETE FROM videos WHERE id = ?`, [id]);
    return res.status(204).end();
  });

  return router;
}
