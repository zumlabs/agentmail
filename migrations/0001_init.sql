-- AgentMail initial schema.
-- Messages are addressed by ULID so `ORDER BY id` is chronological.

CREATE TABLE domains (
  domain     TEXT PRIMARY KEY,
  label      TEXT,
  active     INTEGER NOT NULL DEFAULT 1,
  created_at INTEGER NOT NULL
);

CREATE TABLE mailboxes (
  id             TEXT PRIMARY KEY,
  local          TEXT NOT NULL,
  domain         TEXT NOT NULL,
  address        TEXT NOT NULL UNIQUE,
  api_key_hash   TEXT NOT NULL UNIQUE,
  api_key_prefix TEXT NOT NULL,
  -- Stored in clear on purpose: the access token is a shareable URL, and users
  -- must be able to re-read their link. API keys are hashed and shown once.
  access_token   TEXT NOT NULL UNIQUE,
  label          TEXT,
  meta           TEXT,
  created_at     INTEGER NOT NULL,
  expires_at     INTEGER,
  last_seen_at   INTEGER,
  status         TEXT NOT NULL DEFAULT 'active'
);

CREATE INDEX mailboxes_domain_idx  ON mailboxes(domain);
CREATE INDEX mailboxes_expires_idx ON mailboxes(expires_at);

CREATE TABLE messages (
  id               TEXT PRIMARY KEY,
  mailbox_id       TEXT NOT NULL REFERENCES mailboxes(id) ON DELETE CASCADE,
  from_name        TEXT,
  from_addr        TEXT NOT NULL,
  to_json          TEXT NOT NULL DEFAULT '[]',
  cc_json          TEXT NOT NULL DEFAULT '[]',
  subject          TEXT NOT NULL DEFAULT '',
  snippet          TEXT NOT NULL DEFAULT '',
  text_body        TEXT,
  html_key         TEXT,
  raw_key          TEXT NOT NULL,
  size             INTEGER NOT NULL DEFAULT 0,
  attachment_count INTEGER NOT NULL DEFAULT 0,
  has_attachments  INTEGER NOT NULL DEFAULT 0,
  headers_json     TEXT NOT NULL DEFAULT '{}',
  extracted_json   TEXT NOT NULL DEFAULT '{}',
  spf              TEXT,
  dkim             TEXT,
  dmarc            TEXT,
  seen_at          INTEGER,
  received_at      INTEGER NOT NULL
);

CREATE INDEX messages_mailbox_idx  ON messages(mailbox_id, id DESC);
CREATE INDEX messages_received_idx ON messages(mailbox_id, received_at DESC);

CREATE TABLE attachments (
  id         TEXT PRIMARY KEY,
  message_id TEXT NOT NULL REFERENCES messages(id) ON DELETE CASCADE,
  filename   TEXT,
  mime       TEXT,
  size       INTEGER NOT NULL DEFAULT 0,
  r2_key     TEXT NOT NULL,
  content_id TEXT
);

CREATE INDEX attachments_message_idx ON attachments(message_id);

-- Fixed-window counters for anonymous mailbox creation.
CREATE TABLE rate_limits (
  key          TEXT PRIMARY KEY,
  window_start INTEGER NOT NULL,
  count        INTEGER NOT NULL
);
