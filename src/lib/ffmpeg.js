import { spawn } from "child_process";
import { promisify } from "util";
import { exec as execCb } from "child_process";
const exec = promisify(execCb);

const FFMPEG = process.env.FFMPEG_PATH || "ffmpeg";
const FFPROBE = process.env.FFPROBE_PATH || "ffprobe";

export async function ffprobeDurationSeconds(inputPath) {
  // returns integer seconds duration (ceil)
  try {
    const { stdout } = await exec(`${FFPROBE} -v error -show_entries format=duration -of default=noprint_wrappers=1:nokey=1 "${inputPath}"`);
    const sec = Math.ceil(parseFloat(stdout.trim() || "0"));
    return isFinite(sec) ? sec : null;
  } catch {
    return null;
  }
}

export function runFfmpeg(args, { cwd, signal } = {}) {
  return new Promise((resolve, reject) => {
    const p = spawn(FFMPEG, args, { cwd, stdio: ["ignore", "pipe", "pipe"], signal });
    let stderr = "";

    // Fallback for Node versions without spawn signal support
    if (signal && typeof signal.addEventListener === "function") {
      const onAbort = () => {
        try { p.kill("SIGKILL"); } catch {}
      };
      signal.addEventListener("abort", onAbort, { once: true });
    }

    p.stderr.on("data", (d) => { stderr += d.toString(); });
    p.on("close", (code) => {
      if (code === 0) resolve({ ok: true });
      else reject(new Error(`ffmpeg exited ${code}: ${stderr.slice(0, 400)}`));
    });
  });
}

export async function transcodeProfiles(original, outputs, opts = {}) {
  // outputs: [{vf:"scale=-2:1080", out:"1080.mp4", crf:22, ab:"128k"}, ...]
  for (const o of outputs) {
    const args = [
      "-y", "-i", original,
      "-c:v", "libx264", "-preset", "slow", "-crf", String(o.crf ?? 22),
      "-vf", o.vf,
      "-c:a", "aac", "-b:a", o.ab ?? "128k",
      o.out
    ];
    await runFfmpeg(args, opts);
  }
}

export async function extractThumbnail(original, outThumb, atSec = 3, opts = {}) {
  const args = [
    "-y",
    "-ss", new Date(atSec * 1000).toISOString().slice(11, 19), // "00:00:03"
    "-i", original,
    "-frames:v", "1",
    "-q:v", "2",
    outThumb
  ];
  await runFfmpeg(args, opts);
}
