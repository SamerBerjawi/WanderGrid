# WanderGrid Audit — Summary

**Date:** 2026-10-11 · **Scope:** the full application (web app and server) at `main`.
**Method:** five reviews (security, reliability, performance, UI/accessibility, end-to-end QA) produced 111 findings. Merging overlapping findings leaves **68 distinct issues**. QA ran 189 checks at desktop and mobile widths: 119 passed, 54 failed and 16 couldn't be run. Details are in `audit/plan.md`.

## Bottom line

**WanderGrid should not be exposed to untrusted users until Phase 1 is done.**
- **Anyone can take control.** Anyone who can reach an instance can make themselves an administrator, or take over an existing account. Any signed-in user can read, change or erase everyone's data.
- **Stored XSS.** A booby-trapped trip name can steal other users' sessions. This was confirmed in a real browser.
- **Data loss.** Several everyday actions lose data without warning:
  - "Archive" deletes trips.
  - Bundling flights can delete them.
  - Opening a trip silently rewrites flights.
- **Broken sign-in.** Members added in Settings can never sign in.

## Issues by category and severity (after de-duplication)

| Category | Critical | High | Medium | Low | Total |
|---|---|---|---|---|---|
| Security | 3 | 4 | 5 | 3 | 15 |
| Data integrity | 0 | 6 | 3 | 0 | 9 |
| Reliability and functional bugs | 0 | 3 | 13 | 6 | 22 |
| Performance | 0 | 2 | 5 | 2 | 9 |
| UI and accessibility | 0 | 4 | 7 | 2 | 13 |
| **Total** | **3** | **19** | **33** | **13** | **68** |

## Top 10 risks

1. **No access control on the server (Critical).** Every account, including a child or partner account, has full admin power: it can read and edit all data, reset passwords, and wipe the database.
2. **Open admin sign-up and account takeover (Critical).** Anyone can register as an administrator, or re-register over an existing user's account, without logging in.
3. **Stored XSS (Critical).** A crafted trip name runs code in other users' browsers and can steal their login. Stolen logins stay valid for 7 days, and signing out doesn't revoke them.
4. **Passwords set in the app never work (High).** Members enrolled in Settings, and users who change their own password, are locked out.
5. **"Archive" permanently deletes trips (High),** from both the Planner and the trip settings drawer.
6. **Restore gives accounts the password `password` (High).** Restoring a backup on a new server, the documented migration path, does this for every restored account, administrators included.
7. **Silent data changes and loss (High).** Opening a trip moves and deletes flights in the background. If bundling flights fails partway, the flights are lost. Opening the Dashboard writes data.
8. **Restore and wipe can crash the server (High).** One click during a brief database outage takes the whole service down. Large restores are rejected, or run two or three times over.
9. **Calendar feed exposes travel dates (High).** Anyone who knows a user's email can download their trip names, places and dates without logging in. The in-app "copy subscription link" doesn't work.
10. **Core actions broken on phones (High).** On mobile:
    - Flights can't be edited or deleted.
    - Bulk-action bars are hidden under the tab bar.
    - One trip tab is unreachable.
    - The Travel Atlas add/edit dialog doesn't open at any screen size.

**Also notable:**
- **Slow first load.** The first load on mobile takes about 9 s, because the sign-in page downloads the full mapping engine.
- **Accessibility gaps.** Zoom is disabled, much of the text is 8–10 px, and the main button colour fails contrast.

## Phased plan at a glance

| Phase | What it fixes | Work packages | Size* |
|---|---|---|---|
| **Quick wins** | 20 small, high-value fixes. Highlights: XSS, admin sign-up, server crash, Atlas dialog, mobile action bars, double-submit duplicates, mobile zoom | 20 items, ½ day or less each | ~8–10 days |
| **1. Critical security and data integrity** | Access control, sign-up lockdown, password handling, revocable sessions, private calendar feed, real Archive, no hidden writes, atomic bundling, safe restore and wipe. Starts with a CI safety net | 11 (WP-1.0…1.10) | ~4–5 weeks |
| **2. High-severity bugs and reliability** | Sign-in UX and password reset, broken features, mobile reachability, visible errors, concurrent-edit protection, server resilience, secrets kept on the server, input validation, CSP | 12 (WP-2.1…2.12) | ~5–6 weeks |
| **3. Performance** | Initial bundle (target Lighthouse ≥ 80, from 58), PWA precache (9.7 → <2.5 MB), glass effect budget, data fetching, DB indexes | 5 (WP-3.1…3.5) | ~2–3 weeks |
| **4. UI consistency and accessibility** | Zoom and type scale, contrast, labels, one dialog/confirm pattern, layout overflow, design tokens, component consolidation, copy | 8 (WP-4.1…4.8) | ~4–5 weeks |

*\* One engineer. These are rough sums of the package estimates (S ≤ ½ day, M 1–2 days, L 3+ days). Some Phase 3 and 4 work can overlap with Phase 2.*

**Verification:**
- Every package names the automated tests that must pass. Most of these already exist in `tests/e2e` and fail today.
- Phase 1 also adds server-side API tests and a CI test step. There is currently no automated testing in CI.

## Decisions needed from stakeholders

1. **Retire the hidden duplicate pages** (`/flights2`, `/roadtrips2`, `/trip2`) before Phase 1. Every fix otherwise has to be made twice.
2. **"Archive" should be a real, reversible archive,** with a separate "Delete". The other option is to relabel the button.
3. **Glass effect budget.** Keep liquid glass on navigation, tabs and dialogs, and use a lighter style for list cards. This needs a design-rule change.
4. **Hide "Demo" mode in production.**
5. **Backups exclude passwords and API keys.** Restored users would then reset their passwords.
