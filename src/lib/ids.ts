const CROCKFORD = "0123456789ABCDEFGHJKMNPQRSTVWXYZ";

/** Unbiased base32 alphabet (32 symbols => `byte % 32` is uniform). */
export const SECRET_ALPHABET = "abcdefghijkmnpqrstuvwxyz23456789";

/** Base62: URL-safe and denser than base32 at the same length. */
export const URL_ALPHABET = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";

/**
 * Lexicographically sortable ULID (26 chars: 48-bit ms timestamp + 80-bit
 * randomness). Message/mailbox ids embed time, so `ORDER BY id` is
 * chronological and cursors are just ids.
 */
export function ulid(now: number = Date.now()): string {
  let time = "";
  let rest = now;
  for (let i = 0; i < 10; i += 1) {
    time = CROCKFORD[rest % 32]! + time;
    rest = Math.floor(rest / 32);
  }
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  let random = "";
  for (const byte of bytes) random += CROCKFORD[byte % 32];
  return time + random;
}

/** Uniform over `alphabet` when the alphabet length divides 256 (32 does). */
export function randomString(length: number, alphabet: string = SECRET_ALPHABET): string {
  const bytes = new Uint8Array(length);
  crypto.getRandomValues(bytes);
  let out = "";
  for (const byte of bytes) out += alphabet[byte % alphabet.length];
  return out;
}

/**
 * Rejection-sampled secret for alphabets that do not divide 256 (base62).
 * Bytes above the largest multiple are discarded instead of folded.
 */
export function randomSecret(length: number, alphabet: string = URL_ALPHABET): string {
  const limit = 256 - (256 % alphabet.length);
  let out = "";
  while (out.length < length) {
    const bytes = new Uint8Array(Math.max(8, (length - out.length) * 2));
    crypto.getRandomValues(bytes);
    for (const byte of bytes) {
      if (byte >= limit) continue;
      out += alphabet[byte % alphabet.length];
      if (out.length === length) break;
    }
  }
  return out;
}

export function prefixed(prefix: string, length = 24): string {
  return `${prefix}${randomString(length)}`;
}
