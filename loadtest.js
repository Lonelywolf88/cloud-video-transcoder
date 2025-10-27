// Aggressive load test helper.
// Hits a public endpoint with high concurrency and random query params
// to avoid caching. Adjust CONCURRENCY/REQUESTS to push CPU harder.

import { setTimeout as sleep } from "node:timers/promises";

const ENDPOINT = process.env.LOADTEST_ENDPOINT || "https://g58.cab432.com/api/v1/health";
const REQUESTS = Number(process.env.LOADTEST_REQUESTS || 1000000);
const CONCURRENCY = Number(process.env.LOADTEST_CONCURRENCY || 200);
const RETRY_LIMIT = 3;

let inFlight = 0;
let completed = 0;
let failures = 0;

async function hitOnce(id, attempt = 1) {
  const url = new URL(ENDPOINT);
  url.searchParams.set("ts", Date.now().toString());
  url.searchParams.set("req", id.toString());

  const started = performance.now();
  try {
    const res = await fetch(url, {
      method: "GET",
      headers: {
        "Cache-Control": "no-cache",
        "Pragma": "no-cache",
      },
    });
    const duration = performance.now() - started;
    if (!res.ok) {
      throw new Error(`status ${res.status}`);
    }
    completed++;
    if (completed % 100 === 0) {
      console.log(
        `[loadtest] ${completed}/${REQUESTS} succeeded, failures=${failures}, inFlight=${inFlight}, last=${duration.toFixed(
          1
        )}ms`
      );
    }
  } catch (err) {
    failures++;
    if (attempt < RETRY_LIMIT) {
      await sleep(5);
      return hitOnce(id, attempt + 1);
    }
    console.warn(
      `[loadtest] request ${id} failed after ${attempt} attempts: ${err?.message || err}`
    );
  } finally {
    inFlight--;
  }
}

async function pump() {
  let issued = 0;
  while (issued < REQUESTS) {
    if (inFlight < CONCURRENCY) {
      inFlight++;
      const id = ++issued;
      hitOnce(id);
    } else {
      await sleep(1);
    }
  }

  while (inFlight > 0) {
    await sleep(10);
  }

  console.log(
    `[loadtest] completed ${completed} requests (${failures} failures) to ${ENDPOINT}`
  );
}

pump().catch((err) => {
  console.error("[loadtest] fatal error", err);
  process.exitCode = 1;
});
