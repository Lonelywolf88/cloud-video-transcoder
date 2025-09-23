import Memcached from "memcached";
import { promisify } from "node:util";

const memcachedAddress =
  process.env.MEMCACHED_ENDPOINT || "127.0.0.1:11211"; // fallback for local

let memcached = null;
let useMemoryFallback = false;
const memoryCache = new Map(); // key -> { value: string, exp: number|null }
const nsMemory = new Map();    // sub -> version string e.g. "0", "1"

function memGetLocal(key) {
  const entry = memoryCache.get(key);
  if (!entry) return null;
  if (entry.exp && entry.exp <= Date.now()) {
    memoryCache.delete(key);
    return null;
  }
  return entry.value;
}

function memSetLocal(key, value, ttlSeconds) {
  const exp = ttlSeconds && ttlSeconds > 0 ? Date.now() + ttlSeconds * 1000 : null;
  memoryCache.set(key, { value, exp });
}

export function connectToMemcached() {
  if (memcached) return memcached;
  memcached = new Memcached(memcachedAddress, {
    retries: 1,
    retry: 100,         // ms between retries
    timeout: 500,       // operation timeout
    remove: true,       // remove dead servers
  });

  memcached.on("failure", (details) => {
    console.log("Memcached server failure:", details);
  });
  memcached.on("issue", (details) => {
    console.warn("Memcached issue:", details);
  });
  memcached.on("reconnecting", (details) => {
    console.warn("Memcached reconnecting:", details);
  });
  memcached.on("remove", (details) => {
    console.error("Memcached removed server:", details);
    // Lean on in-memory fallback when server removed
    useMemoryFallback = true;
  });

  // Promisified helpers (same pattern you used)
  memcached.aGet = promisify(memcached.get).bind(memcached);
  memcached.aSet = promisify(memcached.set).bind(memcached);
  memcached.aDel = promisify(memcached.del).bind(memcached);

  return memcached;
}

// Read-through get: return JSON object or null
export async function cacheGetJSON(key) {
  try {
    const m = connectToMemcached();
    const raw = await m.aGet(key);
    if (!raw) return null;
    try { return JSON.parse(raw); } catch { return null; }
  } catch (_) {
    // If cache server is unavailable, degrade gracefully using in-memory cache
    useMemoryFallback = true;
    const raw = memGetLocal(key);
    if (!raw) return null;
    try { return JSON.parse(raw); } catch { return null; }
  }
}

// Set JSON with TTL seconds
export async function cacheSetJSON(key, value, ttlSeconds) {
  try {
    const m = connectToMemcached();
    await m.aSet(key, JSON.stringify(value), ttlSeconds);
  } catch (_) {
    // Write to in-memory fallback if memcached not available
    useMemoryFallback = true;
    try {
      memSetLocal(key, JSON.stringify(value), ttlSeconds);
    } catch {}
  }
}

// Namespace version token per user so we can “invalidate many” by bumping one key
const NS_TTL = 24 * 60 * 60; // 1 day
async function getNamespace(sub) {
  try {
    const m = connectToMemcached();
    const key = `ns:videos:list:${sub}`;
    const v = await m.aGet(key);
    if (v) return v;
    // initialize to "0" if not present
    await m.aSet(key, "0", NS_TTL);
    return "0";
  } catch (_) {
    // If cache is unavailable, use in-memory namespace
    useMemoryFallback = true;
    if (!nsMemory.has(sub)) nsMemory.set(sub, "0");
    return nsMemory.get(sub);
  }
}

export async function bumpNamespace(sub) {
  try {
    const m = connectToMemcached();
    const key = `ns:videos:list:${sub}`;
    // memcached has 'incr'. If key not set, set then incr.
    return new Promise((resolve) => {
      m.increment(key, 1, (err, val) => {
        if (err || val === false) {
          m.set(key, "1", NS_TTL, () => resolve(1));
        } else {
          resolve(val);
        }
      });
    });
  } catch (_) {
    // If cache unavailable, bump in-memory namespace
    useMemoryFallback = true;
    const cur = nsMemory.get(sub) || "0";
    const next = String(Number(cur) + 1);
    nsMemory.set(sub, next);
    return Number(next);
  }
}

// Build the cache key for list endpoint
export async function buildVideosListKey({ sub, page, perPage, sort }) {
  const ns = await getNamespace(sub);      // e.g., "0", "1", ...
  return `videos:list:${sub}:v${ns}:p${page}:n${perPage}:s${sort}`;
}

