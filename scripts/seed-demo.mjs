#!/usr/bin/env node
// Seeds a demo mailbox with a few realistic messages so the UI can be explored.
// Usage: node scripts/seed-demo.mjs [baseUrl] [adminToken]
const base = process.argv[2] ?? "http://127.0.0.1:8787";
const adminToken = process.argv[3] ?? process.env.ADMIN_TOKEN ?? "dev-admin-token";

const json = async (response) => response.json();

async function ensureDomain(domain) {
  const response = await fetch(`${base}/api/v1/admin/domains`, {
    method: "POST",
    headers: { authorization: `Bearer ${adminToken}`, "content-type": "application/json" },
    body: JSON.stringify({ domain }),
  });
  return response.status;
}

function mime({ from, to, subject, text, html, attachment, auth = true }) {
  const boundary = `demo-${Math.random().toString(36).slice(2)}`;
  const lines = [
    `From: ${from}`,
    `To: ${to}`,
    `Subject: ${subject}`,
    `Message-ID: <${crypto.randomUUID()}@demo.test>`,
    `Date: ${new Date().toUTCString()}`,
    "MIME-Version: 1.0",
  ];
  if (auth) {
    lines.push(
      "Authentication-Results: mx.cloudflare.net; spf=pass smtp.mailfrom=demo.test; dkim=pass header.d=demo.test; dmarc=pass",
    );
  }

  const body = html ?? text ?? "";
  const contentType = html ? 'text/html; charset="utf-8"' : 'text/plain; charset="utf-8"';

  if (attachment) {
    lines.push(`Content-Type: multipart/mixed; boundary="${boundary}"`, "", `--${boundary}`, `Content-Type: ${contentType}`, "", body, "");
    lines.push(
      `--${boundary}`,
      `Content-Type: ${attachment.mime}`,
      "Content-Transfer-Encoding: base64",
      `Content-Disposition: attachment; filename="${attachment.filename}"`,
      "",
      attachment.base64,
      `--${boundary}--`,
    );
  } else {
    lines.push(`Content-Type: ${contentType}`, "", body);
  }

  return lines.join("\r\n");
}

async function deliver(from, to, subject, options) {
  const raw = mime({ from, to, subject, ...options });
  const response = await fetch(
    `${base}/cdn-cgi/handler/email?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`,
    { method: "POST", headers: { "content-type": "message/rfc822" }, body: raw },
  );
  console.log(`${response.status} ${subject}`);
}

const domain = "mail.test";
await ensureDomain(domain);
await ensureDomain("inbox.test");

const wanted = "sarah.mitchell";
const create = (local) =>
  fetch(`${base}/api/v1/mailboxes`, {
    method: "POST",
    headers: { "content-type": "application/json", authorization: `Bearer ${adminToken}` },
    body: JSON.stringify({ domain, local, label: "demo" }),
  }).then(json);

let mailbox = await create(wanted);

if (!mailbox.address) {
  mailbox = await create(`${wanted}${Math.floor(10 + Math.random() * 89)}`);
}

const to = mailbox.address;
console.log("mailbox:", to);

await deliver("GitHub <noreply@github.com>", to, "Your verification code", {
  html: `<div style="font-family:-apple-system,Segoe UI,sans-serif;color:#111">
    <p style="margin:0 0 12px">Hi Sarah,</p>
    <p style="margin:0 0 16px">Here is the code to finish signing in to your account:</p>
    <p style="margin:0 0 16px;font-size:34px;font-weight:600;letter-spacing:8px">483920</p>
    <p style="margin:0 0 16px;color:#57606a;font-size:13px">This code expires in 10 minutes. If you did not request it, ignore this email.</p>
    <p style="margin:0"><a href="https://github.com/settings/sessions">Review your sessions</a></p>
  </div>`,
  auth: true,
});

await deliver("Stripe <receipts@stripe.com>", to, "Your receipt from Acme Cloud", {
  text: "Receipt #2261\nAcme Cloud — Pro plan (monthly)\nTotal: $24.00\nPaid with Visa ending 4242.\n\nThanks for your business.",
  attachment: {
    filename: "receipt-2261.pdf",
    mime: "application/pdf",
    base64: "JVBERi0xLjQKJcTl8uXrp/Og0MTGCjQgMCBvYmoKPDwvTGVuZ3RoIDUKPj5zdHJlYW0KeAErKk1KBQA=",
  },
});

await deliver("Slack <feedback@slack.com>", to, "You have 3 unread messages in #design", {
  html: `<div style="font-family:-apple-system,Segoe UI,sans-serif">
    <p style="margin:0 0 10px"><strong>#design</strong> · 9:41 AM</p>
    <p style="margin:0 0 6px"><strong>Maya Chen:</strong> Pushed the new onboarding flow, can someone review?</p>
    <p style="margin:0 0 6px"><strong>Tom Alvarez:</strong> Looks good, one nit on the empty state.</p>
    <p style="margin:0 0 14px"><strong>Maya Chen:</strong> Great, fixing now.</p>
    <p style="margin:0"><a href="https://app.slack.com/client/T1/C1">Open in Slack</a></p>
  </div>`,
  auth: false,
});

await deliver("Product Weekly <hello@productweekly.co>", to, "Issue #142 — inboxes for agents", {
  text: `This week: why short-lived inboxes are the missing primitive for AI agents.

  1. Agents need an identity, not a signup form.
  2. Multi-domain inboxes beat aliasing when you run at scale.
  3. Structured JSON means no scraping, no HTML parsing.

Read the full issue at https://productweekly.co/issues/142`,
});

console.log("accessUrl:", mailbox.accessUrl);
