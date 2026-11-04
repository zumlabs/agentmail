#!/usr/bin/env node
// End-to-end smoke test against a running `wrangler dev` instance.
// Usage: node scripts/smoke.mjs [baseUrl] [adminToken]
import { readFile } from "node:fs/promises";

const base = process.argv[2] ?? "http://127.0.0.1:8787";
const adminToken = process.argv[3] ?? process.env.ADMIN_TOKEN ?? "dev-admin-token";
const domain = "mail.test";
const local = `smoke-${Date.now().toString(36)}`;

const json = (response) => response.json();

const health = await fetch(`${base}/api/v1/health`).then(json);
console.log("health:", health.ok);

const domainResponse = await fetch(`${base}/api/v1/admin/domains`, {
  method: "POST",
  headers: { authorization: `Bearer ${adminToken}`, "content-type": "application/json" },
  body: JSON.stringify({ domain }),
});
console.log("domain:", domainResponse.status, domainResponse.status === 409 ? "(already registered)" : "");

const mailbox = await fetch(`${base}/api/v1/mailboxes`, {
  method: "POST",
  headers: { "content-type": "application/json", authorization: `Bearer ${adminToken}` },
  body: JSON.stringify({ domain, local, label: "smoke test" }),
}).then(json);
console.log("mailbox:", mailbox.address, "expires:", mailbox.expiresAt ?? "never");

const raw = await readFile(new URL("./sample.eml", import.meta.url));
const delivered = await fetch(
  `${base}/cdn-cgi/handler/email?from=${encodeURIComponent("noreply@github.com")}&to=${encodeURIComponent(mailbox.address)}`,
  { method: "POST", headers: { "content-type": "message/rfc822" }, body: raw },
);
console.log("delivery:", delivered.status, await delivered.text());

const list = await fetch(`${base}/api/v1/mailboxes/me/messages?wait=5`, {
  headers: { "x-api-key": mailbox.apiKey },
}).then(json);
console.log("messages:", list.data.length);

const message = list.data[0];
if (!message) {
  console.error("no message stored; check wrangler dev logs");
  process.exit(1);
}

const detail = await fetch(`${base}/api/v1/messages/${message.id}`, {
  headers: { "x-api-key": mailbox.apiKey },
}).then(json);

console.log("subject:", detail.subject);
console.log("otp:", detail.extracted.otp.join(", ") || "(none)");
console.log("links:", detail.extracted.links.join(", ") || "(none)");
console.log("spf:", detail.authentication.spf, "html:", detail.html ? "yes" : "no");
console.log("accessUrl:", mailbox.accessUrl);
