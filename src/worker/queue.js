// Tiny in-memory queue with configurable concurrency for CPU load testing
const queue = [];
let running = 0;
let concurrency = Math.max(1, parseInt(process.env.WORKER_CONCURRENCY || "1", 10) || 1);

export function enqueue(job) {
  queue.push(job);
  runNext();
}

function runNext() {
  while (running < concurrency && queue.length > 0) {
    const job = queue.shift();
    running++;
    job()
      .catch((e) => console.error("Job failed:", e))
      .finally(() => {
        running--;
        runNext();
      });
  }
}
