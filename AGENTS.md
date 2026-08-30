# AGENTS.md

## Project purpose

Build a mobile-first, real-time spot-the-difference party game for 3–10 invited friends. All participants draw one difference on the same source illustration, then everyone races to find the combined differences.

## Source of truth

Read these before implementation:

1. `docs/product/requirements.md`
2. `docs/architecture/overview.md`
3. The architecture document related to the task
4. `docs/development/ai-workflow.md`
5. `docs/development/testing.md`

If documents conflict, requirements take precedence. Do not silently resolve product-level conflicts; update the documents or ask for a decision.

## Architecture constraints

- Frontend: React, TypeScript, Vite, Canvas 2D.
- Backend: Cloudflare Workers and one SQLite-backed Durable Object per room.
- Realtime: WebSocket; authoritative room state lives on the server.
- Shared types, validation, game settings, and coordinate math belong in shared packages.
- Store drawing coordinates normalized to the source image, not viewport pixels.
- The server decides phase transitions, timers, answer correctness, winner order, score, host authority, and expiry.
- Do not add login, random matching, permanent history, user uploads, payments, or offline mode without an approved requirement change.

## Implementation rules

- Keep changes small and tied to explicit acceptance criteria.
- Never scatter game constants; use validated shared settings.
- Make commands idempotent with `commandId` where retries are possible.
- Treat every client payload as untrusted and validate it on the server.
- Do not log nicknames, reconnect secrets, full strokes, or answer coordinates.
- Add or update tests with every behavior change.
- Update the relevant Markdown design in the same change when behavior or architecture changes.
- Preserve the discussion mock under `mock/`; production work belongs in the proposed `apps/` and `packages/` structure.

## Required checks

Before declaring work complete, run the available type check, unit tests, integration tests, production build, and relevant multi-browser test. Report any check that could not run and why.

## Deployment authority

For this project, publishing normally means a temporary Cloudflare preview, not production. Read `docs/architecture/deployment.md` section 8 first. Reuse an unexpired temporary account; explain and obtain explicit consent before accepting terms to create a new one. Never commit credentials or account claim URLs.

AI may create branches, issues, tests, pull requests, and preview deployments. Production deployment requires explicit human approval. Any new paid service or expansion of collected user data also requires explicit approval.
