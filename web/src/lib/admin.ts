import { ApiError, parseJsonResponse, type CreatedMailboxDto, type MailboxDto } from "./api";

export interface AdminDomain {
  domain: string;
  label: string | null;
  active: boolean;
  createdAt: string;
  mailboxes: number | null;
}

export interface AdminMailbox extends MailboxDto {
  apiKeyPrefix: string;
}

export interface AdminStats {
  totals: {
    mailboxes: number;
    expired: number;
    messages: number;
    unread: number;
    recentMessages: number;
    attachments: number;
    storedBytes: number;
  };
  domains: Array<{ domain: string; mailboxes: number; messages: number }>;
}

export interface SessionInfo {
  authenticated: boolean;
  mode: "token" | "cookie";
}

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  const method = (init.method ?? "GET").toUpperCase();
  const headers: Record<string, string> = { "content-type": "application/json" };
  if (method !== "GET") headers["x-agentmail-csrf"] = "1";

  const response = await fetch(path, {
    ...init,
    credentials: "same-origin",
    headers: { ...headers, ...(init.headers as Record<string, string> | undefined) },
  });
  return parseJsonResponse<T>(response);
}

export const admin = {
  session: () => request<SessionInfo>("/api/v1/admin/session"),
  login: (token: string) =>
    request<SessionInfo>("/api/v1/admin/session", { method: "POST", body: JSON.stringify({ token }) }),
  logout: () => request<{ authenticated: boolean }>("/api/v1/admin/session", { method: "DELETE" }),

  stats: () => request<AdminStats>("/api/v1/admin/stats"),

  domains: () => request<{ data: AdminDomain[] }>("/api/v1/admin/domains"),
  addDomain: (domain: string) =>
    request<AdminDomain>("/api/v1/admin/domains", { method: "POST", body: JSON.stringify({ domain }) }),
  setDomainActive: (domain: string, active: boolean) =>
    request<AdminDomain>(`/api/v1/admin/domains/${encodeURIComponent(domain)}`, {
      method: "PATCH",
      body: JSON.stringify({ active }),
    }),
  removeDomain: (domain: string) =>
    request<{ deleted: boolean }>(`/api/v1/admin/domains/${encodeURIComponent(domain)}`, { method: "DELETE" }),

  mailboxes: (params: { q?: string; domain?: string; limit?: number } = {}) => {
    const search = new URLSearchParams();
    if (params.q) search.set("q", params.q);
    if (params.domain) search.set("domain", params.domain);
    search.set("limit", String(params.limit ?? 100));
    return request<{ data: AdminMailbox[] }>(`/api/v1/admin/mailboxes?${search.toString()}`);
  },
  createMailbox: (body: { domain?: string; local?: string; label?: string; ttl?: number }) =>
    request<CreatedMailboxDto>("/api/v1/mailboxes", { method: "POST", body: JSON.stringify(body) }),
  updateMailbox: (id: string, body: { label?: string | null; ttl?: number | null; status?: "active" | "paused" }) =>
    request<AdminMailbox>(`/api/v1/admin/mailboxes/${encodeURIComponent(id)}`, {
      method: "PATCH",
      body: JSON.stringify(body),
    }),
  rotateMailboxKey: (id: string) =>
    request<{ id: string; apiKey: string; apiKeyPrefix: string }>(
      `/api/v1/admin/mailboxes/${encodeURIComponent(id)}/rotate-key`,
      { method: "POST" },
    ),
  rotateMailboxToken: (id: string) =>
    request<{ id: string; accessToken: string; accessUrl: string }>(
      `/api/v1/admin/mailboxes/${encodeURIComponent(id)}/rotate-token`,
      { method: "POST" },
    ),
  deleteMailbox: (id: string) =>
    request<{ deleted: boolean }>(`/api/v1/admin/mailboxes/${encodeURIComponent(id)}`, { method: "DELETE" }),
};

export function isUnauthorized(error: unknown): boolean {
  return error instanceof ApiError && error.status === 401;
}
