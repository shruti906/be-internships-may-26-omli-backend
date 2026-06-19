const RATE = Number(process.env.RATE_LIMIT_PER_MIN || 5);
const WINDOW_MS = 60_000;
const buckets = new Map();

// Periodic background cleanup to prevent memory leaks over time
setInterval(() => {
  const cutoff = Date.now() - WINDOW_MS;
  for (const [userId, timestamps] of buckets.entries()) {
    const valid = timestamps.filter(ts => ts > cutoff);
    if (valid.length === 0) {
      buckets.delete(userId);
    } else {
      buckets.set(userId, valid);
    }
  }
}, 60_000).unref();

export function checkAndConsume(userId, nowMs = Date.now()) {
  const cutoff = nowMs - WINDOW_MS;
  let timestamps = buckets.get(userId) || [];
  
  // Filter out timestamps older than the window
  timestamps = timestamps.filter(ts => ts > cutoff);
  
  const ok = timestamps.length < RATE;
  if (ok) {
    timestamps.push(nowMs);
  }
  
  buckets.set(userId, timestamps);
  
  const resetMs = timestamps.length > 0 ? timestamps[0] + WINDOW_MS : nowMs + WINDOW_MS;
  const remaining = Math.max(RATE - timestamps.length, 0);
  
  return { ok, remaining, resetMs };
}
