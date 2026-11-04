export interface Env {
  DB: D1Database;
  MAIL: R2Bucket;
  ASSETS: Fetcher;
  /** Secret pepper for hashing API keys. */
  TOKEN_PEPPER: string;
  /** Bearer token for /api/v1/admin/*. */
  ADMIN_TOKEN: string;
  /** Absolute origin used in accessUrl; empty = derive from the request. */
  PUBLIC_BASE_URL?: string;
  /** Domain picked when a create request omits `domain`. */
  DEFAULT_DOMAIN?: string;
  /** Anonymous mailbox creations allowed per IP per hour (default 20). */
  CREATE_LIMIT_PER_HOUR?: string;
  /** "false" closes POST /api/v1/mailboxes to anonymous callers. */
  PUBLIC_CREATE_ENABLED?: string;
}

export interface DomainRow {
  domain: string;
  label: string | null;
  active: number;
  created_at: number;
}

export interface MailboxRow {
  id: string;
  local: string;
  domain: string;
  address: string;
  api_key_hash: string;
  api_key_prefix: string;
  access_token: string;
  label: string | null;
  meta: string | null;
  created_at: number;
  expires_at: number | null;
  last_seen_at: number | null;
  status: string;
}

export interface MessageRow {
  id: string;
  mailbox_id: string;
  from_name: string | null;
  from_addr: string;
  to_json: string;
  cc_json: string;
  subject: string;
  snippet: string;
  text_body: string | null;
  html_key: string | null;
  raw_key: string;
  size: number;
  attachment_count: number;
  has_attachments: number;
  headers_json: string;
  extracted_json: string;
  spf: string | null;
  dkim: string | null;
  dmarc: string | null;
  seen_at: number | null;
  received_at: number;
}

export interface AttachmentRow {
  id: string;
  message_id: string;
  filename: string | null;
  mime: string | null;
  size: number;
  r2_key: string;
  content_id: string | null;
}

export interface EmailAddress {
  name: string | null;
  address: string;
}

export type CredentialScope = "api" | "link";

export interface AuthContext {
  mailbox: MailboxRow;
  scope: CredentialScope;
}
