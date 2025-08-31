// test-hf.js (ESM)
import fs from "fs/promises";

const TOKEN = process.env.HF_API_TOKEN;
const IMG = "C:/Users/Lenovo/OneDrive/Desktop/CAB432/data/users/2/23/thumb.jpg";
const MODEL = "google/vit-base-patch16-224"; // try "microsoft/resnet-50" if needed

const bytes = await fs.readFile(IMG);

const controller = new AbortController();
const t = setTimeout(() => controller.abort(), 120000); // 120s hard timeout

const res = await fetch(`https://api-inference.huggingface.co/models/${MODEL}`, {
  method: "POST",
  headers: {
    Authorization: `Bearer ${TOKEN}`,
    "Content-Type": "application/octet-stream",
    "Accept": "application/json",
    "x-wait-for-model": "true",
  },
  body: bytes,
  signal: controller.signal,
});

clearTimeout(t);
console.log(res.status, await res.text());
