/**
 * Simple in-memory sliding window rate limiter.
 * Suitable for single-instance deployments (no Redis needed).
 */

const windows = new Map<string, number[]>()

/**
 * Check if a request is within the rate limit.
 * Returns true if allowed, false if rate limit exceeded.
 */
export function checkRateLimit(key: string, maxRequests: number, windowMs: number): boolean {
  const now = Date.now()
  const timestamps = windows.get(key) ?? []
  const valid = timestamps.filter(t => now - t < windowMs)

  if (valid.length >= maxRequests) {
    windows.set(key, valid)
    return false
  }

  valid.push(now)
  windows.set(key, valid)
  return true
}
