import { spawn } from "node:child_process";

const YT_DLP = process.env.YT_DLP_BINARY || "yt-dlp";

export function ytDownloadToMp4(url, dst, { signal } = {}) {
  return new Promise((resolve, reject) => {
    const args = [
      url,
      "-o", dst,
      "-f", "bv*+ba/b",
      "--recode-video", "mp4",
      "--no-check-certificate",
      "--restrict-filenames",
      "--no-warnings",
  "--no-progress",
  "--force-ipv4"
    ];

    const child = spawn(YT_DLP, args, { stdio: ["ignore", "pipe", "pipe"] });

    let stderr = "";
    child.stderr.on("data", (d) => { stderr += d.toString(); });
    child.on("error", (err) => reject(new Error(`yt-dlp spawn error: ${err.message}`)));
    child.on("close", (code) => {
      if (code === 0) return resolve();
      reject(new Error(`yt-dlp exited ${code}: ${stderr.slice(0, 500)}`));
    });

    if (signal?.addEventListener) {
      signal.addEventListener("abort", () => { try { child.kill("SIGKILL"); } catch {} }, { once: true });
    }
  });
}

export function getYtBinary() { return YT_DLP; }
