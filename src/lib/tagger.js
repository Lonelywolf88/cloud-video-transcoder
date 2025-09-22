import fs from "fs/promises";

const HF_TOKEN = process.env.HF_API_TOKEN;
const MODEL = process.env.HF_IMAGE_MODEL || "microsoft/resnet-50";
const TOP_K = Number(process.env.TAGS_TOP_K || 5);
const MIN_SCORE = Number(process.env.TAGS_MIN_SCORE || 0);

export async function classifyImageAtPath(imagePath) {
  if (!HF_TOKEN) return [];
  const bytes = await fs.readFile(imagePath);

  const res = await fetch(
    `https://api-inference.huggingface.co/models/${encodeURIComponent(MODEL)}`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${HF_TOKEN}`,
        "Content-Type": "application/octet-stream",
        "Accept": "application/json",
        "x-wait-for-model": "true"
      },
      body: bytes
    }
  );

  if (!res.ok) {
    throw new Error(`[tagger] HF error ${res.status}`);
  }

  const data = await res.json();
  if (!Array.isArray(data)) return [];

  return data
    .slice(0, TOP_K)
    .map((entry) => ({
      tag: entry?.label,
      score: typeof entry?.score === "number" ? entry.score : undefined
    }))
    .filter((entry) => entry.tag && (entry.score === undefined || entry.score >= MIN_SCORE));
}
