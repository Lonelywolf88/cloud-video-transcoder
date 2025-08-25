import fs from "fs/promises";
import path from "path";

export const DATA_DIR = process.env.DATA_DIR || "./data";

export async function ensureVideoDir(userId, videoId) {
  const base = path.join(DATA_DIR, "users", String(userId), String(videoId));
  await fs.mkdir(base, { recursive: true });
  return base;
}

export function originalPath(dir) {
  return path.join(dir, "original.mp4");
}

export function thumbPath(dir) {
  return path.join(dir, "thumb.jpg");
}
