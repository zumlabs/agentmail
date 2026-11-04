export type Intent = "verification" | "password_reset" | "receipt" | "newsletter" | "notification" | "other";

export interface Extracted {
  /** Verification / one-time codes, digits kept verbatim. */
  otp: string[];
  /** Every HTTP(S) link found in the text or html part. */
  links: string[];
  /** Alphanumeric codes near words like "code", "coupon", "promo". */
  codes: string[];
  /** Best guess at what the message wants the reader to do. */
  intent: Intent;
  /** The link that matches the intent, e.g. the "Verify email" button target. */
  primaryLink: string | null;
  /** Visible anchor text of the primary link, when it came from HTML. */
  actionText: string | null;
  /** Opt-out links, kept separate so automation never follows them. */
  unsubscribe: string[];
}

const OTP_KEYWORDS =
  /(otp|one[\s-]?time|verification|verify|passcode|security\s+code|kode|verifikasi|pin|token|login\s+code|auth(?:entication)?\s+code)/i;

const CODE_KEYWORDS = /(code|kode|coupon|promo|voucher|referral|invite|activation|license|key)/i;

const URL_IN_TEXT = /https?:\/\/[^\s<>"'`()[\]]+/gi;
const HREF_IN_HTML = /href\s*=\s*["']([^"']+)["']/gi;
const ANCHOR_IN_HTML = /<a\b[^>]*href\s*=\s*["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi;

const UNSUBSCRIBE_URL = /(unsubscribe|opt[-_]?out|preferences|manage[-_]?subscription)/i;
const UNSUBSCRIBE_TEXT = /(unsubscribe|opt\s*out|manage preferences|email preferences|berhenti langganan)/i;

const ACTION_URL = /(verify|confirm|activate|reset|magic|token|invite|accept|signin|sign-in)/i;
const ACTION_TEXT = /(verify|confirm|activate|reset|continue|sign in|log in|open|review|accept|set up|verifikasi|konfirmasi|aktifkan|masuk)/i;

const MAX_OTP = 5;
const MAX_LINKS = 25;
const MAX_CODES = 5;

function withinKeywordWindow(text: string, index: number, radius = 90): boolean {
  return OTP_KEYWORDS.test(text.slice(Math.max(0, index - radius), index + radius));
}

const UUID_PATTERN = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi;

/** URLs and UUIDs contain digit runs that are not OTPs. */
function sanitizeForOtp(text: string): string {
  return text.replace(URL_IN_TEXT, " ").replace(UUID_PATTERN, " ");
}

function numericCandidates(text: string): Array<{ value: string; index: number }> {
  const found: Array<{ value: string; index: number }> = [];

  // "123 456" / "123-456"
  for (const match of text.matchAll(/(?<![0-9A-Za-z])(\d{3})[-\s](\d{3})(?![0-9A-Za-z])/g)) {
    found.push({ value: `${match[1]}${match[2]}`, index: match.index ?? 0 });
  }
  // Plain 4-8 digit runs that are not embedded in a longer token.
  for (const match of text.matchAll(/(?<![0-9A-Za-z])(\d{4,8})(?![0-9A-Za-z])/g)) {
    found.push({ value: match[1]!, index: match.index ?? 0 });
  }

  return found;
}

export function extractOtp(text: string, subject = ""): string[] {
  const results: Array<{ value: string; index: number }> = [];
  const ranked = new Set<string>();
  const bodyText = sanitizeForOtp(text);
  const subjectText = sanitizeForOtp(subject);

  // A code in the subject is almost always the code the mail is about.
  for (const candidate of numericCandidates(subjectText)) {
    if (!OTP_KEYWORDS.test(subjectText) || ranked.has(candidate.value)) continue;
    ranked.add(candidate.value);
    results.push(candidate);
  }

  for (const candidate of numericCandidates(bodyText)) {
    if (!withinKeywordWindow(bodyText, candidate.index)) continue;
    if (ranked.has(candidate.value)) continue;
    ranked.add(candidate.value);
    results.push(candidate);
  }

  // Subject says "code" but the body only carries a bare number: take the first one.
  if (results.length === 0 && OTP_KEYWORDS.test(subjectText)) {
    const candidate = numericCandidates(bodyText)[0];
    if (candidate) results.push(candidate);
  }

  // Alphanumeric OTP (e.g. "OTP: A1B2C3") when no plain digits were found nearby.
  if (results.length === 0) {
    for (const match of bodyText.matchAll(/(?:^|\s)([A-Z0-9]{5,8})(?=\s|[.,)]|$)/g)) {
      const value = match[1]!;
      if (!/\d/.test(value) || !/[A-Z]/.test(value)) continue;
      if (!withinKeywordWindow(bodyText, match.index ?? 0)) continue;
      if (ranked.has(value)) continue;
      ranked.add(value);
      results.push({ value, index: match.index ?? 0 });
    }
  }

  return results
    .sort((a, b) => a.index - b.index)
    .map((candidate) => candidate.value)
    .slice(0, MAX_OTP);
}

interface LinkEntry {
  url: string;
  text: string | null;
}

function cleanAnchorText(html: string): string {
  return html
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 80);
}

function normalizeUrl(raw: string): string | null {
  const candidate = raw
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .trim()
    .replace(/[.,;:!?]+$/, "");
  if (!/^https?:\/\//i.test(candidate)) return null;
  try {
    return new URL(candidate).toString();
  } catch {
    return null;
  }
}

/** Ordered, de-duplicated links with their anchor text where available. */
function collectLinks(text: string, html: string | null): LinkEntry[] {
  const entries: LinkEntry[] = [];
  const seen = new Set<string>();

  const push = (raw: string, label: string | null) => {
    const url = normalizeUrl(raw);
    if (!url) return;
    if (seen.has(url)) {
      const existing = entries.find((entry) => entry.url === url);
      if (existing && existing.text === null && label) existing.text = label;
      return;
    }
    seen.add(url);
    entries.push({ url, text: label && label !== "" ? label : null });
  };

  if (html) {
    for (const match of html.matchAll(ANCHOR_IN_HTML)) {
      push(match[1] ?? "", cleanAnchorText(match[2] ?? ""));
    }
    // Anchors without a closing tag still carry a usable href.
    for (const match of html.matchAll(HREF_IN_HTML)) {
      push(match[1] ?? "", null);
    }
  }

  for (const match of text.matchAll(URL_IN_TEXT)) push(match[0], null);

  return entries;
}

export function extractLinks(text: string, html: string | null): string[] {
  return collectLinks(text, html)
    .map((entry) => entry.url)
    .slice(0, MAX_LINKS);
}

export function extractCodes(text: string, subject = ""): string[] {
  const seen = new Set<string>();
  const sources = [subject, text];

  for (const source of sources) {
    for (const match of source.matchAll(/(?:^|[^A-Za-z0-9])([A-Z0-9][A-Z0-9-]{3,14})(?![A-Za-z0-9])/g)) {
      const value = match[1]!;
      if (!/\d/.test(value) || !/[A-Z]/.test(value)) continue;
      if (!CODE_KEYWORDS.test(source.slice(Math.max(0, (match.index ?? 0) - 60), (match.index ?? 0) + 60))) {
        continue;
      }
      seen.add(value.replace(/-$/, ""));
    }
  }

  return [...seen].slice(0, MAX_CODES);
}

export function detectIntent(subject: string, text: string): Intent {
  const head = subject.toLowerCase();
  const body = text.toLowerCase();

  if (/(reset|forgot|change).{0,20}(password|passcode|sandi)/.test(head) || /(password|sandi).{0,20}(reset|forgot)/.test(head)) {
    return "password_reset";
  }
  if (/(verif|confirm|activate|otp|one[-\s]?time|security code|kode|verifikasi)/.test(head)) return "verification";
  if (/(receipt|invoice|payment|order|faktur|pembayaran|tagihan)/.test(head)) return "receipt";
  if (/(newsletter|digest|weekly|monthly|issue\s*#|roundup)/.test(head)) return "newsletter";
  if (
    /(alert|notification|security|new login|signed in|aktivitas|unread messages|new message|mentioned you|invited you|commented|reply)/.test(
      head,
    )
  ) {
    return "notification";
  }

  // Body fallback, but only when the message actually asks for an action.
  if (/(reset your password|set a new password|atur ulang kata sandi)/.test(body)) return "password_reset";
  if (/(verify your (email|account)|confirm your (email|account)|click .{0,30}verify)/.test(body)) return "verification";
  if (/(your receipt|invoice|payment received|order confirmation)/.test(body)) return "receipt";
  if (/(unsubscribe|view in browser|newsletter)/.test(body)) return "newsletter";

  return "other";
}

function scoreLink(entry: LinkEntry): number {
  let score = 0;
  if (ACTION_URL.test(entry.url)) score += 3;
  if (entry.text && ACTION_TEXT.test(entry.text)) score += 2;
  if (entry.text && ACTION_URL.test(entry.text)) score += 1;
  return score;
}

function isUnsubscribe(entry: LinkEntry): boolean {
  return UNSUBSCRIBE_URL.test(entry.url) || (entry.text !== null && UNSUBSCRIBE_TEXT.test(entry.text));
}

function pickPrimary(entries: LinkEntry[], intent: Intent): { url: string | null; text: string | null } {
  const candidates = entries.filter((entry) => !isUnsubscribe(entry));
  if (candidates.length === 0) return { url: null, text: null };

  if (intent === "verification" || intent === "password_reset") {
    let best: LinkEntry | null = null;
    let bestScore = 0;
    for (const entry of candidates) {
      const score = scoreLink(entry);
      if (score > bestScore) {
        best = entry;
        bestScore = score;
      }
    }
    if (best) return { url: best.url, text: best.text };
    return { url: candidates[0]!.url, text: candidates[0]!.text };
  }

  if (intent === "receipt") {
    const invoice = candidates.find((entry) => /(invoice|receipt|billing|order)/i.test(entry.url) || /(view|download|invoice|receipt)/i.test(entry.text ?? ""));
    if (invoice) return { url: invoice.url, text: invoice.text };
  }

  return { url: null, text: null };
}

export function extractAll(text: string, html: string | null, subject: string): Extracted {
  const entries = collectLinks(text, html);
  const intent = detectIntent(subject, text);
  const primary = pickPrimary(entries, intent);

  return {
    otp: extractOtp(text, subject),
    links: entries.map((entry) => entry.url).slice(0, MAX_LINKS),
    codes: extractCodes(text, subject),
    intent,
    primaryLink: primary.url,
    actionText: primary.text,
    unsubscribe: entries.filter(isUnsubscribe).map((entry) => entry.url).slice(0, 5),
  };
}
