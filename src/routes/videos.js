import { Router } from "express";
import crypto from "node:crypto";
import { body, query, validationResult } from "express-validator";
import { authRequired } from "../middleware/auth.js";
import { upload } from "../lib/upload.js";
import { ensureVideoDir, originalPath } from "../lib/paths.js";
import fs from "fs/promises";
import path from "path";
import slugify from "slugify";
import { exec as execCb } from "child_process";
import { promisify } from "util";
// Removed YouTube import support
import {
  getCurrentTranscodeId,
  cancelCurrentTranscode,
} from "../worker/transcodeWorker.js";

const exec = promisify(execCb);

async function moveFile(src, dest) {
  try {
    await fs.rename(src, dest);
  } catch (err) {
    // Handle cross-device move (EXDEV) across mount points (e.g., /app -> /data)
    if (err && (err.code === "EXDEV" || String(err).includes("cross-device"))) {
      await fs.copyFile(src, dest);
      await fs.unlink(src).catch(() => {});
    } else {
      throw err;
    }
  }
}

export function videoRoutes(db) {
  const router = Router();

  // POST /api/v1/videos : file upload only
  router.post(
    "/videos",
    authRequired,
    upload.single("file"),
    body("title").optional().isString().trim().isLength({ min: 1 }),
    async (req, res) => {
      const errors = validationResult(req);
      if (!req.file) {
        return res.status(400).json({ error: "Provide a video file upload" });
      }

      const user = req.user; // from JWT
      const title = req.body.title;
      let videoId;

      try {
        // 1) Create DB row to get videoId
        const defaultTitle = title || req.file?.originalname || "video";
        const slug =
          slugify(defaultTitle, { lower: true, strict: true }) || "video";

        const result = await db.run(
          `INSERT INTO videos (owner_id, title, source_type, source_url, original_path, status)
           VALUES (?, ?, ?, ?, ?, 'ingesting')`,
          [user.id, slug, "upload", null, "PENDING"]
        );
        videoId = result.lastID;

        // 2) Prepare final dir & original path
        const vdir = await ensureVideoDir(user.id, videoId);
        const dst = originalPath(vdir);
        await fs.mkdir(path.dirname(dst), { recursive: true });

        // 3) Move the uploaded file to destination
        await moveFile(req.file.path, dst);

        // 4) Update original_path and mark as queued now that we have it
        await db.run(
          `UPDATE videos SET original_path = ?, status = 'queued' WHERE id = ?`,
          [dst, videoId]
        );

        return res.status(201).json({
          videoId,
          status: "queued",
          message: "Video ingested. Ready for transcoding.",
        });
      } catch (e) {
        console.error("Ingest failed:", e);
        // cleanup temp file if exists
        if (req.file?.path) {
          try {
            await fs.unlink(req.file.path);
          } catch {}
        }
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

  // GET /api/v1/videos?status=&q=&tag=&page=&pageSize=&per_page=&sort=
  router.get(
    "/videos",
    authRequired,
    query("status").optional().isString(),
    query("q").optional().isString(),
    query("tag").optional().isString(),
    query("page").optional().isInt({ min: 1 }).toInt(),
    query("pageSize").optional().isInt({ min: 1, max: 100 }).toInt(), // legacy
    query("per_page").optional().isInt({ min: 1, max: 100 }).toInt(),
    query("sort").optional().isString(),
    async (req, res) => {
      const user = req.user;
      const { status, q, tag } = req.query;
      const page = req.query.page || 1;
      const perPage = req.query.per_page || req.query.pageSize || 10;
      const offset = (page - 1) * perPage;

      // Sorting support
      const sortRaw = (req.query.sort || "-created_at").toString();
      const allowed = new Set([
        "created_at",
        "-created_at",
        "title",
        "-title",
        "status",
        "-status",
      ]);
      const sort = allowed.has(sortRaw) ? sortRaw : "-created_at";
      const [col, dir] = sort.startsWith("-")
        ? [sort.slice(1), "DESC"]
        : [sort, "ASC"];

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
      if (tag) {
        // filter by tags stored in video_tags
        where.push(
          `EXISTS (SELECT 1 FROM video_tags t WHERE t.video_id = v.id AND t.tag LIKE ?)`
        );
        params.push(`%${tag}%`);
      }
      const whereSql = where.length ? `WHERE ${where.join(" AND ")}` : "";

      // page of videos
      const rows = await db.all(
        `SELECT v.id, v.title, v.status, v.source_url, v.error_msg, v.created_at
       FROM videos v
       ${whereSql}
       ORDER BY ${col} ${dir}
       LIMIT ? OFFSET ?`,
        [...params, perPage, offset]
      );

      // count
      const { count } = await db.get(
        `SELECT COUNT(*) as count FROM videos v ${whereSql}`,
        params
      );

      // attach top 5 tags per video (single batched query)
      const ids = rows.map((r) => r.id);
      let tagsByVideo = new Map();
      if (ids.length) {
        const ph = ids.map(() => "?").join(",");
        const tagRows = await db.all(
          `SELECT video_id, tag
         FROM video_tags
         WHERE video_id IN (${ph})
         ORDER BY score DESC, created_at DESC`,
          ids
        );
        for (const tr of tagRows) {
          const arr = tagsByVideo.get(tr.video_id) || [];
          if (arr.length < 5) arr.push(tr.tag);
          tagsByVideo.set(tr.video_id, arr);
        }
      }
      const items = rows.map((r) => ({
        ...r,
        tags: tagsByVideo.get(r.id) || [],
      }));

      // Pagination headers
      res.set("X-Total-Count", String(count));
      const base = `${req.protocol}://${req.get("host")}${req.baseUrl}/videos`;
      const qs = (p) =>
        new URLSearchParams({
          ...(status ? { status: String(status) } : {}),
          ...(q ? { q: String(q) } : {}),
          ...(tag ? { tag: String(tag) } : {}),
          ...(sort ? { sort } : {}),
          page: String(p),
          per_page: String(perPage),
        }).toString();
      const links = [];
      const last = Math.max(1, Math.ceil(count / perPage));
      links.push(`<${base}?${qs(1)}>; rel="first"`);
      links.push(`<${base}?${qs(last)}>; rel="last"`);
      if (page > 1) links.push(`<${base}?${qs(page - 1)}>; rel="prev"`);
      if (page < last) links.push(`<${base}?${qs(page + 1)}>; rel="next"`);
      res.set("Link", links.join(", "));

      res.json({ page, pageSize: perPage, total: count, items });
    }
  );

  // GET /api/v1/videos?status=&q=&tag=&page=&pageSize=&per_page=&sort=
  // router.get(
  //   "/videos",
  //   authRequired,
  //   query("status").optional().isString(),
  //   query("q").optional().isString(),
  //   query("tag").optional().isString(),
  //   query("page").optional().isInt({ min: 1 }).toInt(),
  //   query("pageSize").optional().isInt({ min: 1, max: 100 }).toInt(), // legacy
  //   query("per_page").optional().isInt({ min: 1, max: 100 }).toInt(),
  //   query("sort").optional().isString(),
  //   async (req, res) => {
  //     const user = req.user;
  //     const { status, q, tag } = req.query;
  //     const page = req.query.page || 1;
  //     const perPage = req.query.per_page || req.query.pageSize || 10;
  //     const offset = (page - 1) * perPage;

  //     // Sorting support
  //     const sortRaw = (req.query.sort || "-created_at").toString();
  //     const allowed = new Set([
  //       "created_at",
  //       "-created_at",
  //       "title",
  //       "-title",
  //       "status",
  //       "-status",
  //     ]);
  //     const sort = allowed.has(sortRaw) ? sortRaw : "-created_at";
  //     const [col, dir] = sort.startsWith("-")
  //       ? [sort.slice(1), "DESC"]
  //       : [sort, "ASC"];

  //     const where = ["owner_id = ?"];
  //     const params = [user.id];

  //     if (status) {
  //       where.push("status = ?");
  //       params.push(status);
  //     }
  //     if (q) {
  //       where.push("title LIKE ?");
  //       params.push(`%${q}%`);
  //     }
  //     if (tag) {
  //       // simple LIKE on JSON string; try exact element and loose fallback
  //       where.push("(auto_tags LIKE ? OR auto_tags LIKE ?)");
  //       params.push(`%"${tag}"%`, `%${tag}%`);
  //     }
  //     const whereSql = where.length ? `WHERE ${where.join(" AND ")}` : "";

  //     const rows = await db.all(
  //       `SELECT id, title, status, source_url, error_msg, created_at
  //        FROM videos
  //        ${whereSql}
  //        ORDER BY ${col} ${dir}
  //        LIMIT ? OFFSET ?`,
  //       [...params, perPage, offset]
  //     );

  //     const { count } = await db.get(
  //       `SELECT COUNT(*) as count FROM videos ${whereSql}`,
  //       params
  //     );

  //     // Pagination headers for generic clients
  //     res.set("X-Total-Count", String(count));
  //     const base = `${req.protocol}://${req.get("host")}${req.baseUrl}/videos`;
  //     const qs = (p) =>
  //       new URLSearchParams({
  //         ...(status ? { status: String(status) } : {}),
  //         ...(q ? { q: String(q) } : {}),
  //         ...(tag ? { tag: String(tag) } : {}),
  //         ...(sort ? { sort } : {}),
  //         page: String(p),
  //         per_page: String(perPage),
  //       }).toString();
  //     const links = [];
  //     const last = Math.max(1, Math.ceil(count / perPage));
  //     links.push(`<${base}?${qs(1)}>; rel="first"`);
  //     links.push(`<${base}?${qs(last)}>; rel="last"`);
  //     if (page > 1) links.push(`<${base}?${qs(page - 1)}>; rel="prev"`);
  //     if (page < last) links.push(`<${base}?${qs(page + 1)}>; rel="next"`);
  //     res.set("Link", links.join(", "));

  //     res.json({ page, pageSize: perPage, total: count, items: rows });
  //   }
  // );

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
    if (video.owner_id !== user.id)
      return res.status(403).json({ error: "Forbidden" });

    const renditions = await db.all(
      `SELECT id, resolution, path, size_bytes, created_at FROM renditions WHERE video_id = ? ORDER BY resolution DESC`,
      [id]
    );

    const tags = await db.all(
      `SELECT tag FROM video_tags WHERE video_id = ? ORDER BY score DESC, created_at DESC LIMIT 5`,
      [id]
    );

    const payload = {
      id: video.id,
      title: video.title,
      status: video.status,
      source_type: video.source_type,
      source_url: video.source_url,
      duration_s: video.duration_s,
      original_path: video.original_path,
      thumb_path: video.thumb_path,
      error_msg: video.error_msg,
      tags: tags.map((t) => t.tag),
    };
    const etag = `W/"vid-${video.id}-${crypto
      .createHash("sha1")
      .update(JSON.stringify(payload))
      .digest("hex")}"`;
    if (req.headers["if-none-match"] === etag) {
      return res.status(304).end();
    }
    res.set("ETag", etag);
    res.json(payload);
  });

  // POST /api/v1/videos/:id/cancel
  router.post("/videos/:id/cancel", authRequired, async (req, res) => {
    const { id } = req.params;
    const v = await db.get(
      `SELECT id, owner_id, status FROM videos WHERE id = ?`,
      [id]
    );
    if (!v) return res.status(404).json({ error: "Not found" });
    if (v.owner_id !== req.user.id)
      return res.status(403).json({ error: "Forbidden" });

    if (v.status === "queued") {
      await db.run(
        `UPDATE videos SET status = 'failed', error_msg = 'canceled by user' WHERE id = ?`,
        [id]
      );
      return res.json({ canceled: true, status: "failed" });
    }

    if (v.status === "processing") {
      if (getCurrentTranscodeId() === v.id) {
        cancelCurrentTranscode();
        return res.json({ canceling: true, status: "processing" });
      }
      return res
        .status(409)
        .json({ error: "Worker is not on this video right now" });
    }

    return res
      .status(400)
      .json({ error: `Cannot cancel in status ${v.status}` });
  });

  // DELETE /api/v1/videos/:id
  router.delete("/videos/:id", authRequired, async (req, res) => {
    const { id } = req.params;
    const v = await db.get(
      `SELECT id, owner_id, status, original_path FROM videos WHERE id = ?`,
      [id]
    );
    if (!v) return res.status(404).json({ error: "Not found" });
    if (v.owner_id !== req.user.id)
      return res.status(403).json({ error: "Forbidden" });

    // If currently processing, try to cancel gracefully
    if (v.status === "processing" && getCurrentTranscodeId() === v.id) {
      try {
        cancelCurrentTranscode();
      } catch {}
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
