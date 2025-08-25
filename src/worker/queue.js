// Tiny in-memory queue to keep single-runtime simplicity
const queue = [];
let running = false;

export function enqueue(job) {
  queue.push(job);
  runNext();
}

async function runNext() {
  if (running) return;
  const job = queue.shift();
  if (!job) return;
  running = true;
  try {
    await job();
  } catch (e) {
    console.error("Job failed:", e);
  } finally {
    running = false;
    if (queue.length > 0) runNext();
  }
}
