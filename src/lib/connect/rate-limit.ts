/** Lightweight in-memory rate limit (per server instance). Server-only. */

const requestLog = new Map<string, number[]>();

export function isRateLimited(key: string, maxRequests: number, windowMs: number): boolean {
  const now = Date.now();
  const cutoff = now - windowMs;
  const recent = (requestLog.get(key) ?? []).filter((time) => time > cutoff);
  if (recent.length >= maxRequests) {
    requestLog.set(key, recent);
    return true;
  }
  recent.push(now);
  requestLog.set(key, recent);
  if (requestLog.size > 5000) requestLog.clear();
  return false;
}
