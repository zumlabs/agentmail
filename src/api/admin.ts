import { requireAdmin } from "../admin";
import { accessTokenSlug, apiKeyPrefix, hashSecret, newAccessToken, newApiKey, timingSafeEqual } from "../lib/crypto";
import { extractAll } from "../lib/extract";
import { mailboxView } from "../lib/envelope";
import { ApiError, clampInt, json, readJson } from "../lib/http";
import { normalizeSnippet, parseRawEmail } from "../lib/mime";
import { guardAuthFailures } from "../ratelimit";
import { clearSession, isSecureRequest, issueSession } from "../session";
import { deletePrefix } from "../retention";
import type { RouteContext } from "../router";
import type { DomainRow, Env, MailboxRow, MessageRow } from "../types";

const DOMAIN_PATTERN = /^(?=.{3,253}$)(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/;

function normalizeDomain(raw: unknown): string {
  if (typeof raw !== "string") throw new ApiError(400, "invalid_domain", "domain must be a string");
  const domain = raw.trim().toLowerCase().replace(/\.$/, "");
  if (!DOMAIN_PATTERN.test(domain)) throw new ApiError(400, "invalid_domain", `"${raw}" is not a valid domain`);
  return domain;
}

function domainView(row: DomainRow, mailboxes?: number) {
  return {
    object: "domain" as const,
    domain: row.domain,
    label: row.label,
    active: row.active === 1,
    createdAt: new Date(row.created_at).toISOString(),
    mailboxes: mailboxes ?? null,
  };
}

// ---------------------------------------------------------------- session

export async function getAdminSession(context: RouteContext): Promise<Response> {
  const mode = await requireAdmin(context.env, context.request);
  return json({ authenticated: true, mode });
}

interface LoginBody {
  token?: string;
}

export async function loginAdminSession(context: RouteContext): Promise<Response> {
  const body = await readJson<LoginBody>(context.request);
  const token = typeof body.token === "string" ? body.token.trim() : "";

  if (!context.env.ADMIN_TOKEN) {
    throw new ApiError(503, "admin_disabled", "ADMIN_TOKEN is not configured");
  }
  if (token === "" || !timingSafeEqual(token, context.env.ADMIN_TOKEN)) {
    await guardAuthFailures(context.env, context.request);
    throw new ApiError(401, "invalid_admin_token", "That admin token is not valid");
  }

  return json(
    { authenticated: true, mode: "cookie", expiresIn: 7 * 24 * 3600 },
    { headers: { "set-cookie": await issueSession(context.env, isSecureRequest(context.request)) } },
  );
}

export async function logoutAdminSession(context: RouteContext): Promise<Response> {
  const secure = isSecureRequest(context.request);
  return json({ authenticated: false }, { headers: { "set-cookie": clearSession(secure) } });
}

// ---------------------------------------------------------------- domains

export async function listAdminDomains(context: RouteContext): Promise<Response> {
  await requireAdmin(context.env, context.request);
  const { results } = await context.env.DB.prepare(
    `SELECT d.*, (SELECT COUNT(*) FROM mailboxes m WHERE m.domain = d.domain) AS mailbox_count
       FROM domains d ORDER BY d.created_at ASC`,
  ).all<DomainRow & { mailbox_count: number }>();

  return json({ object: "list", data: results.map((row) => domainView(row, row.mailbox_count)) });
}

interface CreateDomainBody {
  domain?: string;
  label?: string;
  active?: boolean;
}

export async function createAdminDomain(context: RouteContext): Promise<Response> {
  await requireAdmin(context.env, context.request, { mutate: true });
  const body = await readJson<CreateDomainBody>(context.request);
  const domain = normalizeDomain(body.domain);
  const label = typeof body.label === "string" ? body.label.trim().slice(0, 80) || null : null;
  const active = body.active === false ? 0 : 1;
  const now = Date.now();

  try {
    await context.env.DB.prepare("INSERT INTO domains (domain, label, active, created_at) VALUES (?1,?2,?3,?4)")
      .bind(domain, label, active, now)
      .run();
  } catch (error) {
    const message = error instanceof Error ? error.message : "";
    if (/UNIQUE constraint failed/i.test(message)) {
      throw new ApiError(409, "domain_exists", `${domain} is already registered`);
    }
    throw error;
  }

  return json(domainView({ domain, label, active, created_at: now }, 0), { status: 201 });
}

interface PatchDomainBody {
  label?: string | null;
  active?: boolean;
}

export async function patchAdminDomain(context: RouteContext): Promise<Response> {
  await requireAdmin(context.env, context.request, { mutate: true });
  const domain = normalizeDomain(context.params.domain);
  const body = await readJson<PatchDomainBody>(context.request);

  const assignments: string[] = [];
  const bindings: unknown[] = [];

  if ("label" in body) {
    const label = typeof body.label === "string" ? body.label.trim().slice(0, 80) || null : null;
    bindings.push(label);
    assignments.push(`label = ?${bindings.length}`);
  }
  if ("active" in body) {
    bindings.push(body.active === false ? 0 : 1);
    assignments.push(`active = ?${bindings.length}`);
  }
  if (assignments.length === 0) throw new ApiError(400, "nothing_to_update", "Provide label and/or active");

  bindings.push(domain);
  const result = await context.env.DB.prepare(
    `UPDATE domains SET ${assignments.join(", ")} WHERE domain = ?${bindings.length}`,
  )
    .bind(...bindings)
    .run();
  if (result.meta.changes === 0) throw new ApiError(404, "domain_not_found", `${domain} is not registered`);

  const row = await context.env.DB.prepare("SELECT * FROM domains WHERE domain = ?1").bind(domain).first<DomainRow>();
  if (!row) throw new ApiError(404, "domain_not_found", `${domain} is not registered`);
  return json(domainView(row));
}

export async function deleteAdminDomain(context: RouteContext): Promise<Response> {
  await requireAdmin(context.env, context.request, { mutate: true });
  const domain = normalizeDomain(context.params.domain);

  const usage = await context.env.DB.prepare("SELECT COUNT(*) AS total FROM mailboxes WHERE domain = ?1")
    .bind(domain)
    .first<{ total: number }>();
  if ((usage?.total ?? 0) > 0) {
    throw new ApiError(409, "domain_in_use", `${domain} still has ${usage?.total} mailbox(es); deactivate it instead`);
  }

  const result = await context.env.DB.prepare("DELETE FROM domains WHERE domain = ?1").bind(domain).run();
  if (result.meta.changes === 0) throw new ApiError(404, "domain_not_found", `${domain} is not registered`);
  return json({ deleted: true, domain });
}

// ---------------------------------------------------------------- mailboxes

interface AdminMailboxRow extends MailboxRow {
  message_count: number;
  unread_count: number;
  last_message_at: number | null;
}

export async function listAdminMailboxes(context: RouteContext): Promise<Response> {
  await requireAdmin(context.env, context.request);

  const limit = clampInt(context.url.searchParams.get("limit"), 1, 200, 50);
  const domain = (context.url.searchParams.get("domain") ?? "").trim().toLowerCase();
  const query = (context.url.searchParams.get("q") ?? "").trim().toLowerCase();

  const { results } = await context.env.DB.prepare(
    `SELECT m.*,
            (SELECT COUNT(*) FROM messages ms WHERE ms.mailbox_id = m.id) AS message_count,
            (SELECT COUNT(*) FROM messages ms WHERE ms.mailbox_id = m.id AND ms.seen_at IS NULL) AS unread_count,
            (SELECT MAX(ms.received_at) FROM messages ms WHERE ms.mailbox_id = m.id) AS last_message_at
       FROM mailboxes m
      WHERE (?1 = '' OR m.address LIKE ?2)
        AND (?3 = '' OR m.domain = ?3)
      ORDER BY m.created_at DESC, m.id DESC
      LIMIT ?4`,
  )
    .bind(query, `%${query}%`, domain, limit)
    .all<AdminMailboxRow>();

  return json({
    object: "list",
    data: results.map((row) => ({
      ...mailboxView(row, context.origin, {
        messageCount: row.message_count,
        unreadCount: row.unread_count,
        lastMessageAt: row.last_message_at,
      }),
      apiKeyPrefix: row.api_key_prefix,
    })),
  });
}

export async function deleteAdminMailbox(context: RouteContext): Promise<Response> {
  await requireAdmin(context.env, context.request, { mutate: true });
  const id = context.params.id ?? "";

  const row = await context.env.DB.prepare("SELECT id FROM mailboxes WHERE id = ?1").bind(id).first<{ id: string }>();
  if (!row) throw new ApiError(404, "mailbox_not_found", "Mailbox not found");

  const objects = await deletePrefix(context.env, `m/${id}/`);
  await context.env.DB.prepare("DELETE FROM mailboxes WHERE id = ?1").bind(id).run();
  return json({ deleted: true, id, objectsDeleted: objects });
}

async function countsFor(env: Env, mailboxId: string) {
  const row = await env.DB.prepare(
    `SELECT COUNT(*) AS total,
            COALESCE(SUM(CASE WHEN seen_at IS NULL THEN 1 ELSE 0 END), 0) AS unread,
            MAX(received_at) AS last
       FROM messages WHERE mailbox_id = ?1`,
  )
    .bind(mailboxId)
    .first<{ total: number; unread: number; last: number | null }>();

  return {
    messageCount: row?.total ?? 0,
    unreadCount: row?.unread ?? 0,
    lastMessageAt: row?.last ?? null,
  };
}

interface PatchAdminMailboxBody {
  label?: string | null;
  ttl?: number | null;
  status?: "active" | "paused";
}

/** Operator edit: rename or move the expiry without touching mailbox credentials. */
export async function patchAdminMailbox(context: RouteContext): Promise<Response> {
  await requireAdmin(context.env, context.request, { mutate: true });
  const id = context.params.id ?? "";
  const body = await readJson<PatchAdminMailboxBody>(context.request);

  const assignments: string[] = [];
  const bindings: unknown[] = [];

  if ("label" in body) {
    const label = typeof body.label === "string" ? body.label.trim().slice(0, 80) || null : null;
    bindings.push(label);
    assignments.push(`label = ?${bindings.length}`);
  }
  if ("ttl" in body) {
    const ttl =
      body.ttl === null || body.ttl === undefined
        ? null
        : clampInt(body.ttl, 60, 30 * 24 * 3600, 60);
    bindings.push(ttl === null ? null : Date.now() + ttl * 1000);
    assignments.push(`expires_at = ?${bindings.length}`);
  }
  if ("status" in body) {
    if (body.status !== "active" && body.status !== "paused") {
      throw new ApiError(400, "invalid_status", 'status must be "active" or "paused"');
    }
    bindings.push(body.status);
    assignments.push(`status = ?${bindings.length}`);
  }
  if (assignments.length === 0) throw new ApiError(400, "nothing_to_update", "Provide label, ttl and/or status");

  bindings.push(id);
  const result = await context.env.DB.prepare(
    `UPDATE mailboxes SET ${assignments.join(", ")} WHERE id = ?${bindings.length}`,
  )
    .bind(...bindings)
    .run();
  if (result.meta.changes === 0) throw new ApiError(404, "mailbox_not_found", "Mailbox not found");

  const row = await context.env.DB.prepare("SELECT * FROM mailboxes WHERE id = ?1").bind(id).first<MailboxRow>();
  if (!row) throw new ApiError(404, "mailbox_not_found", "Mailbox not found");
  return json(mailboxView(row, context.origin, await countsFor(context.env, id)));
}

export async function rotateAdminMailboxToken(context: RouteContext): Promise<Response> {
  await requireAdmin(context.env, context.request, { mutate: true });
  const id = context.params.id ?? "";

  const row = await context.env.DB.prepare("SELECT id FROM mailboxes WHERE id = ?1").bind(id).first<{ id: string }>();
  if (!row) throw new ApiError(404, "mailbox_not_found", "Mailbox not found");

  const token = newAccessToken();
  await context.env.DB.prepare("UPDATE mailboxes SET access_token = ?1 WHERE id = ?2").bind(token, id).run();
  const slug = accessTokenSlug(token);
  return json({ id, accessToken: slug, accessUrl: `${context.origin}/m/${slug}` });
}

/** Revokes the current API key; the new one is returned exactly once. */
export async function rotateAdminMailboxKey(context: RouteContext): Promise<Response> {
  await requireAdmin(context.env, context.request, { mutate: true });
  const id = context.params.id ?? "";

  const row = await context.env.DB.prepare("SELECT id FROM mailboxes WHERE id = ?1").bind(id).first<{ id: string }>();
  if (!row) throw new ApiError(404, "mailbox_not_found", "Mailbox not found");

  const apiKey = newApiKey();
  const prefix = apiKeyPrefix(apiKey);
  const hash = await hashSecret(apiKey, context.env.TOKEN_PEPPER);
  await context.env.DB.prepare("UPDATE mailboxes SET api_key_hash = ?1, api_key_prefix = ?2 WHERE id = ?3")
    .bind(hash, prefix, id)
    .run();

  return json({ id, apiKey, apiKeyPrefix: prefix });
}

/** Re-runs parsing on the stored raw MIME so old rows pick up parser fixes. */
export async function reparseAdminMessage(context: RouteContext): Promise<Response> {
  await requireAdmin(context.env, context.request, { mutate: true });
  const id = context.params.id ?? "";

  const row = await context.env.DB.prepare("SELECT * FROM messages WHERE id = ?1").bind(id).first<MessageRow>();
  if (!row) throw new ApiError(404, "message_not_found", "Message not found");

  const object = await context.env.MAIL.get(row.raw_key);
  if (!object) throw new ApiError(410, "raw_unavailable", "Raw message is no longer stored");

  const parsed = await parseRawEmail(await object.arrayBuffer());
  const extracted = extractAll(parsed.text, parsed.html, parsed.subject);
  if (parsed.otpCode && !extracted.otp.includes(parsed.otpCode)) {
    extracted.otp = [parsed.otpCode, ...extracted.otp].slice(0, 5);
  }

  await context.env.DB.prepare(
    `UPDATE messages
        SET from_name = ?1, from_addr = ?2, subject = ?3, snippet = ?4, text_body = ?5,
            headers_json = ?6, extracted_json = ?7, spf = ?8, dkim = ?9, dmarc = ?10
      WHERE id = ?11`,
  )
    .bind(
      parsed.from.name,
      parsed.from.address.toLowerCase(),
      parsed.subject,
      normalizeSnippet(parsed.text !== "" ? parsed.text : parsed.subject),
      parsed.text === "" ? null : parsed.text,
      JSON.stringify(parsed.headers),
      JSON.stringify(extracted),
      parsed.spf,
      parsed.dkim,
      parsed.dmarc,
      id,
    )
    .run();

  return json({ id, updated: true, subject: parsed.subject, extracted });
}

export async function adminStats(context: RouteContext): Promise<Response> {
  await requireAdmin(context.env, context.request);
  const totals = await context.env.DB.prepare(
    `SELECT (SELECT COUNT(*) FROM mailboxes) AS mailboxes,
            (SELECT COUNT(*) FROM mailboxes WHERE expires_at IS NOT NULL AND expires_at <= ?1) AS expired,
            (SELECT COUNT(*) FROM messages) AS messages,
            (SELECT COUNT(*) FROM messages WHERE seen_at IS NULL) AS unread,
            (SELECT COUNT(*) FROM messages WHERE received_at > ?2) AS recent,
            (SELECT COUNT(*) FROM attachments) AS attachments,
            (SELECT COALESCE(SUM(size), 0) FROM messages) AS bytes`,
  )
    .bind(Date.now(), Date.now() - 24 * 3_600_000)
    .first<{
      mailboxes: number;
      expired: number;
      messages: number;
      unread: number;
      recent: number;
      attachments: number;
      bytes: number;
    }>();

  const { results } = await context.env.DB.prepare(
    `SELECT d.domain,
            (SELECT COUNT(*) FROM mailboxes m WHERE m.domain = d.domain) AS mailboxes,
            (SELECT COUNT(*) FROM messages ms JOIN mailboxes m ON m.id = ms.mailbox_id WHERE m.domain = d.domain) AS messages
       FROM domains d ORDER BY d.created_at ASC`,
  ).all<{ domain: string; mailboxes: number; messages: number }>();

  return json({
    object: "stats",
    totals: {
      mailboxes: totals?.mailboxes ?? 0,
      expired: totals?.expired ?? 0,
      messages: totals?.messages ?? 0,
      unread: totals?.unread ?? 0,
      recentMessages: totals?.recent ?? 0,
      attachments: totals?.attachments ?? 0,
      storedBytes: totals?.bytes ?? 0,
    },
    domains: results,
  });
}
