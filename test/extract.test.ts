import { describe, expect, it } from "vitest";
import { extractAll, extractCodes, extractLinks, extractOtp } from "../src/lib/extract";
import { htmlToText } from "../src/lib/mime";

describe("extractOtp", () => {
  it("finds a code next to a keyword", () => {
    expect(extractOtp("Your verification code is 483920. It expires in 10 minutes.")).toEqual(["483920"]);
  });

  it("joins hyphenated codes", () => {
    expect(extractOtp("Your login code is 123-456 to continue")).toEqual(["123456"]);
  });

  it("uses the subject keyword when the body is a bare code", () => {
    expect(extractOtp("483920", "Your verification code")).toEqual(["483920"]);
  });

  it("ignores numbers with no verification context", () => {
    expect(extractOtp("Order 12345 shipped. Total Rp 250000.")).toEqual([]);
  });

  it("does not read OTP digits out of UUID verification links", () => {
    const text =
      "Please verify your email by clicking the link below:\n" +
      "https://api.example.com/verify?token=ffffec60-5b3f-4111-b1e3-b2c33e9c1650\n" +
      "This link expires in 24 hours.";
    expect(extractOtp(text, "Verify your email")).toEqual([]);
  });

  it("keeps letter-prefixed codes like G-123456", () => {
    expect(extractOtp("Your Google verification code is G-123456")).toContain("123456");
  });

  it("falls back to alphanumeric codes near a keyword", () => {
    expect(extractOtp("Your OTP is A1B2C3 for this session")).toContain("A1B2C3");
  });
});

describe("extractLinks", () => {
  it("collects and dedupes http links from text and html", () => {
    const html = '<a href="https://example.com/verify?x=1&amp;y=2">Verify</a><a href="mailto:a@b.c">mail</a>';
    const text = "Open https://example.com/verify?x=1&y=2 now.";
    const links = extractLinks(text, html);
    expect(links).toEqual(["https://example.com/verify?x=1&y=2"]);
  });
});

describe("extractCodes", () => {
  it("finds promo codes but not plain words", () => {
    expect(extractCodes("Use promo code SAVE20 at checkout", "Your coupon")).toEqual(["SAVE20"]);
    expect(extractCodes("Welcome to the team")).toEqual([]);
  });
});

describe("extractAll", () => {
  it("returns every field for an automation envelope", () => {
    const result = extractAll(
      "Your verification code is 987654. Confirm at https://example.com/confirm",
      null,
      "Verify your login",
    );
    expect(result.otp).toEqual(["987654"]);
    expect(result.links).toEqual(["https://example.com/confirm"]);
  });
});

describe("intent and primary action", () => {
  it("finds the verification button and keeps unsubscribe separate", () => {
    const html =
      '<p>Please verify your email by clicking the link below:</p>' +
      '<a href="https://example.com/verify?token=abc">Verify email</a>' +
      '<a href="https://example.com/unsubscribe">Unsubscribe</a>';
    const result = extractAll(
      "Please verify your email by clicking the link below.",
      html,
      "Verify your account",
    );

    expect(result.intent).toBe("verification");
    expect(result.primaryLink).toBe("https://example.com/verify?token=abc");
    expect(result.actionText).toBe("Verify email");
    expect(result.unsubscribe).toEqual(["https://example.com/unsubscribe"]);
  });

  it("classifies password resets and prefers the reset link", () => {
    const result = extractAll(
      "Use this link to reset your password: https://app.example.com/reset?t=1",
      null,
      "Reset your password",
    );
    expect(result.intent).toBe("password_reset");
    expect(result.primaryLink).toBe("https://app.example.com/reset?t=1");
  });

  it("classifies receipts and newsletters", () => {
    expect(extractAll("Your receipt from Acme. Total $24.00", null, "Your receipt from Acme").intent).toBe("receipt");

    const newsletter = extractAll(
      "This week in agents",
      '<a href="https://news.example.com/issues/142">Read issue</a><a href="https://news.example.com/unsubscribe">Unsubscribe</a>',
      "Weekly digest issue #142",
    );
    expect(newsletter.intent).toBe("newsletter");
    expect(newsletter.primaryLink).toBeNull();
    expect(newsletter.unsubscribe).toEqual(["https://news.example.com/unsubscribe"]);
  });

  it("classifies notifications", () => {
    const result = extractAll("New activity in #design", null, "You have 3 unread messages in #design");
    expect(result.intent).toBe("notification");
  });

  it("leaves intent other when nothing matches", () => {
    expect(extractAll("Lunch is at noon", null, "Team lunch").intent).toBe("other");
  });
});

describe("htmlToText", () => {
  it("strips markup, scripts and entities", () => {
    const text = htmlToText("<div><script>alert(1)</script><p>Hello&nbsp;<b>world</b></p><p>Line 2 &amp; more</p></div>");
    expect(text).toBe("Hello world\nLine 2 & more");
  });
});
