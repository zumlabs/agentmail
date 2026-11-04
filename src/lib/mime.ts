import PostalMime from "postal-mime";
import type { EmailAddress } from "../types";

export interface ParsedAttachment {
  filename: string;
  mime: string;
  size: number;
  content: ArrayBuffer;
  contentId: string | null;
  inline: boolean;
}

export interface ParsedEmail {
  from: EmailAddress;
  to: EmailAddress[];
  cc: EmailAddress[];
  bcc: EmailAddress[];
  subject: string;
  messageId: string | null;
  date: string | null;
  text: string;
  html: string | null;
  headers: Record<string, string>;
  attachments: ParsedAttachment[];
  spf: string | null;
  dkim: string | null;
  dmarc: string | null;
  /** draft-goto-otp-token code, when the sender provided one. */
  otpCode: string | null;
}

interface RawAddress {
  name?: string;
  address?: string;
  group?: RawAddress[];
}

interface RawAttachment {
  filename?: string | null;
  mimeType?: string;
  related?: boolean;
  contentId?: string | null;
  content?: ArrayBuffer | Uint8Array | string;
}

interface RawEmail {
  from?: RawAddress;
  to?: RawAddress[];
  cc?: RawAddress[];
  bcc?: RawAddress[];
  subject?: string;
  date?: string;
  messageId?: string;
  text?: string;
  html?: string;
  headers?: Array<{ key: string; value: string }>;
  attachments?: RawAttachment[];
  otp?: { code?: string };
}

const ENTITIES: Record<string, string> = {
  amp: "&",
  lt: "<",
  gt: ">",
  quot: '"',
  apos: "'",
  nbsp: " ",
  "#39": "'",
};

export function decodeEntities(input: string): string {
  return input
    .replace(/&([a-zA-Z#0-9]+);/g, (match, name: string) => ENTITIES[name] ?? match)
    .replace(/&#x([0-9a-fA-F]+);/g, (_, hex: string) => String.fromCodePoint(Number.parseInt(hex, 16)))
    .replace(/&#(\d+);/g, (_, dec: string) => String.fromCodePoint(Number.parseInt(dec, 10)));
}

export function htmlToText(html: string): string {
  const stripped = html
    .replace(/<(script|style|head)\b[^>]*>[\s\S]*?<\/\1>/gi, " ")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/(p|div|tr|li|h[1-6]|blockquote|table)>/gi, "\n")
    .replace(/<[^>]+>/g, " ");
  return decodeEntities(stripped)
    .replace(/[ \t\f\v]+/g, " ")
    .replace(/ *\n */g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

export function normalizeSnippet(text: string, limit = 200): string {
  return text.replace(/\s+/g, " ").trim().slice(0, limit);
}

function toAddress(input: RawAddress | undefined): EmailAddress {
  if (Array.isArray(input?.group) && input.group.length > 0) return toAddress(input.group[0]);
  const address = (input?.address ?? "").trim();
  const name = (input?.name ?? "").trim();
  return { name: name === "" ? null : name, address };
}

function toAddressList(input: RawAddress[] | undefined): EmailAddress[] {
  if (!Array.isArray(input)) return [];
  return input.map(toAddress).filter((entry) => entry.address !== "");
}

function normalizeHeaders(headers: Array<{ key: string; value: string }> | undefined): Record<string, string> {
  const out: Record<string, string> = {};
  for (const header of headers ?? []) {
    const key = header.key.toLowerCase();
    const value = header.value ?? "";
    out[key] = out[key] === undefined ? value : `${out[key]}, ${value}`;
  }
  return out;
}

function authResult(headers: Record<string, string>, mechanism: "spf" | "dkim" | "dmarc"): string | null {
  const header = headers["authentication-results"];
  if (!header) return null;
  const match = new RegExp(`\\b${mechanism}=(pass|fail|softfail|neutral|none|permerror|temperror)\\b`, "i").exec(header);
  return match?.[1]?.toLowerCase() ?? null;
}

function attachmentContent(input: RawAttachment | undefined): ArrayBuffer | null {
  const content = input?.content;
  if (content instanceof ArrayBuffer) return content;
  if (content instanceof Uint8Array) {
    return content.buffer.slice(content.byteOffset, content.byteOffset + content.byteLength) as ArrayBuffer;
  }
  return null;
}

export async function parseRawEmail(raw: ArrayBuffer): Promise<ParsedEmail> {
  const parsed = (await new PostalMime().parse(raw)) as unknown as RawEmail;
  const headers = normalizeHeaders(parsed.headers);
  const text = (parsed.text ?? "").trim();
  const html = parsed.html ?? null;

  const attachments: ParsedAttachment[] = [];
  for (const input of parsed.attachments ?? []) {
    const content = attachmentContent(input);
    if (!content) continue;
    attachments.push({
      filename: (input.filename ?? "").trim() || `attachment-${attachments.length + 1}`,
      mime: input.mimeType ?? "application/octet-stream",
      size: content.byteLength,
      content,
      contentId: input.contentId ?? null,
      inline: input.related === true,
    });
  }

  const effectiveText = text !== "" ? text : html ? htmlToText(html) : "";

  return {
    from: toAddress(parsed.from),
    to: toAddressList(parsed.to),
    cc: toAddressList(parsed.cc),
    bcc: toAddressList(parsed.bcc),
    subject: parsed.subject?.trim() ?? "",
    messageId: parsed.messageId?.trim() || null,
    date: parsed.date?.trim() || null,
    text: effectiveText,
    html,
    headers,
    attachments,
    spf: authResult(headers, "spf"),
    dkim: authResult(headers, "dkim"),
    dmarc: authResult(headers, "dmarc"),
    otpCode: parsed.otp?.code?.trim() || null,
  };
}
