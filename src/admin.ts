import { timingSafeEqual } from "./lib/crypto";
import { ApiError } from "./lib/http";
import { readCookie, SESSION_COOKIE, verifySession } from "./session";
import type { Env } from "./types";

export type AdminAuthMode = "token" | "cookie";

function bearer(request: Request): string {
  const header = request.headers.get("authorization") ?? "";
  return header.toLowerCase().startsWith("bearer ") ? header.slice(7).trim() : "";
}

/** Bearer admin token (scripts) or a valid signed session cookie (dashboard). */
export async function adminAuthMode(env: Env, request: Request): Promise<AdminAuthMode | null> {
  const presented = bearer(request) || (request.headers.get("x-admin-token") ?? "").trim();
  if (presented !== "" && env.ADMIN_TOKEN && timingSafeEqual(presented, env.ADMIN_TOKEN)) return "token";

  const cookie = readCookie(request, SESSION_COOKIE);
  if (await verifySession(env, cookie)) return "cookie";

  return null;
}

/**
 * Cookie-authenticated mutations must carry a custom header and come from the
 * same origin; bearer-token calls (scripts) are exempt.
 */
export async function requireAdmin(
  env: Env,
  request: Request,
  options: { mutate?: boolean } = {},
): Promise<AdminAuthMode> {
  const mode = await adminAuthMode(env, request);
  if (!mode) throw new ApiError(401, "unauthorized", "Valid admin token or dashboard session required");

  if (mode === "cookie" && options.mutate) {
    if (request.headers.get("x-agentmail-csrf") !== "1") {
      throw new ApiError(403, "csrf_failed", "Missing X-AgentMail-CSRF header");
    }
    const origin = request.headers.get("origin");
    if (origin && origin !== new URL(request.url).origin) {
      throw new ApiError(403, "csrf_failed", "Cross-origin admin mutation");
    }
  }

  return mode;
}
