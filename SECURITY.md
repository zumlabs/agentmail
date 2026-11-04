# Security Policy

## Supported versions

Only the `main` branch is supported. Fixes land there first.

## Reporting a vulnerability

Do not open a public issue. Use GitHub's private advisory form:

https://github.com/hirotomasato/agenmail/security/advisories/new

Include reproduction steps, affected endpoint or file, and impact. Expect an
initial reply within a few days.

## Scope

- Authentication and authorization: admin token, dashboard session cookie,
  mailbox API keys, access-link slugs, CSRF checks
- Email ingestion and MIME parsing
- HTML sanitization in the inbox UI
- Rate limiting and quota enforcement
- Secret handling in deployment configuration

## Operational notes

- `TOKEN_PEPPER` hashes mailbox API keys and signs dashboard sessions. Rotating it
  invalidates every existing API key and session.
- `ADMIN_TOKEN` is a full operator credential. Rotate it immediately if exposed.
- Never commit `.dev.vars`, `.dev.vars.production`, or any file containing tokens.
- This project is receive-only. It never sends outbound mail.
