import {
  ACCESS_TOKEN_PREFIX,
  hashSecret,
  isAccessToken,
  isApiKey,
  normalizeAccessToken,
} from "./lib/crypto";
import { ApiError } from "./lib/http";
import { guardAuthFailures } from "./ratelimit";
import type { AuthContext, Env, MailboxRow } from "./types";

const SLUG_PATTERN = /^[a-z0-9]{6,64}$/i;

function bearer(request: Request): string | null {
  const header = request.headers.get("authorization");
  if (!header) return null;
  const [scheme, ...rest] = header.split(" ");
  if (scheme?.toLowerCase() !== "bearer") return null;
  const value = rest.join(" ").trim();
  return value === "" ? null : value;
}

export function presentedApiKey(request: Request): string | null {
  const explicit = request.headers.get("x-api-key");
  if (explicit) return explicit.trim();
  const token = bearer(request);
  return isApiKey(token) ? token : null;
}

export function presentedAccessToken(request: Request): string | null {
  const explicit = request.headers.get("x-access-token");
  if (explicit) return explicit.trim();
  const token = bearer(request);
  return isAccessToken(token) ? token : null;
}

function assertUsable(mailbox: MailboxRow): void {
  if (mailbox.status !== "active") {
    throw new ApiError(403, "mailbox_inactive", "This mailbox is not active");
  }
  if (mailbox.expires_at !== null && mailbox.expires_at <= Date.now()) {
    throw new ApiError(410, "mailbox_expired", "This mailbox has expired");
  }
}

/**
 * Resolves either an API key (full scope) or the link token (link scope).
 * The link token may be sent bare (`/m/<slug>`) or prefixed (`am_tok_<slug>`).
 */
export async function authenticate(request: Request, env: Env): Promise<AuthContext> {
  const apiKey = presentedApiKey(request);
  if (apiKey) {
    if (!isApiKey(apiKey)) {
      await guardAuthFailures(env, request);
      throw new ApiError(401, "invalid_api_key", "Malformed API key");
    }
    const hash = await hashSecret(apiKey, env.TOKEN_PEPPER);
    const mailbox = await env.DB.prepare("SELECT * FROM mailboxes WHERE api_key_hash = ?1")
      .bind(hash)
      .first<MailboxRow>();
    if (!mailbox) {
      await guardAuthFailures(env, request);
      throw new ApiError(401, "invalid_api_key", "Unknown API key");
    }
    assertUsable(mailbox);
    return { mailbox, scope: "api" };
  }

  const presented = presentedAccessToken(request);
  if (presented) {
    const token = normalizeAccessToken(presented);
    if (!SLUG_PATTERN.test(token.slice(ACCESS_TOKEN_PREFIX.length))) {
      await guardAuthFailures(env, request);
      throw new ApiError(401, "invalid_token", "Malformed access token");
    }
    const mailbox = await env.DB.prepare("SELECT * FROM mailboxes WHERE access_token = ?1")
      .bind(token)
      .first<MailboxRow>();
    if (!mailbox) {
      await guardAuthFailures(env, request);
      throw new ApiError(401, "invalid_token", "Unknown access token");
    }
    assertUsable(mailbox);
    return { mailbox, scope: "link" };
  }

  throw new ApiError(401, "missing_credentials", "Provide Authorization: Bearer <apiKey>, X-API-Key or X-Access-Token");
}

export function requireApiScope(auth: AuthContext, action: string): void {
  if (auth.scope !== "api") {
    throw new ApiError(403, "insufficient_scope", `Access links cannot ${action}; use the API key`);
  }
}

/** `/mailboxes/:id` also accepts `me`, resolved from the credential. */
export function resolveMailboxId(auth: AuthContext, rawId: string): string {
  if (rawId === "me") return auth.mailbox.id;
  if (rawId !== auth.mailbox.id) throw new ApiError(404, "mailbox_not_found", "Mailbox not found");
  return auth.mailbox.id;
}
