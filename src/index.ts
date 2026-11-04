import {
  adminStats,
  createAdminDomain,
  deleteAdminDomain,
  deleteAdminMailbox,
  getAdminSession,
  listAdminDomains,
  listAdminMailboxes,
  loginAdminSession,
  logoutAdminSession,
  patchAdminDomain,
  patchAdminMailbox,
  reparseAdminMessage,
  rotateAdminMailboxToken,
  rotateAdminMailboxKey,
} from "./api/admin";
import {
  createMailbox,
  deleteMailbox,
  getMailbox,
  patchMailbox,
  rotateAccessToken,
} from "./api/mailboxes";
import {
  deleteMessage,
  getAttachment,
  getMessage,
  getRawMessage,
  listMessages,
  markMessageSeen,
} from "./api/messages";
import { health, listPublicDomains } from "./api/public";
import { ApiError, baseOrigin, errorResponse, preflight } from "./lib/http";
import { purgeExpired, handleInbound } from "./retention";
import { matchRoute, route, type Route } from "./router";
import type { Env } from "./types";

const ROUTES: Route[] = [
  route("GET", "/api/v1/health", health),
  route("GET", "/api/v1/domains", listPublicDomains),

  route("POST", "/api/v1/mailboxes", createMailbox),
  route("GET", "/api/v1/mailboxes/:id", getMailbox),
  route("PATCH", "/api/v1/mailboxes/:id", patchMailbox),
  route("DELETE", "/api/v1/mailboxes/:id", deleteMailbox),
  route("POST", "/api/v1/mailboxes/:id/rotate-token", rotateAccessToken),
  route("GET", "/api/v1/mailboxes/:id/messages", listMessages),

  route("GET", "/api/v1/messages/:id", getMessage),
  route("DELETE", "/api/v1/messages/:id", deleteMessage),
  route("POST", "/api/v1/messages/:id/seen", markMessageSeen),
  route("GET", "/api/v1/messages/:id/raw", getRawMessage),
  route("GET", "/api/v1/messages/:id/attachments/:attachmentId", getAttachment),

  route("GET", "/api/v1/admin/session", getAdminSession),
  route("POST", "/api/v1/admin/session", loginAdminSession),
  route("DELETE", "/api/v1/admin/session", logoutAdminSession),
  route("GET", "/api/v1/admin/mailboxes", listAdminMailboxes),
  route("PATCH", "/api/v1/admin/mailboxes/:id", patchAdminMailbox),
  route("DELETE", "/api/v1/admin/mailboxes/:id", deleteAdminMailbox),
  route("POST", "/api/v1/admin/mailboxes/:id/rotate-token", rotateAdminMailboxToken),
  route("POST", "/api/v1/admin/mailboxes/:id/rotate-key", rotateAdminMailboxKey),
  route("POST", "/api/v1/admin/messages/:id/reparse", reparseAdminMessage),
  route("GET", "/api/v1/admin/domains", listAdminDomains),
  route("POST", "/api/v1/admin/domains", createAdminDomain),
  route("PATCH", "/api/v1/admin/domains/:domain", patchAdminDomain),
  route("DELETE", "/api/v1/admin/domains/:domain", deleteAdminDomain),
  route("GET", "/api/v1/admin/stats", adminStats),
];

export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const options = preflight(request);
    if (options) return options;

    const requestId = crypto.randomUUID();
    const url = new URL(request.url);

    // Everything outside /api is served by the static assets binding.
    if (!url.pathname.startsWith("/api/")) {
      return new Response("Not found", { status: 404 });
    }

    try {
      const match = matchRoute(ROUTES, request.method, url.pathname);
      return await match.handler({
        request,
        env,
        ctx,
        url,
        params: match.params,
        requestId,
        origin: baseOrigin(request, env.PUBLIC_BASE_URL),
      });
    } catch (error) {
      if (!(error instanceof ApiError) || error.status >= 500) {
        console.error(`[api] ${requestId} ${request.method} ${url.pathname}`, error);
      }
      return errorResponse(error, requestId);
    }
  },

  async email(message: ForwardableEmailMessage, env: Env, _ctx: ExecutionContext): Promise<void> {
    await handleInbound(env, message);
  },

  async scheduled(_controller: ScheduledController, env: Env, ctx: ExecutionContext): Promise<void> {
    ctx.waitUntil(
      purgeExpired(env).then((result) => {
        console.log(`[cron] purge complete: ${result.mailboxes} mailbox(es)`);
      }),
    );
  },
} satisfies ExportedHandler<Env>;
