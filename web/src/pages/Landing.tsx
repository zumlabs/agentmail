import {
  ArrowRight,
  ArrowUpRight,
  Braces,
  Clock,
  Globe,
  Inbox as InboxIcon,
  KeyRound,
  Link2,
  Mail,
  ShieldCheck,
  Terminal,
  Zap,
} from "lucide-react";
import { CodeBlock, MethodPill } from "../components/CodeBlock";
import { ThemeToggle } from "../components/ThemeToggle";
import routeDocs from "../data/routes.json";
import { avatarGradient, initials } from "../lib/format";
import { cx } from "../lib/cx";

const FEATURES = [
  {
    icon: Globe,
    title: "Multiple domains",
    body: "Register the domains that route inbound mail to the Worker. Choose one per mailbox or let the API select.",
  },
  {
    icon: Braces,
    title: "Structured messages",
    body: "Read parsed headers, text, HTML, attachments, authentication results, and extracted codes as JSON.",
  },
  {
    icon: Link2,
    title: "Shareable inbox links",
    body: "Open a mailbox in a browser with a short link. Rotate the link without changing its API key.",
  },
  {
    icon: Clock,
    title: "Mailbox lifetime control",
    body: "Mailboxes persist by default; set an optional lifetime when you need a temporary inbox.",
  },
];

const AUTH_ROWS = [
  {
    header: "X-API-Key: am_live_…",
    scope: "Full control of one mailbox: read, delete, extend, rotate link.",
    audience: "Automation",
  },
  {
    header: "X-Access-Token: <slug>",
    scope: "Read, delete messages, extend TTL. Cannot delete the mailbox itself.",
    audience: "Share links",
  },
  {
    header: "Authorization: Bearer $ADMIN_TOKEN",
    scope: "Create mailboxes, list everything, manage domains and stats.",
    audience: "Operator",
  },
  {
    header: "Cookie: agentmail_admin=…",
    scope: "Dashboard session, same admin powers. Mutations also need X-AgentMail-CSRF: 1.",
    audience: "Dashboard",
  },
];

const QUICKSTART = [
  {
    step: "01",
    title: "Provision",
    body: "Returns the address, API key and link.",
    request: [
      'curl -X POST "$BASE/api/v1/mailboxes" \\',
      '  -H "Authorization: Bearer $ADMIN_TOKEN" \\',
      '  -H "Content-Type: application/json" \\',
      '  -d \'{"domain":"random","local":"qa-run"}\'',
    ].join("\n"),
    response: [
      "{",
      '  "object": "mailbox",',
      '  "address": "qa-run@mail.example.com",',
      '  "apiKey": "am_live_…",',
      '  "accessUrl": "https://mail.example.com/m/x7Kp2Qa",',
      '  "expiresAt": null',
      "}",
    ].join("\n"),
  },
  {
    step: "02",
    title: "Read",
    body: "Resolves on new mail, or after 25s.",
    request: [
      'curl -s "$BASE/api/v1/mailboxes/me/messages?wait=25" \\',
      '  -H "X-API-Key: am_live_…"',
    ].join("\n"),
    response: [
      "{",
      '  "object": "list",',
      '  "data": [{',
      '    "id": "01M6H9RZCHKBJHY6XNDP6TV7JJ",',
      '    "from": { "name": "GitHub", "address": "noreply@github.com" },',
      '    "subject": "Your verification code",',
      '    "snippet": "Your verification code is 483920…",',
      '    "seen": false',
      "  }],",
      '  "has_more": false',
      "}",
    ].join("\n"),
  },
  {
    step: "03",
    title: "Share",
    body: "Human inbox, revocable anytime.",
    request: "https://mail.example.com/m/x7Kp2Qa",
    response: [
      "GET /m/x7Kp2Qa",
      "→ iOS-style inbox, live polling every 4s",
      "→ read · delete · extend TTL",
      "→ remote images blocked until requested",
    ].join("\n"),
  },
];

interface EndpointDoc {
  group: "Mailboxes" | "Messages" | "Admin";
  method: string;
  path: string;
  summary: string;
  params?: string[];
  auth: string;
  request?: string;
  requestLabel?: string;
  response: string;
  responseLabel?: string;
}

const ENDPOINTS: EndpointDoc[] = [
  {
    group: "Mailboxes",
    method: "POST",
    path: "/api/v1/mailboxes",
    summary: "Creates an inbox; the API key is returned once.",
    params: ["domain? name | random", "local?", "label?", "ttl? 60s–30d", "meta? ≤ 4 KiB"],
    auth: "Admin token or dashboard session",
    request: [
      'curl -X POST "$BASE/api/v1/mailboxes" \\',
      '  -H "Authorization: Bearer $ADMIN_TOKEN" \\',
      '  -H "Content-Type: application/json" \\',
      '  -d \'{"domain":"mail.example.com","local":"qa-42","ttl":86400,"label":"run 42"}\'',
    ].join("\n"),
    response: [
      "HTTP/1.1 201 Created",
      "{",
      '  "object": "mailbox",',
      '  "id": "mb_01JB…",',
      '  "address": "qa-42@mail.example.com",',
      '  "local": "qa-42",',
      '  "domain": "mail.example.com",',
      '  "label": "run 42",',
      '  "status": "active",',
      '  "createdAt": "2026-11-04T09:12:00.000Z",',
      '  "expiresAt": "2026-11-05T09:12:00.000Z",',
      '  "lastSeenAt": null,',
      '  "messageCount": 0,',
      '  "unreadCount": 0,',
      '  "lastMessageAt": null,',
      '  "meta": null,',
      '  "accessUrl": "https://mail.example.com/m/x7Kp2Qa",',
      '  "urls": { "self": "/api/v1/mailboxes/mb_01JB…", "messages": "…", "access": "…/m/x7Kp2Qa" },',
      '  "apiKey": "am_live_…",',
      '  "apiKeyPrefix": "am_live",',
      '  "accessToken": "x7Kp2Qa"',
      "}",
    ].join("\n"),
  },
  {
    group: "Mailboxes",
    method: "GET",
    path: "/api/v1/mailboxes/me/messages",
    summary: "Newest first, optional long-poll.",
    params: ["limit ≤ 100", "cursor", "since", "unread", "wait ≤ 25s"],
    auth: "API key or access token",
    request: [
      'curl -s "$BASE/api/v1/mailboxes/me/messages?limit=20&unread=1&wait=25" \\',
      '  -H "X-API-Key: am_live_…"',
    ].join("\n"),
    response: [
      "{",
      '  "object": "list",',
      '  "data": [',
      "    {",
      '      "object": "message", "v": 1,',
      '      "id": "01M6H9RZCHKBJHY6XNDP6TV7JJ",',
      '      "mailboxId": "mb_01JB…",',
      '      "from": { "name": "GitHub", "address": "noreply@github.com" },',
      '      "to": [{ "name": null, "address": "qa-42@mail.example.com" }],',
      '      "subject": "Your verification code",',
      '      "snippet": "Your verification code is 483920…",',
      '      "receivedAt": "2026-11-04T09:13:02.000Z",',
      '      "size": 8123,',
      '      "hasAttachments": false,',
      '      "attachmentCount": 0,',
      '      "seen": false,',
      '      "urls": { "self": "/api/v1/messages/01M6H9…", "raw": "/api/v1/messages/01M6H9…/raw" }',
      "    }",
      "  ],",
      '  "has_more": false,',
      '  "next_cursor": null',
      "}",
    ].join("\n"),
  },
  {
    group: "Mailboxes",
    method: "POST",
    path: "/api/v1/mailboxes/me/rotate-token",
    summary: "New share link; the old slug dies.",
    auth: "API key only",
    response: [
      "{",
      '  "id": "mb_01JB…",',
      '  "accessToken": "Qm4vT1z",',
      '  "accessUrl": "https://mail.example.com/m/Qm4vT1z"',
      "}",
    ].join("\n"),
  },
  {
    group: "Messages",
    method: "GET",
    path: "/api/v1/messages/:id",
    summary: "Parsed message, OTP and links included.",
    auth: "API key or access token",
    response: [
      "{",
      '  "object": "message", "v": 1,',
      '  "id": "01M6H9…",',
      '  "mailboxId": "mb_01JB…",',
      '  "from": { "name": "GitHub", "address": "noreply@github.com" },',
      '  "to": [{ "name": null, "address": "qa-42@mail.example.com" }],',
      '  "cc": [],',
      '  "subject": "Your verification code",',
      '  "snippet": "Your verification code is 483920…",',
      '  "receivedAt": "2026-11-04T09:13:02.000Z",',
      '  "size": 8123,',
      '  "hasAttachments": false,',
      '  "attachmentCount": 0,',
      '  "seen": true,',
      '  "urls": { "self": "…", "raw": "…" },',
      '  "text": "Your verification code is 483920. …",',
      '  "html": "<p>Your verification code is 483920</p>",',
      '  "headers": { "message-id": "<…@github.com>" },',
      '  "extracted": {',
      '    "otp": ["483920"],',
      '    "links": ["https://github.com/settings/sessions"],',
      '    "codes": [],',
      '    "intent": "verification",',
      '    "primaryLink": "https://github.com/settings/sessions",',
      '    "actionText": "Review your sessions",',
      '    "unsubscribe": []',
      '  },',
      '  "authentication": { "spf": "pass", "dkim": "pass", "dmarc": "pass" },',
      '  "attachments": []',
      "}",
    ].join("\n"),
  },
  {
    group: "Messages",
    method: "GET",
    path: "/api/v1/messages/:id/raw",
    summary: "Original RFC 822 source.",
    auth: "API key or access token",
    response: [
      "HTTP/1.1 200 OK",
      'content-type: message/rfc822',
      'content-disposition: attachment; filename="Your_verification_code.eml"',
      "",
      "From: GitHub <noreply@github.com>",
      "Subject: Your verification code",
      "…",
    ].join("\n"),
    responseLabel: "response headers",
  },
  {
    group: "Messages",
    method: "DELETE",
    path: "/api/v1/messages/:id",
    summary: "Deletes the message and its blobs.",
    auth: "API key or access token",
    response: ['{ "deleted": true, "id": "01M6H9…", "objectsDeleted": 3 }'].join("\n"),
  },
  {
    group: "Admin",
    method: "POST",
    path: "/api/v1/admin/session",
    summary: "Trades the admin token for a 7-day cookie.",
    auth: "Admin token",
    request: [
      'curl -X POST "$BASE/api/v1/admin/session" \\',
      '  -H "Content-Type: application/json" \\',
      '  -d \'{"token":"$ADMIN_TOKEN"}\' \\',
      "  -c cookies.txt",
    ].join("\n"),
    response: [
      "HTTP/1.1 200 OK",
      "set-cookie: agentmail_admin=v1.…; Path=/; HttpOnly; SameSite=Strict; Max-Age=604800",
      "{",
      '  "authenticated": true,',
      '  "mode": "cookie",',
      '  "expiresIn": 604800',
      "}",
    ].join("\n"),
  },
  {
    group: "Admin",
    method: "POST",
    path: "/api/v1/admin/domains",
    summary: "Registers a domain for inbound mail.",
    auth: "Admin token or dashboard session",
    request: [
      'curl -X POST "$BASE/api/v1/admin/domains" \\',
      '  -H "Authorization: Bearer $ADMIN_TOKEN" \\',
      '  -H "Content-Type: application/json" \\',
      '  -d \'{"domain":"mail.example.com","label":"Main"}\'',
    ].join("\n"),
    response: [
      "HTTP/1.1 201 Created",
      "{",
      '  "object": "domain",',
      '  "domain": "mail.example.com",',
      '  "label": "Main",',
      '  "active": true,',
      '  "createdAt": "2026-11-04T09:00:00.000Z",',
      '  "mailboxes": 0',
      "}",
    ].join("\n"),
  },
  {
    group: "Admin",
    method: "GET",
    path: "/api/v1/admin/mailboxes",
    summary: "All mailboxes with counts and links.",
    params: ["q", "domain", "limit ≤ 200"],
    auth: "Admin token or dashboard session",
    request: 'curl -s "$BASE/api/v1/admin/mailboxes?q=qa&limit=50" \\\n  -H "Authorization: Bearer $ADMIN_TOKEN"',
    response: [
      "{",
      '  "object": "list",',
      '  "data": [{',
      '    "object": "mailbox",',
      '    "id": "mb_01JB…",',
      '    "address": "qa-run@mail.example.com",',
      '    "local": "qa-run",',
      '    "domain": "mail.example.com",',
      '    "label": "qa",',
      '    "status": "active",',
      '    "createdAt": "2026-11-04T09:12:00.000Z",',
      '    "expiresAt": null,',
      '    "messageCount": 12,',
      '    "unreadCount": 3,',
      '    "lastMessageAt": "2026-11-04T09:13:02.000Z",',
      '    "accessUrl": "https://mail.example.com/m/x7Kp2Qa",',
      '    "apiKeyPrefix": "am_live"',
      "  }]",
      "}",
    ].join("\n"),
  },
  {
    group: "Admin",
    method: "PATCH",
    path: "/api/v1/admin/mailboxes/:id",
    summary: "Rename, set TTL, or pause access.",
    params: ["label?", "ttl? null clears", "status? active | paused"],
    auth: "Admin token or dashboard session",
    request: [
      'curl -X PATCH "$BASE/api/v1/admin/mailboxes/mb_01JB…" \\',
      '  -H "Authorization: Bearer $ADMIN_TOKEN" \\',
      '  -H "Content-Type: application/json" \\',
      '  -d \'{"status":"paused","ttl":604800,"label":"qa"}\'',
    ].join("\n"),
    response: [
      "{",
      '  "object": "mailbox",',
      '  "id": "mb_01JB…",',
      '  "label": "qa",',
      '  "status": "paused",',
      '  "expiresAt": "2026-11-11T09:12:00.000Z",',
      '  "messageCount": 12,',
      '  "unreadCount": 3',
      "}",
    ].join("\n"),
  },
  {
    group: "Admin",
    method: "POST",
    path: "/api/v1/admin/mailboxes/:id/rotate-key",
    summary: "Revokes the key; issues a new one.",
    auth: "Admin token or dashboard session",
    response: [
      "{",
      '  "id": "mb_01JB…",',
      '  "apiKey": "am_live_…",',
      '  "apiKeyPrefix": "am_live_ab12"',
      "}",
    ].join("\n"),
  },
  {
    group: "Admin",
    method: "GET",
    path: "/api/v1/admin/stats",
    summary: "Dashboard totals, per domain.",
    auth: "Admin token or dashboard session",
    response: [
      "{",
      '  "object": "stats",',
      '  "totals": {',
      '    "mailboxes": 18, "expired": 0, "messages": 240, "unread": 9,',
      '    "recentMessages": 31, "attachments": 12, "storedBytes": 4210992',
      "  },",
      '  "domains": [{ "domain": "mail.example.com", "mailboxes": 18, "messages": 240 }]',
      "}",
    ].join("\n"),
  },
];

const ENVELOPE = [
  "{",
  '  "object": "message",',
  '  "v": 1,',
  '  "id": "01M6H9RZCHKBJHY6XNDP6TV7JJ",',
  '  "mailboxId": "mb_01JB…",',
  '  "from": { "name": "GitHub", "address": "noreply@github.com" },',
  '  "to": [{ "name": null, "address": "qa-42@mail.example.com" }],',
  '  "cc": [],',
  '  "subject": "Your verification code",',
  '  "snippet": "Your verification code is 483920. Enter it to finish signing in…",',
  '  "receivedAt": "2026-11-04T09:13:02.000Z",',
  '  "size": 8123,',
  '  "hasAttachments": true,',
  '  "attachmentCount": 1,',
  '  "seen": true,',
  '  "text": "Your verification code is 483920…",',
  '  "html": "<div>Your verification code is 483920</div>",',
  '  "headers": { "message-id": "<…@github.com>", "authentication-results": "…spf=pass…" },',
  '  "authentication": { "spf": "pass", "dkim": "pass", "dmarc": "pass" },',
  '  "extracted": {',
  '    "otp": ["483920"],',
  '    "links": ["https://github.com/settings/sessions"],',
  '    "codes": ["SAVE20"],',
  '    "intent": "verification",',
  '    "primaryLink": "https://github.com/settings/sessions",',
  '    "actionText": "Review your sessions",',
  '    "unsubscribe": ["https://github.com/unsubscribe"]',
  "  },",
  '  "attachments": [',
  "    {",
  '      "id": "att_01M6H9…",',
  '      "filename": "receipt-2261.pdf",',
  '      "mime": "application/pdf",',
  '      "size": 9123,',
  '      "inline": false,',
  '      "url": "/api/v1/messages/01M6H9…/attachments/att_01M6H9…"',
  "    }",
  "  ],",
  '  "urls": {',
  '    "self": "/api/v1/messages/01M6H9…",',
  '    "raw": "/api/v1/messages/01M6H9…/raw"',
  "  }",
  "}",
].join("\n");

const ERRORS = [
  { status: "400", code: "invalid_json", meaning: "Body is not a JSON object" },
  { status: "400", code: "invalid_local", meaning: "Local part must be 1-63 chars of a-z 0-9 . _ -" },
  { status: "400", code: "invalid_ttl", meaning: "ttl must be a number of seconds" },
  { status: "400", code: "invalid_meta", meaning: "meta must be a JSON object" },
  { status: "400", code: "invalid_status", meaning: 'status must be "active" or "paused"' },
  { status: "400", code: "invalid_domain", meaning: "Domain is not a valid hostname" },
  { status: "400", code: "nothing_to_update", meaning: "PATCH without label, ttl or status" },
  { status: "401", code: "invalid_api_key", meaning: "Unknown or malformed mailbox API key" },
  { status: "401", code: "invalid_token", meaning: "Unknown access link slug" },
  { status: "401", code: "missing_credentials", meaning: "No API key, link token or admin token supplied" },
  { status: "401", code: "unauthorized", meaning: "Admin route without a valid token or session" },
  { status: "401", code: "invalid_admin_token", meaning: "Wrong token on /admin/session" },
  { status: "403", code: "mailbox_inactive", meaning: "Mailbox is paused" },
  { status: "403", code: "insufficient_scope", meaning: "Access links cannot perform that action" },
  { status: "403", code: "creation_disabled", meaning: "Public provisioning is off; use admin auth" },
  { status: "403", code: "csrf_failed", meaning: "Cookie mutation without X-AgentMail-CSRF" },
  { status: "404", code: "not_found", meaning: "No route for that path" },
  { status: "404", code: "mailbox_not_found", meaning: "No such mailbox for this credential" },
  { status: "404", code: "message_not_found", meaning: "No such message in this mailbox" },
  { status: "404", code: "attachment_not_found", meaning: "No such attachment on that message" },
  { status: "404", code: "domain_not_found", meaning: "Domain is not registered" },
  { status: "405", code: "method_not_allowed", meaning: "Path exists, method does not" },
  { status: "409", code: "address_taken", meaning: "Local part already used on that domain" },
  { status: "409", code: "domain_exists", meaning: "Domain is already registered" },
  { status: "409", code: "domain_in_use", meaning: "Domain still has mailboxes; deactivate instead" },
  { status: "410", code: "mailbox_expired", meaning: "The mailbox TTL has passed" },
  { status: "410", code: "raw_unavailable", meaning: "Raw MIME is no longer stored" },
  { status: "410", code: "attachment_unavailable", meaning: "Attachment is no longer stored" },
  { status: "413", code: "payload_too_large", meaning: "Request body over the 32 KiB cap" },
  { status: "413", code: "meta_too_large", meaning: "meta over 4 KiB" },
  { status: "429", code: "rate_limited", meaning: "Provisioning limit hit; see details.retryAfter" },
  { status: "429", code: "too_many_attempts", meaning: "Credential guessing throttled" },
  { status: "500", code: "internal_error", meaning: "Unhandled failure; requestId is in logs" },
  { status: "503", code: "no_domains", meaning: "No active domain is configured" },
  { status: "503", code: "admin_disabled", meaning: "ADMIN_TOKEN is not configured" },
];

const LIMITS = [
  { label: "Inbound message", value: "25 MiB", hint: "Cloudflare Email Routing cap" },
  { label: "Share slug", value: "7 chars", hint: "base62 · ~41.7 bits" },
  { label: "TTL", value: "60s to 30d", hint: "omit for no expiry" },
  { label: "Long-poll", value: "≤ 25s", hint: "resolves on new mail" },
  { label: "Message list", value: "≤ 100", hint: "cursor pagination" },
  { label: "Admin list", value: "≤ 200", hint: "mailbox search" },
  { label: "Public create", value: "20/hour", hint: "per IP, only when enabled" },
];

function InboxPreview() {
  return (
    <div className="product-window-wrap" aria-label="Illustrative inbox preview">
      <div
        aria-hidden
        className="product-window-glow"
        style={{ background: "radial-gradient(50% 50% at 50% 50%, var(--accent-soft), transparent 72%)" }}
      />
      <div className="product-window">
        <div className="product-window-bar"><span className="window-dots"><i /><i /><i /></span><span>AGENTMAIL / INBOX</span><span className="window-live"><i /> Sample view</span></div>
        <div className="product-window-content">
        <div className="flex items-center justify-between gap-2">
          <code className="truncate font-mono text-[10.5px] text-tertiary">qa@studio.example</code>
          <span className="inline-flex items-center gap-1 text-[10px] font-semibold uppercase tracking-[0.1em] text-success">
            <span className="size-1.5 rounded-full bg-success" /> Live
          </span>
        </div>

        <div className="mt-3.5 flex items-start gap-2.5">
          <span
            aria-hidden
            className="flex size-8 shrink-0 items-center justify-center rounded-full text-[11px] font-semibold text-white"
            style={{ background: avatarGradient("noreply@github.com") }}
          >
            {initials("GitHub", "noreply@github.com")}
          </span>
          <div className="min-w-0 flex-1">
            <div className="flex items-baseline justify-between gap-2">
              <span className="truncate text-[12.5px] font-semibold">GitHub</span>
              <span className="shrink-0 text-[10.5px] text-tertiary">now</span>
            </div>
            <div className="truncate text-[12px] text-secondary">Your verification code</div>
          </div>
          <span className="mt-1.5 size-1.5 shrink-0 rounded-full bg-accent" />
        </div>

        <div className="mt-3 rounded-xl border border-accent/20 bg-accent-soft p-3">
          <div className="text-[9.5px] font-semibold uppercase tracking-[0.12em] text-accent">Extracted OTP</div>
          <div className="mt-1 flex items-baseline justify-between gap-2">
            <span className="font-mono text-[22px] font-semibold tracking-[0.18em]">483920</span>
            <span className="rounded-full bg-surface px-2 py-0.5 text-[9.5px] font-medium text-secondary">copy</span>
          </div>
        </div>

        <div className="mt-2.5 overflow-hidden rounded-lg bg-[#0b0b0f] px-2.5 py-2 font-mono text-[9.5px] leading-relaxed break-all whitespace-pre-wrap text-[#e5e5ea]">
          <span className="text-white/40">$ </span>curl -s /mailboxes/me/messages
          <br />
          <span className="text-white/40">&gt; </span>
          {`{"otp":["483920"]}`}
        </div>

        <div className="mt-2.5 flex items-center gap-1.5 text-[10.5px] text-tertiary">
          <Link2 className="size-3" /> mail.example.com/m/x7Kp2Qa
        </div>
        </div>
      </div>
      <span className="preview-caption">Illustrative product preview</span>
    </div>
  );
}

function SectionHeading({ id, eyebrow, title, body }: { id: string; eyebrow: string; title: string; body: string }) {
  return (
    <div id={id} className="scroll-mt-24">
      <div className="section-eyebrow">{eyebrow}</div>
      <h2 className="section-title">{title}</h2>
      <p className="section-copy">{body}</p>
    </div>
  );
}

export function Landing({ onSignIn }: { onSignIn: () => void }) {
  const origin = typeof location === "undefined" ? "https://agentmail.dev" : location.origin;
  const groups = ["Mailboxes", "Messages", "Admin"] as const;

  return (
    <div className="site-shell">
      <header className="site-header">
        <div className="site-nav-wrap">
          <button className="brand-lockup" type="button" onClick={() => window.scrollTo({ top: 0, behavior: "smooth" })} aria-label="AgentMail home">
            <span className="brand-mark"><Mail size={17} strokeWidth={2.2} /></span>
            <span><b>AgentMail</b><small>inbox infrastructure</small></span>
          </button>
          <nav className="site-nav" aria-label="Main navigation">
            <a href="#quickstart">How it works</a>
            <a href="#features">Features</a>
            <a href="#api">For developers</a>
          </nav>
          <div className="site-nav-actions">
            <ThemeToggle />
            <button className="button button-quiet button-small" type="button" onClick={onSignIn}>Log in <ArrowRight size={14} /></button>
          </div>
        </div>
      </header>

      <main className="site-container">
        <section className="site-hero">
          <div className="hero-grid">
            <div className="hero-copy">
              <div className="eyebrow"><span className="status-pulse" /> INBOX INFRASTRUCTURE FOR AGENTS</div>
              <h1>Give every agent<br />an <em>inbox.</em></h1>
              <p className="hero-description">Receive email on your domains, provision mailboxes through an API, and read parsed messages as structured data. Share a human-friendly inbox link when needed.</p>

              <div className="hero-actions">
                <button className="button button-primary" type="button" onClick={onSignIn}>Open dashboard <ArrowRight size={16} /></button>
                <a className="button button-quiet" href="#quickstart">See how it works</a>
              </div>

              <p className="hero-note"><ShieldCheck size={14} /> Receive-only. No SMTP server to run.</p>
            </div>

            <InboxPreview />
          </div>
        </section>
        <div className="value-strip">
          <div className="value-strip-inner">
            <span>A focused layer between email and your agent stack.</span>
            <div><span><ShieldCheck size={14} /> Your domains</span><span><Braces size={14} /> Structured JSON</span><span><Link2 size={14} /> Shareable inboxes</span></div>
          </div>
        </div>

        <section className="site-section">
          <SectionHeading
            id="quickstart"
            eyebrow="Quickstart"
            title="Three calls from zero to inbox"
            body="Provision, read, share. Replace $BASE and the tokens."
          />

          <div className="mt-5 grid gap-4 lg:grid-cols-3">
            {QUICKSTART.map((step) => (
              <div key={step.step} className="flex min-w-0 flex-col rounded-ios border border-hairline bg-surface p-4 card-shadow">
                <div className="flex items-center justify-between">
                  <span className="font-mono text-[11px] text-tertiary">{step.step}</span>
                  <span className="flex size-7 items-center justify-center rounded-lg bg-accent-soft text-accent">
                    {step.step === "01" ? (
                      <KeyRound className="size-3.5" />
                    ) : step.step === "02" ? (
                      <Mail className="size-3.5" />
                    ) : (
                      <Link2 className="size-3.5" />
                    )}
                  </span>
                </div>
                <h3 className="mt-2 text-[15px] font-semibold">{step.title}</h3>
                <p className="mt-1 text-[12.5px] leading-relaxed text-secondary">{step.body}</p>
                <div className="mt-3 space-y-2">
                  <CodeBlock code={step.request} label={step.step === "03" ? "link" : "request"} />
                  <CodeBlock code={step.response} label={step.step === "03" ? "what the human sees" : "response"} />
                </div>
              </div>
            ))}
          </div>
        </section>

        <section className="site-section feature-section">
          <div className="feature-intro">
            <SectionHeading
              id="features"
              eyebrow="BUILT AROUND THE INBOX"
              title="Email, organized for the next step."
              body="Give automations the message data they need, while keeping a simple inbox available for people to inspect or share."
            />
          </div>
          <div className="feature-grid">
            {FEATURES.map((feature) => (
              <div key={feature.title} className="feature-card">
                <span className="feature-icon"><feature.icon className="size-4" /></span>
                <div className="mt-2.5 text-[14px] font-semibold">{feature.title}</div>
                <p className="mt-1 text-[12.5px] leading-relaxed text-secondary">{feature.body}</p>
              </div>
            ))}
          </div>
        </section>

        <section className="site-section">
          <div className="workflow-card">
            <div className="workflow-copy">
              <div className="section-eyebrow">API-FIRST WORKFLOW</div>
              <h2>Mail that fits into your stack.</h2>
              <p>Provision an inbox, then fetch its messages with a mailbox-scoped API key. Responses are structured for your application.</p>
              <a href="#api" className="text-link">Explore the API <ArrowRight size={14} /></a>
            </div>
            <div className="workflow-code">
              <div className="code-window-title"><span>GET /api/v1/mailboxes/me/messages</span><span>JSON</span></div>
              <pre><code>{`curl -s "$BASE/api/v1/mailboxes/me/messages" \\
  -H "X-API-Key: $MAILBOX_API_KEY"

{
  "object": "list",
  "data": [{
    "from": { "address": "noreply@example.com" },
    "subject": "Your message subject",
    "seen": false
  }],
  "has_more": false
}`}</code></pre>
            </div>
          </div>
        </section>

        <section className="site-section">
          <div className="cta-band">
            <div><h2>Put an inbox in your agent’s toolkit.</h2><p>Manage mailboxes and domains from the AgentMail dashboard.</p></div>
            <button className="button button-primary" type="button" onClick={onSignIn}>Open dashboard <ArrowRight size={15} /></button>
          </div>
        </section>

        <section className="site-section api-section">
          <SectionHeading
            id="api"
            eyebrow="FOR DEVELOPERS"
            title="API reference"
            body="Base /api/v1. JSON except raw MIME and attachment blobs."
          />

          <div className="mt-5 overflow-hidden rounded-ios border border-hairline bg-surface card-shadow">
            {AUTH_ROWS.map((row) => (
              <div key={row.header} className="flex flex-col gap-1 border-b border-hairline px-4 py-3 last:border-b-0 sm:flex-row sm:items-center sm:gap-4">
                <code className="shrink-0 font-mono text-[11.5px] sm:w-[280px]">{row.header}</code>
                <span className="flex-1 text-[12.5px] text-secondary">{row.scope}</span>
                <span className="shrink-0 rounded-full bg-hairline/60 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-secondary sm:self-start">
                  {row.audience}
                </span>
              </div>
            ))}
          </div>

          <div className="mt-4 overflow-hidden rounded-ios border border-hairline bg-surface card-shadow">
            <div className="flex items-center justify-between gap-2 border-b border-hairline px-4 py-2.5">
              <span className="text-[11px] font-semibold uppercase tracking-[0.12em] text-secondary">All endpoints</span>
              <span className="text-[10.5px] text-tertiary">{routeDocs.length} routes</span>
            </div>
            {[...new Set(routeDocs.map((entry) => entry.group))].map((group) => (
              <div key={group}>
                <div className="border-b border-hairline bg-canvas px-4 py-1.5 text-[10px] font-semibold uppercase tracking-[0.12em] text-tertiary">
                  {group}
                </div>
                {routeDocs
                  .filter((entry) => entry.group === group)
                  .map((entry) => (
                    <div
                      key={entry.method + entry.path}
                      className="flex items-start gap-2 border-b border-hairline px-4 py-2 last:border-b-0"
                    >
                      <MethodPill method={entry.method} />
                      <div className="min-w-0 flex-1">
                        <code className="block break-all font-mono text-[11.5px]">{entry.path}</code>
                        <span className="text-[10.5px] text-tertiary">{entry.note}</span>
                      </div>
                      <span className="hidden shrink-0 rounded-full bg-hairline/50 px-2 py-0.5 text-[9.5px] font-medium text-secondary sm:inline">
                        {entry.auth}
                      </span>
                    </div>
                  ))}
              </div>
            ))}
          </div>

          <p className="mt-2 px-1 text-[12px] text-secondary">
            <span className="font-mono text-[11px]">:id</span> also accepts{" "}
            <span className="font-mono text-[11px]">me</span> for the mailbox behind the credential.
          </p>

          {groups.map((group) => (
            <div key={group} className="mt-8">
              <h3 className="flex items-center gap-2 text-[13px] font-semibold uppercase tracking-[0.12em] text-secondary">
                {group}
                <span className="h-px flex-1 bg-hairline" />
              </h3>

              <div className="mt-3 space-y-3">
                {ENDPOINTS.filter((endpoint) => endpoint.group === group).map((endpoint) => (
                  <article key={endpoint.path + endpoint.method} className="min-w-0 rounded-ios border border-hairline bg-surface card-shadow">
                    <div className="flex flex-wrap items-center gap-2 px-4 pt-3.5">
                      <MethodPill method={endpoint.method} />
                      <code className="min-w-0 break-all font-mono text-[12.5px] font-medium">{endpoint.path}</code>
                      <span className="ml-auto rounded-full bg-hairline/50 px-2 py-0.5 text-[10px] font-medium text-secondary">
                        {endpoint.auth}
                      </span>
                    </div>
                    <p className="px-4 pt-1.5 text-[12.5px] leading-relaxed text-secondary">{endpoint.summary}</p>
                    {endpoint.params ? (
                      <div className="flex flex-wrap gap-1.5 px-4 pt-2">
                        {endpoint.params.map((param) => (
                          <span
                            key={param}
                            className="rounded-md border border-hairline bg-canvas px-2 py-0.5 font-mono text-[10.5px] text-secondary"
                          >
                            {param}
                          </span>
                        ))}
                      </div>
                    ) : null}

                    <div
                      className={cx(
                        "grid gap-2 p-3",
                        endpoint.request ? "sm:grid-cols-2" : "sm:grid-cols-1",
                      )}
                    >
                      {endpoint.request ? (
                        <CodeBlock code={endpoint.request} label={endpoint.requestLabel ?? "request"} />
                      ) : null}
                      <CodeBlock code={endpoint.response} label={endpoint.responseLabel ?? "response"} />
                    </div>
                  </article>
                ))}
              </div>
            </div>
          ))}
        </section>

        <section className="site-section">
          <SectionHeading
            id="envelope"
            eyebrow="Data model"
            title="Message envelope v1"
            body="Same shape for list and detail; the list omits bodies."
          />
          <div className="mt-4">
            <CodeBlock code={ENVELOPE} label="GET /api/v1/messages/:id → 200" />
          </div>
          <div className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
            <div className="rounded-xl border border-hairline bg-surface p-3">
              <div className="text-[11px] font-semibold uppercase tracking-[0.1em] text-secondary">OTP</div>
              <p className="mt-1 text-[12px] leading-relaxed text-secondary">
                Keyword proximity, hyphenated codes, subject hints, and the <span className="font-mono text-[11px]">OTP-Token</span> header.
              </p>
            </div>
            <div className="rounded-xl border border-hairline bg-surface p-3">
              <div className="text-[11px] font-semibold uppercase tracking-[0.1em] text-secondary">Intent</div>
              <p className="mt-1 text-[12px] leading-relaxed text-secondary">
                verification, password reset, receipt, newsletter, notification, or other.
              </p>
            </div>
            <div className="rounded-xl border border-hairline bg-surface p-3">
              <div className="text-[11px] font-semibold uppercase tracking-[0.1em] text-secondary">Action</div>
              <p className="mt-1 text-[12px] leading-relaxed text-secondary">
                <span className="font-mono text-[11px]">primaryLink</span> and its button text, with opt-out links kept apart.
              </p>
            </div>
            <div className="rounded-xl border border-hairline bg-surface p-3">
              <div className="text-[11px] font-semibold uppercase tracking-[0.1em] text-secondary">Attachments</div>
              <p className="mt-1 text-[12px] leading-relaxed text-secondary">
                Streamed from R2; the URL is stable until the message is deleted.
              </p>
            </div>
          </div>
        </section>

        <section className="site-section reference-lower">
          <div>
            <SectionHeading
              id="errors"
              eyebrow="Reference"
              title="Errors"
              body="Status, stable code, message, request id."
            />
            <div className="mt-4 overflow-hidden rounded-ios border border-hairline bg-surface card-shadow">
              {ERRORS.map((error) => (
                <div key={error.code} className="flex items-start gap-3 border-b border-hairline px-4 py-2.5 last:border-b-0">
                  <span className="w-8 shrink-0 font-mono text-[11.5px] font-semibold text-secondary">{error.status}</span>
                  <code className="w-[170px] shrink-0 truncate font-mono text-[11.5px]">{error.code}</code>
                  <span className="min-w-0 flex-1 text-[12px] text-secondary">{error.meaning}</span>
                </div>
              ))}
            </div>
          </div>

          <div>
            <SectionHeading
              id="limits"
              eyebrow="Reference"
              title="Limits"
              body="Caps enforced by the Worker and platform."
            />
            <div className="mt-4 space-y-2">
              {LIMITS.map((limit) => (
                <div key={limit.label} className="flex items-center justify-between rounded-xl border border-hairline bg-surface px-3.5 py-2.5">
                  <div>
                    <div className="text-[12.5px] font-medium">{limit.label}</div>
                    <div className="text-[11px] text-tertiary">{limit.hint}</div>
                  </div>
                  <span className="font-mono text-[12.5px] font-semibold text-accent">{limit.value}</span>
                </div>
              ))}
            </div>

            <a
              href={`${origin}/api/v1/health`}
              target="_blank"
              rel="noreferrer"
              className="mt-3 inline-flex items-center gap-1.5 text-[12.5px] font-medium text-accent"
            >
              Live health check <ArrowUpRight className="size-3.5" />
            </a>
          </div>
        </section>
      </main>

      <footer className="site-footer">
        <div className="site-container site-footer-inner">
          <span className="footer-brand"><span className="brand-mark"><Mail size={14} /></span> AgentMail</span>
          <span>Inbox infrastructure for agents.</span>
          <div><a href="#api">API</a><a href="#errors">Errors</a><button type="button" onClick={onSignIn}>Log in</button></div>
        </div>
      </footer>
    </div>
  );
}
