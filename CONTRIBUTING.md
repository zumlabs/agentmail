# Contributing

## Setup

```bash
pnpm install
cp .dev.vars.example .dev.vars
pnpm db:migrate
pnpm build
pnpm test
```

`pnpm dev:api` runs the Worker and the built UI on http://127.0.0.1:8787.
`pnpm dev:web` runs Vite with an `/api` proxy to 8787.

## Checks before a pull request

```bash
pnpm typecheck
pnpm test
pnpm docs:check
pnpm build
```

`docs:check` fails when the documented routes in `web/src/data/routes.json` do
not match the routes registered in `src/index.ts`.

## Conventions

- Worker code: TypeScript, no `any`, small modules under `src/`.
- API responses use the existing envelope helpers in `src/lib/envelope.ts`.
- New admin routes need the matching entry in `web/src/data/routes.json` and the
  README endpoint table.
- Parser changes need a test in `test/extract.test.ts`; ingestion changes need an
  integration test in `test/api.test.ts`.
- UI changes should be checked at 390px and 1280px, light and dark.
- Keep secrets out of commits. `.dev.vars*` is ignored on purpose.

## Commit messages

Short imperative subject, optional body explaining the tradeoff:

```
add reparse endpoint for stored messages
fix OTP false positives from UUID links
```

## Pull requests

- One focused change per PR.
- Describe the user-visible behavior and how you verified it.
- Include screenshots for UI changes.
- Do not include generated artifacts (`dist/`, `.wrangler/`).
