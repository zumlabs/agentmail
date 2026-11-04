import type { IngestResult } from "./ingest";
import { ingestEmail } from "./ingest";
import type { Env } from "./types";

/** Cron-driven cleanup: expired mailboxes + their R2 objects, old counters. */
export async function purgeExpired(env: Env): Promise<{ mailboxes: number }> {
  const now = Date.now();
  const expired = await env.DB.prepare(
    "SELECT id FROM mailboxes WHERE expires_at IS NOT NULL AND expires_at <= ?1 LIMIT 50",
  )
    .bind(now)
    .all<{ id: string }>();

  for (const mailbox of expired.results) {
    await deletePrefix(env, `m/${mailbox.id}/`);
    await env.DB.prepare("DELETE FROM mailboxes WHERE id = ?1").bind(mailbox.id).run();
  }

  await env.DB.prepare("DELETE FROM rate_limits WHERE window_start < ?1").bind(now - 2 * 3_600_000).run();

  return { mailboxes: expired.results.length };
}

export async function deletePrefix(env: Env, prefix: string): Promise<number> {
  let deleted = 0;
  let cursor: string | undefined;

  do {
    const listed = await env.MAIL.list({ prefix, cursor, limit: 500 });
    if (listed.objects.length > 0) {
      await env.MAIL.delete(listed.objects.map((object) => object.key));
      deleted += listed.objects.length;
    }
    cursor = listed.truncated ? listed.cursor : undefined;
  } while (cursor);

  return deleted;
}

export function describeIngest(result: IngestResult): string {
  return result.accepted
    ? `stored ${result.messageId} in ${result.mailboxId}`
    : `dropped: ${result.reason}`;
}

/** Adapter for the Worker `email()` handler. Never rejects on unroutable mail. */
export async function handleInbound(env: Env, message: ForwardableEmailMessage): Promise<void> {
  const raw = await new Response(message.raw).arrayBuffer();
  const result = await ingestEmail(env, { from: message.from, to: message.to }, raw);
  console.log(`[email] ${message.to} <- ${message.from}: ${describeIngest(result)}`);
}
