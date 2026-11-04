export interface MailboxDto {
  id: string;
  address: string;
  local: string;
  domain: string;
  label: string | null;
  status: string;
  createdAt: string;
  expiresAt: string | null;
  lastSeenAt: string | null;
  messageCount: number | null;
  unreadCount: number | null;
  lastMessageAt: string | null;
  accessUrl: string;
}

export interface CreatedMailboxDto extends MailboxDto {
  apiKey: string;
  apiKeyPrefix: string;
  accessToken: string;
}

export interface AddressDto {
  name: string | null;
  address: string;
}

export interface MessageSummaryDto {
  object: "message";
  v: 1;
  id: string;
  mailboxId: string;
  from: AddressDto;
  to: AddressDto[];
  subject: string;
  snippet: string;
  receivedAt: string;
  size: number;
  hasAttachments: boolean;
  attachmentCount: number;
  seen: boolean;
  urls: { self: string; raw: string };
}

export interface AttachmentDto {
  id: string;
  filename: string | null;
  mime: string | null;
  size: number;
  inline: boolean;
  url: string;
}

export type MailIntent =
  | "verification"
  | "password_reset"
  | "receipt"
  | "newsletter"
  | "notification"
  | "other";

export interface MessageDetailDto extends MessageSummaryDto {
  cc: AddressDto[];
  text: string | null;
  html: string | null;
  headers: Record<string, string>;
  extracted: {
    otp: string[];
    links: string[];
    codes: string[];
    intent: MailIntent;
    primaryLink: string | null;
    actionText: string | null;
    unsubscribe: string[];
  };
  authentication: { spf: string | null; dkim: string | null; dmarc: string | null };
  attachments: AttachmentDto[];
}

export interface ListDto<T> {
  object: "list";
  data: T[];
  has_more: boolean;
  next_cursor: string | null;
}

export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

export async function parseJsonResponse<T>(response: Response): Promise<T> {
  const isJson = (response.headers.get("content-type") ?? "").includes("application/json");
  if (!response.ok) {
    const payload = isJson ? ((await response.json()) as { error?: { code?: string; message?: string } }) : null;
    throw new ApiError(
      response.status,
      payload?.error?.code ?? "http_error",
      payload?.error?.message ?? `Request failed (${response.status})`,
    );
  }
  return (await response.json()) as T;
}

export class MailboxClient {
  constructor(private readonly auth: { token?: string; apiKey?: string } = {}) {}

  private authHeaders(): Record<string, string> {
    const headers: Record<string, string> = {};
    if (this.auth.token) headers["x-access-token"] = this.auth.token;
    if (this.auth.apiKey) headers["x-api-key"] = this.auth.apiKey;
    return headers;
  }

  private async request<T>(path: string, init: RequestInit = {}): Promise<T> {
    const response = await fetch(path, {
      ...init,
      headers: { ...this.authHeaders(), ...(init.headers as Record<string, string> | undefined) },
    });
    return parseJsonResponse<T>(response);
  }

  mailbox(): Promise<MailboxDto> {
    return this.request<MailboxDto>("/api/v1/mailboxes/me");
  }

  messages(options: { limit?: number; unread?: boolean } = {}): Promise<ListDto<MessageSummaryDto>> {
    const params = new URLSearchParams({ limit: String(options.limit ?? 50) });
    if (options.unread) params.set("unread", "1");
    return this.request<ListDto<MessageSummaryDto>>(`/api/v1/mailboxes/me/messages?${params.toString()}`);
  }

  message(id: string): Promise<MessageDetailDto> {
    return this.request<MessageDetailDto>(`/api/v1/messages/${encodeURIComponent(id)}`);
  }

  markSeen(id: string): Promise<MessageSummaryDto> {
    return this.request<MessageSummaryDto>(`/api/v1/messages/${encodeURIComponent(id)}/seen`, { method: "POST" });
  }

  async deleteMessage(id: string): Promise<void> {
    await this.request<unknown>(`/api/v1/messages/${encodeURIComponent(id)}`, { method: "DELETE" });
  }

  async download(url: string): Promise<{ blob: Blob; filename: string }> {
    const response = await fetch(url, { headers: this.authHeaders() });
    if (!response.ok) {
      const payload = (await response.json().catch(() => null)) as { error?: { message?: string } } | null;
      throw new ApiError(response.status, "download_failed", payload?.error?.message ?? "Download failed");
    }
    const disposition = response.headers.get("content-disposition") ?? "";
    const filename = /filename="([^"]+)"/.exec(disposition)?.[1] ?? "attachment";
    return { blob: await response.blob(), filename };
  }

  async downloadRaw(messageId: string, subject: string): Promise<void> {
    const { blob } = await this.download(`/api/v1/messages/${encodeURIComponent(messageId)}/raw`);
    const name = `${subject.replace(/[^\w.-]+/g, "_").slice(0, 60) || messageId}.eml`;
    saveBlob(blob, name);
  }

  async downloadAttachment(attachment: AttachmentDto): Promise<void> {
    const { blob, filename } = await this.download(attachment.url);
    saveBlob(blob, attachment.filename ?? filename);
  }

  async extend(ttlSeconds: number | null): Promise<MailboxDto> {
    return this.request<MailboxDto>("/api/v1/mailboxes/me", {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ ttl: ttlSeconds }),
    });
  }
}

export function saveBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  document.body.append(anchor);
  anchor.click();
  anchor.remove();
  setTimeout(() => URL.revokeObjectURL(url), 4000);
}
