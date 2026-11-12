# Rules for AI agents (and humans in a hurry)

> Status: first draft from the 2026-11-12 audit. Short on purpose. If this file and an older one disagree, this
> file and the documents it names win, and the disagreement is a bug to report.

## Read order

1. `CLAUDE.md` — orientation and commands.
2. `docs/ARCHITECTURE.md`, `docs/DOMAIN_RULES.md`, `docs/STATE_MACHINE.md` — how it works and what must stay true.
3. `UI_UX_DESIGN_REFERENCE.md` — for any UI change (via `docs/DESIGN_SYSTEM.md`).
4. `AGENTS.md` §1–6 — performance and backend rules. **Skip §7–11 and `Design.md`**: they describe the removed
   glass interface (DECISIONS D-05).

## Before you change code

- Find the rule's home in `docs/DOMAIN_RULES.md`. If the rule is duplicated, change the home and point the copies
  at it; do not add a third copy.
- Business rules go in pure functions in `utils/` with a unit test in `tests/unit/`. Pages and hooks call them.
- Server access rules live in `OWNERSHIP` and `requireRole` in `server.js`. Never rely on the UI to hide data.
- Any new collection field that clients send must be added to `RECORD_RULES` if a reader would break on bad input.
- Any new table or index: update `initDb()` **and** `backend_files/schema.sql`.
- Any CSP change: update `CSP_DIRECTIVES` in `server.js` **and** `preview.headers` in `vite.config.ts`.
- Any route/rail proxy change: update `backend_files/` **and** the dev middleware in `vite.config.ts`.

## Never

- Never send API keys, password hashes, calendar tokens or reset codes to the browser or into backups.
- Never write data on a read path (opening a page must not save anything).
- Never use `toLocaleDateString`; use `utils/formatters.ts`.
- Never add arbitrary z-index or hex colours (`npm run lint:tokens`).
- Never reintroduce `ViewState`, `components/glass`, the Golden Hour / Departure Board themes or feature flags.
- Never run `npm run build` just to check a build (it bumps the version); use `npx vite build`.

## Definition of done

- `npx tsc --noEmit`, `npm run lint:tokens`, `npm test` (frontend) and `cd backend_files && npm test` pass.
- Changed behaviour has a unit test (pure logic) or an API test (`backend_files/test/api/`).
- UI changes checked in light and dark at desktop and mobile widths, against the real API on pg-mem
  (`node backend_files/test/helpers/devServer.js` + `npx vite --port 3114 --mode realmode`).
- A product or architecture choice with real alternatives is logged in `docs/DECISIONS.md`
  (UI choices in `UI_UX_DESIGN_REFERENCE.md` §7).

## Known traps

- `services/mockDb.ts` is the production data client despite its name.
- The `flights` table stores every transport mode, not only flights.
- `trip.status` is partly derived from dates; use the helpers in `utils/tripsModel.ts`, never compare the string.
- `useWanderSync` dedupes by query key, not collection; reuse an existing key for the same data.
- The auth rate limiter also counts `/api/auth/me` and `/api/auth/setup-status`.
- A pre-commit hook bumps `version.ts` and `package.json`; expect those in every commit.
