export interface EmailFixtureOptions {
  from?: string;
  to: string;
  subject?: string;
  text?: string;
  html?: string;
  otpToken?: string;
  attachment?: { filename: string; mime: string; base64: string };
}

/** Builds a small RFC 5322 message so ingestion tests exercise real MIME parsing. */
export function buildEmail(options: EmailFixtureOptions): ArrayBuffer {
  const boundary = "agentmail-test-boundary";
  const lines: string[] = [
    `From: ${options.from ?? "Sender Name <sender@example.com>"}`,
    `To: ${options.to}`,
    `Subject: ${options.subject ?? "Test message"}`,
    `Message-ID: <${crypto.randomUUID()}@example.com>`,
    `Date: ${new Date().toUTCString()}`,
    "MIME-Version: 1.0",
    "Authentication-Results: mx.cloudflare.net; spf=pass smtp.mailfrom=example.com; dkim=pass header.d=example.com; dmarc=pass",
  ];

  if (options.otpToken) lines.push(`OTP-Token: "${options.otpToken}"; origin="https://example.com"`);

  if (options.attachment) {
    lines.push(`Content-Type: multipart/mixed; boundary="${boundary}"`, "", `--${boundary}`);
  }

  if (options.html) {
    lines.push('Content-Type: text/html; charset="utf-8"', "", options.html);
  } else {
    lines.push('Content-Type: text/plain; charset="utf-8"', "", options.text ?? "Hello from the test suite.");
  }

  if (options.attachment) {
    lines.push(
      "",
      `--${boundary}`,
      `Content-Type: ${options.attachment.mime}`,
      'Content-Transfer-Encoding: base64',
      `Content-Disposition: attachment; filename="${options.attachment.filename}"`,
      "",
      options.attachment.base64,
      `--${boundary}--`,
    );
  }

  return new TextEncoder().encode(lines.join("\r\n")).buffer as ArrayBuffer;
}
