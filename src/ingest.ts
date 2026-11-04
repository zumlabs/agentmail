import { extractAll } from "./lib/extract";
import { ulid } from "./lib/ids";
import { normalizeSnippet, parseRawEmail } from "./lib/mime";
import type { DomainRow, Env, MailboxRow } from "./types";

export interface IngestEnvelope {
  from: string;
  to: string;
}

export type IngestReason =
  | "stored"
  | "invalid_recipient"
  | "domain_not_routed"
  | "unknown_mailbox"
  | "mailbox_inactive"
  | "mailbox_expired";

export interface IngestResult {
  accepted: boolean;
  reason: IngestReason;
  mailboxId?: string;
  messageId?: string;
}

function recipientParts(to: string): { local: string; domain: string } | null {
  const normalized = to.trim().toLowerCase();
  const at = normalized.lastIndexOf("@");
  if (at <= 0 || at === normalized.length - 1) return null;
  return { local: normalized.slice(0, at), domain: normalized.slice(at + 1) };
}

/**
 * Stores one inbound message. Called by the `email()` handler and directly by
 * tests, so it takes plain bytes instead of a ForwardableEmailMessage.
 */
export async function ingestEmail(env: Env, envelope: IngestEnvelope, raw: ArrayBuffer): Promise<IngestResult> {
  const recipient = recipientParts(envelope.to);
  if (!recipient) return { accepted: false, reason: "invalid_recipient" };

  const domain = await env.DB.prepare("SELECT * FROM domains WHERE domain = ?1 AND active = 1")
    .bind(recipient.domain)
    .first<DomainRow>();
  if (!domain) return { accepted: false, reason: "domain_not_routed" };

  const address = `${recipient.local}@${recipient.domain}`;
  const mailbox = await env.DB.prepare("SELECT * FROM mailboxes WHERE address = ?1").bind(address).first<MailboxRow>();
  if (!mailbox) return { accepted: false, reason: "unknown_mailbox" };
  if (mailbox.status !== "active") return { accepted: false, reason: "mailbox_inactive" };
  if (mailbox.expires_at !== null && mailbox.expires_at <= Date.now()) {
    return { accepted: false, reason: "mailbox_expired" };
  }

  const parsed = await parseRawEmail(raw);
  const messageId = ulid();
  const receivedAt = Date.now();
  const snippet = normalizeSnippet(parsed.text !== "" ? parsed.text : parsed.subject);
  const extracted = extractAll(parsed.text, parsed.html, parsed.subject);
  if (parsed.otpCode && !extracted.otp.includes(parsed.otpCode)) {
    extracted.otp = [parsed.otpCode, ...extracted.otp].slice(0, 5);
  }

  const recipients = [...parsed.to];
  if (!recipients.some((entry) => entry.address.toLowerCase() === address)) {
    recipients.unshift({ name: null, address });
  }

  const rawKey = `m/${mailbox.id}/${messageId}.eml`;
  const htmlKey = parsed.html ? `m/${mailbox.id}/${messageId}.html` : null;
  const attachmentRows = parsed.attachments.map((attachment, index) => ({
    id: `att_${ulid()}_${index}`,
    attachment,
    key: `m/${mailbox.id}/${messageId}/a/${index}`,
  }));

  await Promise.all([
    env.MAIL.put(rawKey, raw, { httpMetadata: { contentType: "message/rfc822" } }),
    htmlKey
      ? env.MAIL.put(htmlKey, parsed.html!, { httpMetadata: { contentType: "text/html; charset=utf-8" } })
      : Promise.resolve(null),
    ...attachmentRows.map((row) =>
      env.MAIL.put(row.key, row.attachment.content, {
        httpMetadata: {
          contentType: row.attachment.mime,
          contentDisposition: `attachment; filename="${row.attachment.filename.replace(/["\\]/g, "_")}"`,
        },
      }),
    ),
  ]);

  const statements = [
    env.DB.prepare(
      `INSERT INTO messages (
         id, mailbox_id, from_name, from_addr, to_json, cc_json, subject, snippet,
         text_body, html_key, raw_key, size, attachment_count, has_attachments,
         headers_json, extracted_json, spf, dkim, dmarc, seen_at, received_at
       ) VALUES (?1,?2,?3,?4,?5,?6,?7,?8,?9,?10,?11,?12,?13,?14,?15,?16,?17,?18,?19,NULL,?20)`,
    ).bind(
      messageId,
      mailbox.id,
      parsed.from.name,
      parsed.from.address.toLowerCase(),
      JSON.stringify(recipients),
      JSON.stringify(parsed.cc),
      parsed.subject,
      snippet,
      parsed.text === "" ? null : parsed.text,
      htmlKey,
      rawKey,
      raw.byteLength,
      attachmentRows.length,
      attachmentRows.length > 0 ? 1 : 0,
      JSON.stringify(parsed.headers),
      JSON.stringify(extracted),
      parsed.spf,
      parsed.dkim,
      parsed.dmarc,
      receivedAt,
    ),
    ...attachmentRows.map((row) =>
      env.DB.prepare(
        `INSERT INTO attachments (id, message_id, filename, mime, size, r2_key, content_id)
         VALUES (?1,?2,?3,?4,?5,?6,?7)`,
      ).bind(
        row.id,
        messageId,
        row.attachment.filename,
        row.attachment.mime,
        row.attachment.size,
        row.key,
        row.attachment.contentId,
      ),
    ),
    env.DB.prepare(
      `UPDATE mailboxes SET last_seen_at = COALESCE(last_seen_at, ?1) WHERE id = ?2`,
    ).bind(receivedAt, mailbox.id),
  ];

  await env.DB.batch(statements);

  return { accepted: true, reason: "stored", mailboxId: mailbox.id, messageId };
}
