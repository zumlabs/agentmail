import { prefixed, randomSecret, URL_ALPHABET } from "./ids";

const encoder = new TextEncoder();

export function toHex(bytes: Uint8Array): string {
  let out = "";
  for (const byte of bytes) out += byte.toString(16).padStart(2, "0");
  return out;
}

export async function sha256Hex(input: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", encoder.encode(input));
  return toHex(new Uint8Array(digest));
}

/** Everything that can authenticate is stored as a peppered SHA-256 digest. */
export function hashSecret(secret: string, pepper: string): Promise<string> {
  return sha256Hex(`${pepper}|${secret}`);
}

export function newApiKey(): string {
  return prefixed("am_live_", 32);
}

export const ACCESS_TOKEN_PREFIX = "am_tok_";
/** 7 base62 chars = ~41.7 bits: 3.5e12 possible slugs. */
export const ACCESS_TOKEN_LENGTH = 7;

export function newAccessToken(): string {
  return `${ACCESS_TOKEN_PREFIX}${randomSecret(ACCESS_TOKEN_LENGTH, URL_ALPHABET)}`;
}

/** What goes in the shareable URL: `am_tok_<slug>` -> `<slug>`. */
export function accessTokenSlug(token: string): string {
  return token.startsWith(ACCESS_TOKEN_PREFIX) ? token.slice(ACCESS_TOKEN_PREFIX.length) : token;
}

/** Accepts either the bare slug from `/m/<slug>` or the prefixed token. */
export function normalizeAccessToken(value: string): string {
  const trimmed = value.trim();
  return trimmed.startsWith(ACCESS_TOKEN_PREFIX) ? trimmed : `${ACCESS_TOKEN_PREFIX}${trimmed}`;
}

export function apiKeyPrefix(apiKey: string): string {
  return apiKey.slice(0, 12);
}

export function isApiKey(value: string | null | undefined): boolean {
  return typeof value === "string" && value.startsWith("am_live_");
}

export function isAccessToken(value: string | null | undefined): boolean {
  return typeof value === "string" && value.startsWith("am_tok_");
}

/** Constant-time-ish compare for the admin bearer token. */
export function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i += 1) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}
