import fs from "fs/promises";
import path from "path";
import { enqueue } from "./queue.js";
import { transcodeProfiles, extractThumbnail, ffprobeDurationSeconds } from "../lib/ffmpeg.js";
import { ensureVideoDir, originalPath, thumbPath } from "../lib/paths.js";

let current = null; // { videoId, abortController }

export function getCurrentTranscodeId() {
  return current?.videoId ?? null;
}

export function cancelCurrentTranscode() {
  if (current) current.abortController.abort();
}

export function startTranscodeWorker(db) {
  // Poll DB for queued items every X seconds and enqueue one job per item
  const POLL_MS = 3000;

  async function poll() {
    try {
      const queued = await db.all(
        `SELECT id, owner_id FROM videos WHERE status = 'queued' ORDER BY created_at ASC LIMIT 3`
      );
      for (const v of queued) {
        // claim it
        const claimed = await db.run(`UPDATE videos SET status = 'processing' WHERE id = ? AND status = 'queued'`, [v.id]);
        if (claimed.changes === 0) continue;

    enqueue(async () => {
          const videoId = v.id;
          const ownerId = v.owner_id;
          const vdir = await ensureVideoDir(ownerId, videoId);
          const orig = originalPath(vdir);

          try {
      const ac = new AbortController();
      current = { videoId, abortController: ac };
            // sanity: file exists?
            try {
              await fs.access(orig);
            } catch {
              await db.run(`UPDATE videos SET status = 'queued', error_msg = 'waiting for original' WHERE id = ?`, [videoId]);
              return;
            }

            // run ffprobe for duration
            const duration = await ffprobeDurationSeconds(orig);
            if (duration) {
              await db.run(`UPDATE videos SET duration_s = ? WHERE id = ?`, [duration, videoId]);
            }

            // transcode
            const profiles = [
              { vf: "scale=-2:1080", out: path.join(vdir, "1080.mp4"), res: "1080", crf: 22, ab: "128k" },
              { vf: "scale=-2:720",  out: path.join(vdir, "720.mp4"),  res: "720",  crf: 23, ab: "128k" },
              { vf: "scale=-2:480",  out: path.join(vdir, "480.mp4"),  res: "480",  crf: 24, ab: "96k"  },
            ];
            await transcodeProfiles(orig, profiles, { signal: ac.signal });

            // insert renditions
            for (const p of profiles) {
              const stat = await fs.stat(p.out);
              await db.run(
                `INSERT INTO renditions (video_id, resolution, path, size_bytes) VALUES (?, ?, ?, ?)`,
                [videoId, p.res, p.out, stat.size]
              );
            }

            // thumbnail
            const tpath = thumbPath(vdir);
            await extractThumbnail(orig, tpath, 3, { signal: ac.signal });
            await db.run(`UPDATE videos SET thumb_path = ? WHERE id = ?`, [tpath, videoId]);

            // done
            await db.run(`UPDATE videos SET status = 'completed' WHERE id = ?`, [videoId]);
          } catch (err) {
            const isAbort = err?.name === "AbortError";
            console.error("Transcode", isAbort ? "canceled" : "failed", videoId, err);
            await db.run(
              `UPDATE videos SET status = ?, error_msg = ? WHERE id = ?`,
              [isAbort ? 'failed' : 'failed', String(err).slice(0, 500), videoId]
            );
          } finally {
            current = null;
          }
        });
      }
    } catch (e) {
      console.error("poll error:", e);
    } finally {
      setTimeout(poll, POLL_MS);
    }
  }
  poll();
}
