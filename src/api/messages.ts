import { authenticate, resolveMailboxId } from "../auth";
import { listEnvelope, messageDetail, messageSummary } from "../lib/envelope";
import { ApiError, CORS_HEADERS, clampInt, json } from "../lib/http";
import type { RouteContext } from "../router";
import { deletePrefix } from "../retention";
import type { AttachmentRow, Env, MessageRow } from "../types";

const MAX_WAIT_SECONDS = 25;

function sleep(ms: number): Promise<void> {
  const { promise, resolve } = Promise.withResolvers<void>();
  setTimeout(resolve, ms);
  return promise;
}

function parseSince(raw: string | null): number | null {
  if (!raw) return null;
  const numeric = Number(raw);
  if (Number.isFinite(numeric) && numeric > 0) return numeric;
  const parsed = Date.parse(raw);
  return Number.isNaN(parsed) ? null : parsed;
}

async function loadOwnedMessage(env: Env, id: string, mailboxId: string): Promise<MessageRow> {
  const row = await env.DB.prepare("SELECT * FROM messages WHERE id = ?1").bind(id).first<MessageRow>();
  if (!row || row.mailbox_id !== mailboxId) throw new ApiError(404, "message_not_found", "Message not found");
  return row;
}

export async function listMessages(context: RouteContext): Promise<Response> {
  const auth = await authenticate(context.request, context.env);
  const mailboxId = resolveMailboxId(auth, context.params.id ?? "me");

  const limit = clampInt(context.url.searchParams.get("limit"), 1, 100, 25);
  const unreadOnly = /^(1|true|yes)$/i.test(context.url.searchParams.get("unread") ?? "");
  const cursor = context.url.searchParams.get("cursor");
  const since = parseSince(context.url.searchParams.get("since"));
  const wait = clampInt(context.url.searchParams.get("wait"), 0, MAX_WAIT_SECONDS, 0);

  const fetchRows = async (): Promise<MessageRow[]> => {
    const { results } = await context.env.DB.prepare(
      `SELECT * FROM messages
        WHERE mailbox_id = ?1
          AND (?2 IS NULL OR id < ?2)
          AND (?3 = 0 OR seen_at IS NULL)
          AND (?4 IS NULL OR received_at > ?4)
        ORDER BY id DESC
        LIMIT ?5`,
    )
      .bind(mailboxId, cursor, unreadOnly ? 1 : 0, since, limit + 1)
      .all<MessageRow>();
    return results;
  };

  let rows = await fetchRows();
  if (wait > 0 && rows.length === 0) {
    const deadline = Date.now() + wait * 1000;
    while (rows.length === 0 && Date.now() < deadline) {
      await sleep(Math.min(1000, Math.max(0, deadline - Date.now())));
      rows = await fetchRows();
    }
  }

  const hasMore = rows.length > limit;
  const page = hasMore ? rows.slice(0, limit) : rows;
  return json(listEnvelope(page.map(messageSummary), hasMore, hasMore ? (page.at(-1)?.id ?? null) : null));
}

export async function getMessage(context: RouteContext): Promise<Response> {
  const auth = await authenticate(context.request, context.env);
  const row = await loadOwnedMessage(context.env, context.params.id ?? "", auth.mailbox.id);

  const attachments = await context.env.DB.prepare("SELECT * FROM attachments WHERE message_id = ?1 ORDER BY id ASC")
    .bind(row.id)
    .all<AttachmentRow>();

  let html: string | null = null;
  if (row.html_key) {
    const object = await context.env.MAIL.get(row.html_key);
    html = object ? await object.text() : null;
  }

  return json(messageDetail(row, { html, attachments: attachments.results }));
}

export async function getRawMessage(context: RouteContext): Promise<Response> {
  const auth = await authenticate(context.request, context.env);
  const row = await loadOwnedMessage(context.env, context.params.id ?? "", auth.mailbox.id);

  const object = await context.env.MAIL.get(row.raw_key);
  if (!object) throw new ApiError(410, "raw_unavailable", "Raw message is no longer stored");

  const filename = `${row.subject.replace(/[^\w.-]+/g, "_").slice(0, 60) || row.id}.eml`;
  const headers = new Headers(CORS_HEADERS);
  headers.set("content-type", "message/rfc822");
  headers.set("content-disposition", `attachment; filename="${filename}"`);
  headers.set("cache-control", "no-store");
  return new Response(object.body, { headers });
}

export async function getAttachment(context: RouteContext): Promise<Response> {
  const auth = await authenticate(context.request, context.env);
  const attachment = await context.env.DB.prepare(
    `SELECT a.* FROM attachments a
       JOIN messages m ON m.id = a.message_id
      WHERE a.id = ?1 AND a.message_id = ?2 AND m.mailbox_id = ?3`,
  )
    .bind(context.params.attachmentId ?? "", context.params.id ?? "", auth.mailbox.id)
    .first<AttachmentRow>();
  if (!attachment) throw new ApiError(404, "attachment_not_found", "Attachment not found");

  const object = await context.env.MAIL.get(attachment.r2_key);
  if (!object) throw new ApiError(410, "attachment_unavailable", "Attachment is no longer stored");

  const filename = attachment.filename ?? "attachment";
  const asciiName = filename.replace(/[^\x20-\x7e]/g, "_").replace(/["\\]/g, "_");
  const headers = new Headers(CORS_HEADERS);
  headers.set("content-type", attachment.mime ?? "application/octet-stream");
  headers.set("content-disposition", `attachment; filename="${asciiName}"; filename*=UTF-8''${encodeURIComponent(filename)}`);
  headers.set("content-length", String(attachment.size));
  headers.set("cache-control", "private, max-age=3600");
  return new Response(object.body, { headers });
}

export async function markMessageSeen(context: RouteContext): Promise<Response> {
  const auth = await authenticate(context.request, context.env);
  const row = await loadOwnedMessage(context.env, context.params.id ?? "", auth.mailbox.id);

  if (row.seen_at === null) {
    row.seen_at = Date.now();
    await context.env.DB.prepare("UPDATE messages SET seen_at = ?1 WHERE id = ?2 AND seen_at IS NULL")
      .bind(row.seen_at, row.id)
      .run();
  }
  return json(messageSummary(row));
}

export async function deleteMessage(context: RouteContext): Promise<Response> {
  const auth = await authenticate(context.request, context.env);
  const row = await loadOwnedMessage(context.env, context.params.id ?? "", auth.mailbox.id);

  const removed = await deletePrefix(context.env, `m/${row.mailbox_id}/${row.id}`);
  await context.env.DB.prepare("DELETE FROM messages WHERE id = ?1").bind(row.id).run();
  return json({ deleted: true, id: row.id, objectsDeleted: removed });
}
