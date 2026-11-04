import { ApiError, clampInt } from "./lib/http";
import type { Env } from "./types";

const HOUR = 3_600_000;
const MINUTE = 60_000;
const AUTH_FAILURE_LIMIT = 60;
const GLOBAL_AUTH_FAILURE_LIMIT = 3000;

function clientIp(request: Request): string {
  return request.headers.get("cf-connecting-ip") ?? request.headers.get("x-forwarded-for") ?? "local";
}

async function bump(env: Env, key: string, windowStart: number): Promise<number> {
  const row = await env.DB.prepare(
    `INSERT INTO rate_limits (key, window_start, count) VALUES (?1, ?2, 1)
     ON CONFLICT(key) DO UPDATE SET
       count = CASE WHEN rate_limits.window_start = ?2 THEN rate_limits.count + 1 ELSE 1 END,
       window_start = ?2
     RETURNING count`,
  )
    .bind(key, windowStart)
    .first<{ count: number }>();
  return row?.count ?? 0;
}

/**
 * Fixed-window per-IP limit for anonymous mailbox creation. D1 keeps it
 * dependency-free; the row is upserted so concurrent creates can't bypass it.
 */
export async function enforceCreateLimit(env: Env, request: Request): Promise<void> {
  const limit = clampInt(env.CREATE_LIMIT_PER_HOUR, 1, 10_000, 20);
  const now = Date.now();
  const windowStart = now - (now % HOUR);
  const count = await bump(env, `create:${clientIp(request)}`, windowStart);

  if (count > limit) {
    const retryAfter = Math.max(1, Math.ceil((windowStart + HOUR - now) / 1000));
    throw new ApiError(429, "rate_limited", `Too many mailboxes created. Retry in ${retryAfter}s`, {
      limit,
      retryAfter,
    });
  }
}

/**
 * Counts failed credential attempts so a short link slug can't be brute-forced.
 * Only failures touch this counter, so normal traffic costs nothing extra.
 * The global cap catches distributed scanning that spreads across IPs.
 */
export async function guardAuthFailures(env: Env, request: Request): Promise<void> {
  const now = Date.now();
  const windowStart = now - (now % MINUTE);
  const retryAfter = Math.max(1, Math.ceil((windowStart + MINUTE - now) / 1000));

  const perIp = await bump(env, `auth:${clientIp(request)}`, windowStart);
  if (perIp > AUTH_FAILURE_LIMIT) {
    throw new ApiError(429, "too_many_attempts", "Too many failed credential attempts. Slow down.", {
      limit: AUTH_FAILURE_LIMIT,
      retryAfter,
    });
  }

  const global = await bump(env, "auth:global", windowStart);
  if (global > GLOBAL_AUTH_FAILURE_LIMIT) {
    throw new ApiError(429, "too_many_attempts", "Credential guessing is being throttled globally. Retry shortly.", {
      limit: GLOBAL_AUTH_FAILURE_LIMIT,
      retryAfter,
    });
  }
}
