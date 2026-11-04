import { json } from "../lib/http";
import type { RouteContext } from "../router";

export async function health(context: RouteContext): Promise<Response> {
  return json({
    ok: true,
    service: "agentmail",
    version: 1,
    time: new Date().toISOString(),
    requestId: context.requestId,
  });
}

export async function listPublicDomains(context: RouteContext): Promise<Response> {
  const { results } = await context.env.DB.prepare(
    "SELECT domain, label FROM domains WHERE active = 1 ORDER BY created_at ASC",
  ).all<{ domain: string; label: string | null }>();

  return json({
    object: "list",
    data: results.map((row) => ({ domain: row.domain, label: row.label })),
  });
}
