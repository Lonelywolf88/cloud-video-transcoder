import fs from "fs/promises";
import path from "path";
import { enqueue } from "./queue.js";
import { classifyImageAtPath } from "../lib/tagger.js";
import {
  transcodeProfiles,
  extractThumbnail,
  ffprobeDurationSeconds,
} from "../lib/ffmpeg.js";
import { ensureVideoDir, originalPath, thumbPath } from "../lib/paths.js";

let current = null; // { videoId, abortController }

async function saveTags(db, videoId, tags) {
  await db.run("BEGIN");
  try {
    await db.run("DELETE FROM video_tags WHERE video_id = ?", [videoId]); // ← array

    for (const t of tags) {
      const tag = t?.tag ?? String(t);
      const score = t?.score ?? 1.0;
      await db.run(
        "INSERT INTO video_tags (video_id, tag, score) VALUES (?, ?, ?)",
        [videoId, tag, score] // ← array
      );
    }

    await db.run("COMMIT");
    console.log(`[worker] tagging saved ${tags.length} rows for video=${videoId}`);
  } catch (e) {
    await db.run("ROLLBACK");
    console.warn("[worker] saveTags failed; rolled back:", e?.message || e);
    throw e;
  }
}


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
        const claimed = await db.run(
          `UPDATE videos SET status = 'processing' WHERE id = ? AND status = 'queued'`,
          [v.id]
        );
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
              await db.run(
                `UPDATE videos SET status = 'queued', error_msg = 'waiting for original' WHERE id = ?`,
                [videoId]
              );
              return;
            }

            // run ffprobe for duration
            const duration = await ffprobeDurationSeconds(orig);
            if (duration) {
              await db.run(`UPDATE videos SET duration_s = ? WHERE id = ?`, [
                duration,
                videoId,
              ]);
            }

            // transcode
            const profiles = [
              {
                vf: "scale=-2:1080",
                out: path.join(vdir, "1080.mp4"),
                res: "1080",
                crf: 22,
                ab: "128k",
              },
              {
                vf: "scale=-2:720",
                out: path.join(vdir, "720.mp4"),
                res: "720",
                crf: 23,
                ab: "128k",
              },
              {
                vf: "scale=-2:480",
                out: path.join(vdir, "480.mp4"),
                res: "480",
                crf: 24,
                ab: "96k",
              },
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
            await db.run(`UPDATE videos SET thumb_path = ? WHERE id = ?`, [
              tpath,
              videoId,
            ]);

            // after: UPDATE videos SET thumb_path = ?
            try {
              console.log(`[worker] tagging start video=${videoId}`);
              const tags = await classifyImageAtPath(tpath);
              console.log(
                `[worker] tagging got ${
                  Array.isArray(tags) ? tags.length : 0
                } tags`,
                tags
              );
              if (Array.isArray(tags) && tags.length) {
                await saveTags(db, videoId, tags);
                console.log(`[worker] tagging saved for video=${videoId}`);
              } else {
                console.warn(
                  `[worker] tagging returned empty for video=${videoId}`
                );
              }
            } catch (e) {
              console.warn(
                `[worker] tagging failed for video=${videoId}:`,
                e?.message || e
              );
            }

            // done
            await db.run(
              `UPDATE videos SET status = 'completed' WHERE id = ?`,
              [videoId]
            );
          } catch (err) {
            const isAbort = err?.name === "AbortError";
            console.error(
              "Transcode",
              isAbort ? "canceled" : "failed",
              videoId,
              err
            );
            await db.run(
              `UPDATE videos SET status = ?, error_msg = ? WHERE id = ?`,
              [
                isAbort ? "failed" : "failed",
                String(err).slice(0, 500),
                videoId,
              ]
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
