# Changelog

All notable changes to this project are documented here. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and this project uses
[Semantic Versioning](https://semver.org/).

## [Unreleased]

## [0.1.0] - 2026-11-04

### Added

- Cloudflare Worker that receives mail through Email Routing for multiple domains.
- D1 metadata store and R2 storage for raw MIME, HTML and attachments.
- Operator dashboard with mailbox provisioning, search, domain management,
  stats, TTL control, API key rotation, pause/resume and link rotation.
- Signed HttpOnly dashboard session with CSRF protection.
- Mailbox API keys and 7-character share links with per-IP and global failure
  throttling.
- Structured JSON message envelope with text, HTML, headers, SPF/DKIM/DMARC,
  extracted OTP codes, links, intent, primary action link and unsubscribe list.
- Long-poll message listing, cursor pagination, unread filter and `since`.
- Attachment download and raw RFC 822 endpoints.
- Message reparse endpoint for parser upgrades.
- iOS-style inbox UI with dark mode, swipe to delete, OTP card and image blocking.
- Documentation page with the complete route index, request/response examples,
  error catalogue and limits.
- Test suite running inside workerd with real D1 and R2 bindings.
