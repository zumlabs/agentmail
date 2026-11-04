import { env as cloudflareEnv, SELF } from "cloudflare:test";
import { beforeEach, describe, expect, it } from "vitest";
import { ingestEmail } from "../src/ingest";
import { purgeExpired } from "../src/retention";
import type { Env } from "../src/types";
import { buildEmail } from "./helpers";

const env = cloudflareEnv as unknown as Env;
const ORIGIN = "https://agentmail.test";
const ADMIN_HEADERS = {
  authorization: "Bearer test-admin-token",
  "content-type": "application/json",
};

interface MailboxResponse {
  id: string;
  address: string;
  apiKey: string;
  accessToken: string;
  accessUrl: string;
  expiresAt: string | null;
}

interface MessageDetail {
  id: string;
  subject: string;
  text: string | null;
  html: string | null;
  extracted: {
    otp: string[];
    links: string[];
    codes: string[];
    intent: string;
    primaryLink: string | null;
    actionText: string | null;
    unsubscribe: string[];
  };
  authentication: { spf: string | null; dkim: string | null; dmarc: string | null };
  attachments: Array<{ id: string; filename: string; size: number; url: string }>;
}

async function reset(): Promise<void> {
  await env.DB.batch(
    ["DELETE FROM attachments", "DELETE FROM messages", "DELETE FROM mailboxes", "DELETE FROM domains", "DELETE FROM rate_limits"].map(
      (sql) => env.DB.prepare(sql),
    ),
  );
}

async function addDomain(domain: string, active = true): Promise<void> {
  const response = await SELF.fetch(`${ORIGIN}/api/v1/admin/domains`, {
    method: "POST",
    headers: ADMIN_HEADERS,
    body: JSON.stringify({ domain, active }),
  });
  expect(response.status).toBe(201);
}

async function createMailbox(body: Record<string, unknown>): Promise<MailboxResponse> {
  const response = await SELF.fetch(`${ORIGIN}/api/v1/mailboxes`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  expect(response.status).toBe(201);
  return (await response.json()) as MailboxResponse;
}

async function readJson<T>(response: Response): Promise<T> {
  return (await response.json()) as T;
}

beforeEach(async () => {
  await reset();
  await addDomain("mail.test");
});

describe("mailbox creation", () => {
  it("creates a mailbox that never expires by default", async () => {
    const mailbox = await createMailbox({ domain: "mail.test", local: "agent" });

    expect(mailbox.address).toBe("agent@mail.test");
    expect(mailbox.expiresAt).toBeNull();
    expect(mailbox.apiKey.startsWith("am_live_")).toBe(true);
    expect(mailbox.accessToken).toMatch(/^[A-Za-z0-9]{7}$/);
    expect(mailbox.accessUrl).toBe(`https://agentmail.test/m/${mailbox.accessToken}`);
  });

  it("accepts the prefixed token form for the same link", async () => {
    const mailbox = await createMailbox({ domain: "mail.test", local: "prefixed" });
    const row = await env.DB.prepare("SELECT access_token FROM mailboxes WHERE id = ?1")
      .bind(mailbox.id)
      .first<{ access_token: string }>();
    expect(row?.access_token).toBe(`am_tok_${mailbox.accessToken}`);

    const response = await SELF.fetch(`${ORIGIN}/api/v1/mailboxes/me/messages`, {
      headers: { "x-access-token": row?.access_token ?? "" },
    });
    expect(response.status).toBe(200);
  });

  it("generates a local part when none is given", async () => {
    const mailbox = await createMailbox({ domain: "mail.test" });
    expect(mailbox.address).toMatch(/^[a-z0-9.]+@mail\.test$/);
  });

  it("generates human-looking names", async () => {
    for (let index = 0; index < 12; index += 1) {
      const mailbox = await createMailbox({ domain: "mail.test" });
      const local = mailbox.address.split("@")[0] ?? "";
      expect(local).toMatch(/^[a-z]{2,12}\.?[a-z]{2,14}\d{0,2}$/);
      expect(local).not.toMatch(/^\d/);
    }
  });

  it("picks a random active domain when domain=random", async () => {
    await addDomain("second.test");
    await addDomain("third.test");

    const seen = new Set<string>();
    for (let index = 0; index < 24; index += 1) {
      const mailbox = await createMailbox({ domain: "random" });
      seen.add(mailbox.address.split("@")[1] ?? "");
    }

    expect(seen.size).toBeGreaterThan(1);
    for (const domain of seen) {
      expect(["mail.test", "second.test", "third.test"]).toContain(domain);
    }
  });

  it("scopes local-part uniqueness to the domain", async () => {
    await addDomain("second.test");
    const primary = await createMailbox({ domain: "mail.test", local: "budi.santoso" });
    const secondary = await createMailbox({ domain: "second.test", local: "budi.santoso" });

    expect(primary.address).toBe("budi.santoso@mail.test");
    expect(secondary.address).toBe("budi.santoso@second.test");
  });

  it("rejects an unknown domain and a taken local part", async () => {
    const unknown = await SELF.fetch(`${ORIGIN}/api/v1/mailboxes`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ domain: "nope.test" }),
    });
    expect(unknown.status).toBe(400);
    expect((await readJson<{ error: { code: string } }>(unknown)).error.code).toBe("unknown_domain");

    await createMailbox({ domain: "mail.test", local: "taken" });
    const duplicate = await SELF.fetch(`${ORIGIN}/api/v1/mailboxes`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ domain: "mail.test", local: "taken" }),
    });
    expect(duplicate.status).toBe(409);
  });

  it("honours an explicit ttl and can clear it again", async () => {
    const mailbox = await createMailbox({ domain: "mail.test", local: "ttl", ttl: 3600 });
    expect(mailbox.expiresAt).not.toBeNull();

    const cleared = await SELF.fetch(`${ORIGIN}/api/v1/mailboxes/me`, {
      method: "PATCH",
      headers: { "content-type": "application/json", "x-api-key": mailbox.apiKey },
      body: JSON.stringify({ ttl: null }),
    });
    expect(cleared.status).toBe(200);
    expect((await readJson<{ expiresAt: string | null }>(cleared)).expiresAt).toBeNull();
  });
});

describe("ingestion and JSON reads", () => {
  it("stores mail and exposes parsed JSON with OTP and links", async () => {
    const mailbox = await createMailbox({ domain: "mail.test", local: "reader" });

    const result = await ingestEmail(
      env,
      { from: "noreply@example.com", to: mailbox.address },
      buildEmail({
        to: mailbox.address,
        subject: "Your verification code",
        text: "Your verification code is 483920. Verify at https://example.com/verify?t=abc",
      }),
    );
    expect(result).toMatchObject({ accepted: true, reason: "stored" });

    const listResponse = await SELF.fetch(`${ORIGIN}/api/v1/mailboxes/me/messages`, {
      headers: { "x-api-key": mailbox.apiKey },
    });
    expect(listResponse.status).toBe(200);
    const list = await readJson<{ data: Array<{ id: string; subject: string; seen: boolean }>; has_more: boolean }>(listResponse);
    expect(list.data).toHaveLength(1);
    expect(list.data[0]!.subject).toBe("Your verification code");
    expect(list.has_more).toBe(false);

    const detailResponse = await SELF.fetch(`${ORIGIN}/api/v1/messages/${list.data[0]!.id}`, {
      headers: { "x-api-key": mailbox.apiKey },
    });
    const detail = await readJson<MessageDetail>(detailResponse);
    expect(detail.extracted.otp).toContain("483920");
    expect(detail.extracted.links).toContain("https://example.com/verify?t=abc");
    expect(detail.extracted.intent).toBe("verification");
    expect(detail.extracted.primaryLink).toBe("https://example.com/verify?t=abc");
    expect(detail.authentication.spf).toBe("pass");
  });

  it("prefers the OTP-Token header and converts html to text", async () => {
    const mailbox = await createMailbox({ domain: "mail.test", local: "html" });
    const html = '<html><body><p>Welcome aboard.</p><p>Reference ZX-9</p></body></html>';

    await ingestEmail(
      env,
      { from: "noreply@example.com", to: mailbox.address },
      buildEmail({ to: mailbox.address, subject: "Welcome", html, otpToken: "112233" }),
    );

    const detail = await readJson<MessageDetail>(
      await SELF.fetch(`${ORIGIN}/api/v1/messages/${(await firstMessageId(mailbox.apiKey))}`, {
        headers: { "x-api-key": mailbox.apiKey },
      }),
    );
    expect(detail.extracted.otp[0]).toBe("112233");
    expect(detail.html).toContain("Welcome aboard");
    expect(detail.text).toContain("Welcome aboard.");
  });

  it("lets the access link read, delete and mark messages", async () => {
    const mailbox = await createMailbox({ domain: "mail.test", local: "link" });
    await ingestEmail(
      env,
      { from: "noreply@example.com", to: mailbox.address },
      buildEmail({ to: mailbox.address, subject: "Hello link" }),
    );
    const id = await firstMessageId(mailbox.apiKey);

    const listResponse = await SELF.fetch(`${ORIGIN}/api/v1/mailboxes/me/messages`, {
      headers: { "x-access-token": mailbox.accessToken },
    });
    expect(listResponse.status).toBe(200);

    const seen = await SELF.fetch(`${ORIGIN}/api/v1/messages/${id}/seen`, {
      method: "POST",
      headers: { "x-access-token": mailbox.accessToken },
    });
    expect(seen.status).toBe(200);
    expect((await readJson<{ seen: boolean }>(seen)).seen).toBe(true);

    const deleted = await SELF.fetch(`${ORIGIN}/api/v1/messages/${id}`, {
      method: "DELETE",
      headers: { "x-access-token": mailbox.accessToken },
    });
    expect(deleted.status).toBe(200);

    const remaining = await readJson<{ data: unknown[] }>(
      await SELF.fetch(`${ORIGIN}/api/v1/mailboxes/me/messages`, { headers: { "x-access-token": mailbox.accessToken } }),
    );
    expect(remaining.data).toHaveLength(0);
  });

  it("does not let an access link delete the mailbox itself", async () => {
    const mailbox = await createMailbox({ domain: "mail.test", local: "scoped" });
    const response = await SELF.fetch(`${ORIGIN}/api/v1/mailboxes/me`, {
      method: "DELETE",
      headers: { "x-access-token": mailbox.accessToken },
    });
    expect(response.status).toBe(403);
    expect((await readJson<{ error: { code: string } }>(response)).error.code).toBe("insufficient_scope");
  });

  it("serves raw MIME and attachments", async () => {
    const mailbox = await createMailbox({ domain: "mail.test", local: "files" });
    const base64 = Buffer.from("hello-attachment").toString("base64");

    await ingestEmail(
      env,
      { from: "noreply@example.com", to: mailbox.address },
      buildEmail({
        to: mailbox.address,
        subject: "With file",
        text: "See attached.",
        attachment: { filename: "note.txt", mime: "text/plain", base64 },
      }),
    );

    const id = await firstMessageId(mailbox.apiKey);
    const detail = await readJson<MessageDetail>(
      await SELF.fetch(`${ORIGIN}/api/v1/messages/${id}`, { headers: { "x-api-key": mailbox.apiKey } }),
    );
    expect(detail.attachments).toHaveLength(1);
    expect(detail.attachments[0]!.filename).toBe("note.txt");

    const attachmentResponse = await SELF.fetch(`${ORIGIN}${detail.attachments[0]!.url}`, {
      headers: { "x-access-token": mailbox.accessToken },
    });
    expect(attachmentResponse.status).toBe(200);
    expect(await attachmentResponse.text()).toBe("hello-attachment");

    const rawResponse = await SELF.fetch(`${ORIGIN}/api/v1/messages/${id}/raw`, {
      headers: { "x-api-key": mailbox.apiKey },
    });
    expect(rawResponse.headers.get("content-type")).toBe("message/rfc822");
    expect(new TextDecoder().decode(await rawResponse.arrayBuffer())).toContain("Subject: With file");
  });

  it("rejects bad credentials, unknown recipients and expired mailboxes", async () => {
    const mailbox = await createMailbox({ domain: "mail.test", local: "guard" });

    const unauthorized = await SELF.fetch(`${ORIGIN}/api/v1/mailboxes/me/messages`, {
      headers: { "x-api-key": "am_live_wrong" },
    });
    expect(unauthorized.status).toBe(401);

    const unknown = await ingestEmail(
      env,
      { from: "noreply@example.com", to: "ghost@mail.test" },
      buildEmail({ to: "ghost@mail.test" }),
    );
    expect(unknown.reason).toBe("unknown_mailbox");

    const wrongDomain = await ingestEmail(
      env,
      { from: "noreply@example.com", to: "ghost@other.test" },
      buildEmail({ to: "ghost@other.test" }),
    );
    expect(wrongDomain.reason).toBe("domain_not_routed");

    await env.DB.prepare("UPDATE mailboxes SET expires_at = ?1 WHERE id = ?2").bind(Date.now() - 1000, mailbox.id).run();

    const expiredRead = await SELF.fetch(`${ORIGIN}/api/v1/mailboxes/me/messages`, {
      headers: { "x-api-key": mailbox.apiKey },
    });
    expect(expiredRead.status).toBe(410);
    expect((await readJson<{ error: { code: string } }>(expiredRead)).error.code).toBe("mailbox_expired");

    const expiredIngest = await ingestEmail(
      env,
      { from: "noreply@example.com", to: mailbox.address },
      buildEmail({ to: mailbox.address }),
    );
    expect(expiredIngest.reason).toBe("mailbox_expired");
  });
});

describe("delivery mechanics", () => {
  it("long-polls until a message arrives", async () => {
    const mailbox = await createMailbox({ domain: "mail.test", local: "waiter" });
    const started = Date.now();

    const pending = SELF.fetch(`${ORIGIN}/api/v1/mailboxes/me/messages?wait=5`, {
      headers: { "x-api-key": mailbox.apiKey },
    });
    // Real timer on purpose: the long-poll sleeps inside the Worker isolate, so
    // fake timers in the test cannot advance it.
    await new Promise((resolve) => setTimeout(resolve, 600));
    await ingestEmail(
      env,
      { from: "noreply@example.com", to: mailbox.address },
      buildEmail({ to: mailbox.address, subject: "Late arrival" }),
    );

    const payload = await readJson<{ data: Array<{ subject: string }> }>(await pending);
    expect(payload.data.map((row) => row.subject)).toEqual(["Late arrival"]);
    expect(Date.now() - started).toBeLessThan(5000);
  });

  it("rate limits anonymous mailbox creation per IP", async () => {
    const windowStart = Date.now() - (Date.now() % 3_600_000);
    await env.DB.prepare("INSERT INTO rate_limits (key, window_start, count) VALUES (?1, ?2, 1000)")
      .bind("create:local", windowStart)
      .run();

    const response = await SELF.fetch(`${ORIGIN}/api/v1/mailboxes`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ domain: "mail.test" }),
    });
    expect(response.status).toBe(429);
    expect((await readJson<{ error: { code: string } }>(response)).error.code).toBe("rate_limited");
  });

  it("throttles repeated bad credentials per IP", async () => {
    const windowStart = Date.now() - (Date.now() % 60_000);
    await env.DB.prepare("INSERT INTO rate_limits (key, window_start, count) VALUES (?1, ?2, 61)")
      .bind("auth:local", windowStart)
      .run();

    const response = await SELF.fetch(`${ORIGIN}/api/v1/mailboxes/me/messages`, {
      headers: { "x-access-token": "wrongslug" },
    });
    expect(response.status).toBe(429);
    expect((await readJson<{ error: { code: string } }>(response)).error.code).toBe("too_many_attempts");
  });

  it("purges expired mailboxes and their blobs on cron", async () => {
    const mailbox = await createMailbox({ domain: "mail.test", local: "purgeable" });
    await ingestEmail(
      env,
      { from: "noreply@example.com", to: mailbox.address },
      buildEmail({ to: mailbox.address, subject: "Soon gone" }),
    );

    await env.DB.prepare("UPDATE mailboxes SET expires_at = ?1 WHERE id = ?2")
      .bind(Date.now() - 1000, mailbox.id)
      .run();

    const result = await purgeExpired(env);
    expect(result.mailboxes).toBe(1);

    const remaining = await env.DB.prepare("SELECT COUNT(*) AS total FROM messages WHERE mailbox_id = ?1")
      .bind(mailbox.id)
      .first<{ total: number }>();
    expect(remaining?.total).toBe(0);

    const blobs = await env.MAIL.list({ prefix: `m/${mailbox.id}/` });
    expect(blobs.objects).toHaveLength(0);
  });
});

describe("admin dashboard API", () => {
  async function loginCookie(): Promise<string> {
    const login = await SELF.fetch(`${ORIGIN}/api/v1/admin/session`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ token: "test-admin-token" }),
    });
    expect(login.status).toBe(200);
    return (login.headers.get("set-cookie") ?? "").split(";")[0] ?? "";
  }

  it("opens a session from the admin token", async () => {
    const cookie = await loginCookie();
    expect(cookie).toContain("agentmail_admin=");

    const session = await readJson<{ authenticated: boolean; mode: string }>(
      await SELF.fetch(`${ORIGIN}/api/v1/admin/session`, { headers: { cookie } }),
    );
    expect(session).toEqual({ authenticated: true, mode: "cookie" });
  });

  it("rejects a wrong admin token", async () => {
    const response = await SELF.fetch(`${ORIGIN}/api/v1/admin/session`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ token: "not-the-token" }),
    });
    expect(response.status).toBe(401);
  });

  it("requires a CSRF header for cookie-authenticated mutations", async () => {
    const cookie = await loginCookie();
    const body = JSON.stringify({ domain: "mail.test", local: "viacookie" });

    const blocked = await SELF.fetch(`${ORIGIN}/api/v1/mailboxes`, {
      method: "POST",
      headers: { "content-type": "application/json", cookie },
      body,
    });
    expect(blocked.status).toBe(403);
    expect((await readJson<{ error: { code: string } }>(blocked)).error.code).toBe("csrf_failed");

    const created = await SELF.fetch(`${ORIGIN}/api/v1/mailboxes`, {
      method: "POST",
      headers: { "content-type": "application/json", cookie, "x-agentmail-csrf": "1" },
      body,
    });
    expect(created.status).toBe(201);
  });

  it("lists and deletes mailboxes using the admin token", async () => {
    const mailbox = await createMailbox({ domain: "mail.test", local: "listed" });
    await ingestEmail(
      env,
      { from: "noreply@example.com", to: mailbox.address },
      buildEmail({ to: mailbox.address, subject: "Listed message" }),
    );

    const list = await SELF.fetch(`${ORIGIN}/api/v1/admin/mailboxes?q=listed`, { headers: ADMIN_HEADERS });
    const payload = await readJson<{ data: Array<{ id: string; messageCount: number; address: string }> }>(list);
    expect(payload.data).toHaveLength(1);
    expect(payload.data[0]).toMatchObject({ address: "listed@mail.test", messageCount: 1 });

    const removed = await SELF.fetch(`${ORIGIN}/api/v1/admin/mailboxes/${mailbox.id}`, {
      method: "DELETE",
      headers: ADMIN_HEADERS,
    });
    expect(removed.status).toBe(200);

    const after = await SELF.fetch(`${ORIGIN}/api/v1/admin/mailboxes?q=listed`, { headers: ADMIN_HEADERS });
    expect((await readJson<{ data: unknown[] }>(after)).data).toHaveLength(0);
  });

  it("extends TTL, renames, and rotates a mailbox from the dashboard API", async () => {
    const mailbox = await createMailbox({ domain: "mail.test", local: "managed" });

    const patched = await SELF.fetch(`${ORIGIN}/api/v1/admin/mailboxes/${mailbox.id}`, {
      method: "PATCH",
      headers: ADMIN_HEADERS,
      body: JSON.stringify({ ttl: 3600, label: "ops" }),
    });
    expect(patched.status).toBe(200);
    const patchedBody = await readJson<{ expiresAt: string | null; label: string | null }>(patched);
    expect(patchedBody.expiresAt).not.toBeNull();
    expect(patchedBody.label).toBe("ops");

    const cleared = await SELF.fetch(`${ORIGIN}/api/v1/admin/mailboxes/${mailbox.id}`, {
      method: "PATCH",
      headers: ADMIN_HEADERS,
      body: JSON.stringify({ ttl: null }),
    });
    expect((await readJson<{ expiresAt: string | null }>(cleared)).expiresAt).toBeNull();

    const rotated = await SELF.fetch(`${ORIGIN}/api/v1/admin/mailboxes/${mailbox.id}/rotate-token`, {
      method: "POST",
      headers: ADMIN_HEADERS,
    });
    const rotatedBody = await readJson<{ accessToken: string; accessUrl: string }>(rotated);
    expect(rotatedBody.accessToken).not.toBe(mailbox.accessToken);
    expect(rotatedBody.accessUrl.endsWith(`/m/${rotatedBody.accessToken}`)).toBe(true);

    const oldLink = await SELF.fetch(`${ORIGIN}/api/v1/mailboxes/me/messages`, {
      headers: { "x-access-token": mailbox.accessToken },
    });
    expect(oldLink.status).toBe(401);

    const newLink = await SELF.fetch(`${ORIGIN}/api/v1/mailboxes/me/messages`, {
      headers: { "x-access-token": rotatedBody.accessToken },
    });
    expect(newLink.status).toBe(200);
  });

  it("revokes an API key and pauses a mailbox", async () => {
    const mailbox = await createMailbox({ domain: "mail.test", local: "revocable" });

    const rotated = await SELF.fetch(`${ORIGIN}/api/v1/admin/mailboxes/${mailbox.id}/rotate-key`, {
      method: "POST",
      headers: ADMIN_HEADERS,
    });
    expect(rotated.status).toBe(200);
    const rotatedBody = await readJson<{ apiKey: string; apiKeyPrefix: string }>(rotated);
    expect(rotatedBody.apiKey).not.toBe(mailbox.apiKey);

    const stale = await SELF.fetch(`${ORIGIN}/api/v1/mailboxes/me/messages`, {
      headers: { "x-api-key": mailbox.apiKey },
    });
    expect(stale.status).toBe(401);

    const fresh = await SELF.fetch(`${ORIGIN}/api/v1/mailboxes/me/messages`, {
      headers: { "x-api-key": rotatedBody.apiKey },
    });
    expect(fresh.status).toBe(200);

    const paused = await SELF.fetch(`${ORIGIN}/api/v1/admin/mailboxes/${mailbox.id}`, {
      method: "PATCH",
      headers: ADMIN_HEADERS,
      body: JSON.stringify({ status: "paused" }),
    });
    expect((await readJson<{ status: string }>(paused)).status).toBe("paused");

    const blockedApi = await SELF.fetch(`${ORIGIN}/api/v1/mailboxes/me/messages`, {
      headers: { "x-api-key": rotatedBody.apiKey },
    });
    expect(blockedApi.status).toBe(403);

    const droppedIngest = await ingestEmail(
      env,
      { from: "noreply@example.com", to: mailbox.address },
      buildEmail({ to: mailbox.address }),
    );
    expect(droppedIngest.reason).toBe("mailbox_inactive");

    const resumed = await SELF.fetch(`${ORIGIN}/api/v1/admin/mailboxes/${mailbox.id}`, {
      method: "PATCH",
      headers: ADMIN_HEADERS,
      body: JSON.stringify({ status: "active" }),
    });
    expect((await readJson<{ status: string }>(resumed)).status).toBe("active");

    const restored = await SELF.fetch(`${ORIGIN}/api/v1/mailboxes/me/messages`, {
      headers: { "x-api-key": rotatedBody.apiKey },
    });
    expect(restored.status).toBe(200);
  });

  it("reparses a stored message with the current parser", async () => {
    const mailbox = await createMailbox({ domain: "mail.test", local: "reparse" });
    await ingestEmail(
      env,
      { from: "no-reply@cloudrift.ai", to: mailbox.address },
      buildEmail({
        to: mailbox.address,
        subject: "Verify your email",
        text: "Please verify your email by clicking the link below:\nhttps://api.example.com/verify?token=ffffec60-5b3f-4111-b1e3-b2c33e9c1650",
      }),
    );
    const id = await firstMessageId(mailbox.apiKey);

    // Simulate a row parsed by the old, buggy version.
    await env.DB.prepare("UPDATE messages SET extracted_json = ?1 WHERE id = ?2")
      .bind(
        JSON.stringify({
          otp: ["4111", "1650"],
          links: [],
          codes: [],
          intent: "other",
          primaryLink: null,
          actionText: null,
          unsubscribe: [],
        }),
        id,
      )
      .run();

    const response = await SELF.fetch(`${ORIGIN}/api/v1/admin/messages/${id}/reparse`, {
      method: "POST",
      headers: ADMIN_HEADERS,
    });
    expect(response.status).toBe(200);

    const body = await readJson<{ extracted: { otp: string[]; intent: string; primaryLink: string | null } }>(response);
    expect(body.extracted.otp).toEqual([]);
    expect(body.extracted.intent).toBe("verification");
    expect(body.extracted.primaryLink).toContain("verify");
  });

  it("reports unread totals in stats", async () => {
    const mailbox = await createMailbox({ domain: "mail.test", local: "counted" });
    for (const subject of ["First", "Second"]) {
      await ingestEmail(
        env,
        { from: "noreply@example.com", to: mailbox.address },
        buildEmail({ to: mailbox.address, subject }),
      );
    }

    const stats = await readJson<{ totals: { mailboxes: number; messages: number; unread: number } }>(
      await SELF.fetch(`${ORIGIN}/api/v1/admin/stats`, { headers: ADMIN_HEADERS }),
    );
    expect(stats.totals).toMatchObject({ mailboxes: 1, messages: 2, unread: 2 });
  });

  it("clears the session cookie on logout", async () => {
    const cookie = await loginCookie();
    const logout = await SELF.fetch(`${ORIGIN}/api/v1/admin/session`, {
      method: "DELETE",
      headers: { cookie, "x-agentmail-csrf": "1" },
    });
    expect(logout.status).toBe(200);
    expect(logout.headers.get("set-cookie") ?? "").toContain("Max-Age=0");
  });
});

describe("domains and admin", () => {
  it("lists only active domains publicly and guards admin routes", async () => {
    await addDomain("second.test", false);

    const publicList = await readJson<{ data: Array<{ domain: string }> }>(
      await SELF.fetch(`${ORIGIN}/api/v1/domains`),
    );
    expect(publicList.data.map((row) => row.domain)).toEqual(["mail.test"]);

    const forbidden = await SELF.fetch(`${ORIGIN}/api/v1/admin/stats`, {
      headers: { authorization: "Bearer nope" },
    });
    expect(forbidden.status).toBe(401);
  });

  it("refuses to delete a domain that still has mailboxes", async () => {
    await createMailbox({ domain: "mail.test", local: "inuse" });

    const response = await SELF.fetch(`${ORIGIN}/api/v1/admin/domains/mail.test`, {
      method: "DELETE",
      headers: ADMIN_HEADERS,
    });
    expect(response.status).toBe(409);
    expect((await readJson<{ error: { code: string } }>(response)).error.code).toBe("domain_in_use");
  });

  it("rotates the access link and invalidates the old one", async () => {
    const mailbox = await createMailbox({ domain: "mail.test", local: "rotate" });

    const rotated = await SELF.fetch(`${ORIGIN}/api/v1/mailboxes/me/rotate-token`, {
      method: "POST",
      headers: { "x-api-key": mailbox.apiKey },
    });
    const body = await readJson<{ accessToken: string }>(rotated);
    expect(body.accessToken).not.toBe(mailbox.accessToken);

    const oldLink = await SELF.fetch(`${ORIGIN}/api/v1/mailboxes/me/messages`, {
      headers: { "x-access-token": mailbox.accessToken },
    });
    expect(oldLink.status).toBe(401);
  });
});

async function firstMessageId(key: string): Promise<string> {
  const list = await readJson<{ data: Array<{ id: string }> }>(
    await SELF.fetch(`${ORIGIN}/api/v1/mailboxes/me/messages`, { headers: { "x-api-key": key } }),
  );
  const id = list.data[0]?.id;
  if (!id) throw new Error("expected at least one message");
  return id;
}
