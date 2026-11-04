import { authenticate, requireApiScope, resolveMailboxId } from "../auth";
import { adminAuthMode, requireAdmin } from "../admin";
import { accessTokenSlug, apiKeyPrefix, hashSecret, newAccessToken, newApiKey } from "../lib/crypto";
import { mailboxView } from "../lib/envelope";
import { ApiError, clampInt, json, readJson } from "../lib/http";
import { ulid } from "../lib/ids";
import { randomHumanLocal } from "../lib/names";
import type { RouteContext } from "../router";
import { enforceCreateLimit } from "../ratelimit";
import type { DomainRow, MailboxRow } from "../types";
import { deletePrefix } from "../retention";

const MIN_TTL_SECONDS = 60;
const MAX_TTL_SECONDS = 30 * 24 * 3600;
const LOCAL_PATTERN = /^[a-z0-9](?:[a-z0-9._-]{0,61}[a-z0-9])?$/;

interface CreateMailboxBody {
  domain?: string;
  local?: string;
  label?: string;
  ttl?: number | null;
  meta?: Record<string, unknown>;
}

function parseTtl(value: unknown): number | null {
  if (value === undefined || value === null) return null;
  const seconds = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(seconds)) throw new ApiError(400, "invalid_ttl", "ttl must be a number of seconds");
  if (seconds <= 0) return null;
  return clampInt(seconds, MIN_TTL_SECONDS, MAX_TTL_SECONDS, MIN_TTL_SECONDS);
}

function parseMeta(value: unknown): string | null {
  if (value === undefined || value === null) return null;
  if (typeof value !== "object" || Array.isArray(value)) {
    throw new ApiError(400, "invalid_meta", "meta must be a JSON object");
  }
  const serialized = JSON.stringify(value);
  if (serialized.length > 4096) throw new ApiError(413, "meta_too_large", "meta must be under 4 KiB");
  return serialized;
}

const RANDOM_DOMAIN = /^(random|any|auto|\*)$/i;

async function pickDomain(env: RouteContext["env"], requested?: string): Promise<DomainRow> {
  if (typeof requested === "string" && RANDOM_DOMAIN.test(requested.trim())) {
    const row = await env.DB.prepare("SELECT * FROM domains WHERE active = 1 ORDER BY RANDOM() LIMIT 1").first<DomainRow>();
    if (!row) throw new ApiError(503, "no_domains", "No active domain configured; add one via /api/v1/admin/domains");
    return row;
  }

  if (typeof requested === "string" && requested.trim() !== "") {
    const domain = requested.trim().toLowerCase().replace(/\.$/, "");
    const row = await env.DB.prepare("SELECT * FROM domains WHERE domain = ?1 AND active = 1")
      .bind(domain)
      .first<DomainRow>();
    if (!row) throw new ApiError(400, "unknown_domain", `Domain "${domain}" is not available`);
    return row;
  }

  const preferred = env.DEFAULT_DOMAIN?.trim().toLowerCase();
  if (preferred) {
    const row = await env.DB.prepare("SELECT * FROM domains WHERE domain = ?1 AND active = 1")
      .bind(preferred)
      .first<DomainRow>();
    if (row) return row;
  }

  const fallback = await env.DB.prepare("SELECT * FROM domains WHERE active = 1 ORDER BY created_at ASC LIMIT 1").first<DomainRow>();
  if (!fallback) throw new ApiError(503, "no_domains", "No active domain configured; add one via /api/v1/admin/domains");
  return fallback;
}

export async function createMailbox(context: RouteContext): Promise<Response> {
  const admin = await adminAuthMode(context.env, context.request);
  if (admin === "cookie") {
    // Dashboard sessions must prove same-origin intent before creating.
    await requireAdmin(context.env, context.request, { mutate: true });
  }
  if (!admin) {
    if ((context.env.PUBLIC_CREATE_ENABLED ?? "").trim().toLowerCase() === "false") {
      throw new ApiError(
        403,
        "creation_disabled",
        "Mailboxes are provisioned by the operator. Use the dashboard or an admin token.",
      );
    }
    await enforceCreateLimit(context.env, context.request);
  }

  const body = await readJson<CreateMailboxBody>(context.request);
  const domain = await pickDomain(context.env, body.domain);

  const requestedLocal =
    typeof body.local === "string" && body.local.trim() !== "" ? body.local.trim().toLowerCase() : null;
  if (requestedLocal !== null && !LOCAL_PATTERN.test(requestedLocal)) {
    throw new ApiError(400, "invalid_local", "local must be 1-63 chars: a-z, 0-9, dot, underscore or dash");
  }

  const label = typeof body.label === "string" ? body.label.trim().slice(0, 80) || null : null;
  const meta = parseMeta(body.meta);
  const ttl = parseTtl(body.ttl);
  const now = Date.now();
  const expiresAt = ttl === null ? null : now + ttl * 1000;

  const apiKey = newApiKey();
  const accessToken = newAccessToken();
  const apiKeyHash = await hashSecret(apiKey, context.env.TOKEN_PEPPER);

  for (let attempt = 0; attempt < 5; attempt += 1) {
    const local = requestedLocal ?? randomHumanLocal();
    const id = `mb_${ulid(now)}`;
    const address = `${local}@${domain.domain}`;

    try {
      await context.env.DB.prepare(
        `INSERT INTO mailboxes (
           id, local, domain, address, api_key_hash, api_key_prefix, access_token,
           label, meta, created_at, expires_at, last_seen_at, status
         ) VALUES (?1,?2,?3,?4,?5,?6,?7,?8,?9,?10,?11,NULL,'active')`,
      )
        .bind(id, local, domain.domain, address, apiKeyHash, apiKeyPrefix(apiKey), accessToken, label, meta, now, expiresAt)
        .run();

      const mailbox: MailboxRow = {
        id,
        local,
        domain: domain.domain,
        address,
        api_key_hash: apiKeyHash,
        api_key_prefix: apiKeyPrefix(apiKey),
        access_token: accessToken,
        label,
        meta,
        created_at: now,
        expires_at: expiresAt,
        last_seen_at: null,
        status: "active",
      };

      return json(
        {
          ...mailboxView(mailbox, context.origin, { messageCount: 0, unreadCount: 0, lastMessageAt: null }),
          apiKey,
          apiKeyPrefix: mailbox.api_key_prefix,
          accessToken: accessTokenSlug(accessToken),
        },
        { status: 201 },
      );
    } catch (error) {
      const message = error instanceof Error ? error.message : "";
      if (!/UNIQUE constraint failed/i.test(message)) throw error;
      if (requestedLocal !== null) {
        throw new ApiError(409, "address_taken", `${address} is already taken`);
      }
    }
  }

  throw new ApiError(503, "address_generation_failed", "Could not allocate a unique address; retry");
}

export async function getMailbox(context: RouteContext): Promise<Response> {
  const auth = await authenticate(context.request, context.env);
  const id = resolveMailboxId(auth, context.params.id ?? "me");

  const counts = await context.env.DB.prepare(
    `SELECT COUNT(*) AS total,
            COALESCE(SUM(CASE WHEN seen_at IS NULL THEN 1 ELSE 0 END), 0) AS unread,
            MAX(received_at) AS last
     FROM messages WHERE mailbox_id = ?1`,
  )
    .bind(id)
    .first<{ total: number; unread: number; last: number | null }>();

  const now = Date.now();
  await context.env.DB.prepare(
    "UPDATE mailboxes SET last_seen_at = ?1 WHERE id = ?2 AND (last_seen_at IS NULL OR last_seen_at < ?3)",
  )
    .bind(now, id, now - 60_000)
    .run();

  return json(
    mailboxView(auth.mailbox, context.origin, {
      messageCount: counts?.total ?? 0,
      unreadCount: counts?.unread ?? 0,
      lastMessageAt: counts?.last ?? null,
    }),
  );
}

interface PatchMailboxBody {
  label?: string | null;
  ttl?: number | null;
}

export async function patchMailbox(context: RouteContext): Promise<Response> {
  const auth = await authenticate(context.request, context.env);
  const id = resolveMailboxId(auth, context.params.id ?? "me");
  const body = await readJson<PatchMailboxBody>(context.request);

  const assignments: string[] = [];
  const bindings: unknown[] = [];

  if ("label" in body) {
    const label = typeof body.label === "string" ? body.label.trim().slice(0, 80) || null : null;
    bindings.push(label);
    assignments.push(`label = ?${bindings.length}`);
  }
  if ("ttl" in body) {
    const ttl = parseTtl(body.ttl);
    bindings.push(ttl === null ? null : Date.now() + ttl * 1000);
    assignments.push(`expires_at = ?${bindings.length}`);
  }
  if (assignments.length === 0) {
    throw new ApiError(400, "nothing_to_update", "Provide label and/or ttl");
  }

  bindings.push(id);
  await context.env.DB.prepare(`UPDATE mailboxes SET ${assignments.join(", ")} WHERE id = ?${bindings.length}`)
    .bind(...bindings)
    .run();

  const row = await context.env.DB.prepare("SELECT * FROM mailboxes WHERE id = ?1").bind(id).first<MailboxRow>();
  if (!row) throw new ApiError(404, "mailbox_not_found", "Mailbox not found");
  return json(mailboxView(row, context.origin));
}

export async function deleteMailbox(context: RouteContext): Promise<Response> {
  const auth = await authenticate(context.request, context.env);
  const id = resolveMailboxId(auth, context.params.id ?? "me");
  requireApiScope(auth, "delete a mailbox");

  const objects = await deletePrefix(context.env, `m/${id}/`);
  await context.env.DB.prepare("DELETE FROM mailboxes WHERE id = ?1").bind(id).run();
  return json({ deleted: true, id, objectsDeleted: objects });
}

export async function rotateAccessToken(context: RouteContext): Promise<Response> {
  const auth = await authenticate(context.request, context.env);
  const id = resolveMailboxId(auth, context.params.id ?? "me");
  requireApiScope(auth, "rotate a mailbox link");

  const accessToken = newAccessToken();
  await context.env.DB.prepare("UPDATE mailboxes SET access_token = ?1 WHERE id = ?2").bind(accessToken, id).run();
  const slug = accessTokenSlug(accessToken);
  return json({ id, accessToken: slug, accessUrl: `${context.origin}/m/${slug}` });
}
