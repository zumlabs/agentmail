import type { AttachmentRow, EmailAddress, MailboxRow, MessageRow } from "../types";
import { accessTokenSlug } from "./crypto";
import type { Extracted } from "./extract";
import { iso } from "./http";

export function safeJson<T>(raw: string | null | undefined, fallback: T): T {
  if (!raw) return fallback;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

export interface MailboxCounts {
  messageCount: number;
  unreadCount: number;
  lastMessageAt: number | null;
}

export function mailboxView(row: MailboxRow, origin: string, counts?: MailboxCounts) {
  const accessUrl = `${origin}/m/${accessTokenSlug(row.access_token)}`;
  return {
    object: "mailbox" as const,
    id: row.id,
    address: row.address,
    local: row.local,
    domain: row.domain,
    label: row.label,
    status: row.status,
    createdAt: iso(row.created_at),
    expiresAt: iso(row.expires_at),
    lastSeenAt: iso(row.last_seen_at),
    messageCount: counts?.messageCount ?? null,
    unreadCount: counts?.unreadCount ?? null,
    lastMessageAt: iso(counts?.lastMessageAt ?? null),
    meta: safeJson<Record<string, unknown> | null>(row.meta, null),
    accessUrl,
    urls: {
      self: `/api/v1/mailboxes/${row.id}`,
      messages: `/api/v1/mailboxes/${row.id}/messages`,
      access: accessUrl,
    },
  };
}

export function messageSummary(row: MessageRow) {
  return {
    object: "message" as const,
    v: 1,
    id: row.id,
    mailboxId: row.mailbox_id,
    from: { name: row.from_name, address: row.from_addr },
    to: safeJson<EmailAddress[]>(row.to_json, []),
    subject: row.subject,
    snippet: row.snippet,
    receivedAt: iso(row.received_at),
    size: row.size,
    hasAttachments: row.has_attachments === 1,
    attachmentCount: row.attachment_count,
    seen: row.seen_at !== null,
    urls: {
      self: `/api/v1/messages/${row.id}`,
      raw: `/api/v1/messages/${row.id}/raw`,
    },
  };
}

export interface DetailExtras {
  html: string | null;
  attachments: AttachmentRow[];
}

export function messageDetail(row: MessageRow, extras: DetailExtras) {
  // Rows stored before an extraction field existed still read back with a full shape.
  const stored = safeJson<Partial<Extracted>>(row.extracted_json, {});

  return {
    ...messageSummary(row),
    cc: safeJson<EmailAddress[]>(row.cc_json, []),
    text: row.text_body ?? null,
    html: extras.html,
    headers: safeJson<Record<string, string>>(row.headers_json, {}),
    extracted: {
      otp: stored.otp ?? [],
      links: stored.links ?? [],
      codes: stored.codes ?? [],
      intent: stored.intent ?? "other",
      primaryLink: stored.primaryLink ?? null,
      actionText: stored.actionText ?? null,
      unsubscribe: stored.unsubscribe ?? [],
    },
    authentication: { spf: row.spf, dkim: row.dkim, dmarc: row.dmarc },
    attachments: extras.attachments.map((attachment) => ({
      id: attachment.id,
      filename: attachment.filename,
      mime: attachment.mime,
      size: attachment.size,
      inline: attachment.content_id !== null,
      url: `/api/v1/messages/${row.id}/attachments/${attachment.id}`,
    })),
  };
}

export function listEnvelope<T>(data: T[], hasMore: boolean, nextCursor: string | null) {
  return { object: "list" as const, data, has_more: hasMore, next_cursor: nextCursor };
}
