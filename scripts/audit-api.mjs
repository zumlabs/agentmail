#!/usr/bin/env node
// Prints live response shapes for every documented endpoint so the docs can be
// verified against the Worker instead of guessed. Usage: node scripts/audit-api.mjs
const base = process.argv[2] ?? "http://127.0.0.1:8787";
const adminToken = process.argv[3] ?? process.env.ADMIN_TOKEN ?? "dev-admin-token";
const domain = "mail.test";
const admin = { authorization: `Bearer ${adminToken}`, "content-type": "application/json" };

const show = async (label, response) => {
  const type = response.headers.get("content-type") ?? "";
  if (type.includes("application/json")) {
    const body = await response.json();
    const shape = Array.isArray(body?.data)
      ? `list(${body.data.length}) item=${JSON.stringify(Object.keys(body.data[0] ?? {}))}`
      : JSON.stringify(Object.keys(body ?? {}));
    console.log(`${label}: ${response.status} ${shape}`);
    return body;
  }
  console.log(`${label}: ${response.status} ${type.split(";")[0]}`);
  return null;
};

const health = await fetch(`${base}/api/v1/health`);
const healthBody = await show("GET /health", health);

const domains = await show("GET /domains", await fetch(`${base}/api/v1/domains`));

const createdResponse = await fetch(`${base}/api/v1/mailboxes`, {
  method: "POST",
  headers: admin,
  body: JSON.stringify({ domain: "random", local: `audit-${Date.now().toString(36)}`, ttl: 3600, label: "audit" }),
});
const mailbox = await show("POST /mailboxes", createdResponse);

await show("GET /mailboxes/me", await fetch(`${base}/api/v1/mailboxes/me`, { headers: { "x-api-key": mailbox.apiKey } }));

const raw = await fetch(`${base}/cdn-cgi/handler/email?from=noreply@example.com&to=${encodeURIComponent(mailbox.address)}`, {
  method: "POST",
  headers: { "content-type": "message/rfc822" },
  body: [
    "From: GitHub <noreply@github.com>",
    `To: ${mailbox.address}`,
    "Subject: Your verification code",
    "Message-ID: <audit@example.com>",
    "Date: Wed, 04 Nov 2026 09:00:00 +0000",
    "MIME-Version: 1.0",
    "Authentication-Results: mx.cloudflare.net; spf=pass; dkim=pass; dmarc=pass",
    "Content-Type: text/plain; charset=utf-8",
    "",
    "Your verification code is 483920. Open https://example.com/verify",
  ].join("\r\n"),
});
console.log("deliver:", raw.status, await raw.text());

const list = await show(
  "GET /mailboxes/me/messages",
  await fetch(`${base}/api/v1/mailboxes/me/messages?limit=5&wait=5`, { headers: { "x-api-key": mailbox.apiKey } }),
);
const messageId = list.data[0].id;

const detail = await show("GET /messages/:id", await fetch(`${base}/api/v1/messages/${messageId}`, { headers: { "x-api-key": mailbox.apiKey } }));
console.log("  extracted:", JSON.stringify(detail.extracted), "spf:", detail.authentication.spf);

await show("POST /messages/:id/seen", await fetch(`${base}/api/v1/messages/${messageId}/seen`, { method: "POST", headers: { "x-api-key": mailbox.apiKey } }));

const rawResponse = await fetch(`${base}/api/v1/messages/${messageId}/raw`, { headers: { "x-api-key": mailbox.apiKey } });
console.log(
  "GET /messages/:id/raw:",
  rawResponse.status,
  rawResponse.headers.get("content-type"),
  `disposition=${rawResponse.headers.get("content-disposition")?.slice(0, 40)}…`,
);
await rawResponse.arrayBuffer();

await show("PATCH /mailboxes/:id", await fetch(`${base}/api/v1/mailboxes/me`, {
  method: "PATCH",
  headers: { "x-api-key": mailbox.apiKey, "content-type": "application/json" },
  body: JSON.stringify({ label: "renamed", ttl: null }),
}));

await show("POST /mailboxes/:id/rotate-token", await fetch(`${base}/api/v1/mailboxes/me/rotate-token`, {
  method: "POST",
  headers: { "x-api-key": mailbox.apiKey },
}));

await show("DELETE /messages/:id", await fetch(`${base}/api/v1/messages/${messageId}`, { method: "DELETE", headers: { "x-api-key": mailbox.apiKey } }));

await show("GET /admin/session", await fetch(`${base}/api/v1/admin/session`, { headers: admin }));
await show("GET /admin/domains", await fetch(`${base}/api/v1/admin/domains`, { headers: admin }));
await show("GET /admin/mailboxes", await fetch(`${base}/api/v1/admin/mailboxes?q=audit&limit=5`, { headers: admin }));
await show("PATCH /admin/mailboxes/:id", await fetch(`${base}/api/v1/admin/mailboxes/${mailbox.id}`, {
  method: "PATCH",
  headers: admin,
  body: JSON.stringify({ status: "paused", label: "audit-paused" }),
}));
const rotatedKey = await show("POST /admin/mailboxes/:id/rotate-key", await fetch(`${base}/api/v1/admin/mailboxes/${mailbox.id}/rotate-key`, {
  method: "POST",
  headers: admin,
}));
await show("POST /admin/mailboxes/:id/rotate-token", await fetch(`${base}/api/v1/admin/mailboxes/${mailbox.id}/rotate-token`, {
  method: "POST",
  headers: admin,
}));
await show("GET /admin/stats", await fetch(`${base}/api/v1/admin/stats`, { headers: admin }));

const missing = await fetch(`${base}/api/v1/messages/nope`, { headers: { "x-api-key": mailbox.apiKey } });
console.log("error envelope:", missing.status, JSON.stringify(await missing.json()));

await show("DELETE /admin/mailboxes/:id", await fetch(`${base}/api/v1/admin/mailboxes/${mailbox.id}`, { method: "DELETE", headers: admin }));

console.log(
  "context: health ok =",
  healthBody.ok,
  "| public domains =",
  domains.data.length,
  "| detail has html field =",
  "html" in detail,
);
