# WanderGrid — New Findings (found during remediation)

Issues noticed while implementing `audit/plan.md` that are **not** covered by an existing finding.
They were not fixed unless the Status says so. IDs continue the audit numbering with the `NEW-` prefix.

| ID | Severity | Area | Finding | Status |
|---|---|---|---|---|
| NEW-001 | High | Settings › Personnel (`views/Settings.tsx` `handleSaveUser`) | Editing a member with the password field left blank sent `password: 'password'`, silently resetting the member's password to `password` once the server hashed it. | **Fixed in WP-1.3**: blank keeps the current password; new members require 8+ characters. |
| NEW-002 | Medium | Profile (`views/UserDetail.tsx`) | After saving a profile, the typed plaintext password was kept in component state and written into `localStorage.wandergrid_session_user`. | **Fixed in WP-1.3**: the password is stripped before state/localStorage. |
| NEW-003 | Medium | Settings (all admin tabs) | Non-admin users see the Workspace, Integrations, Gear, Carriers, Personnel and Data Management controls. Since WP-1.2a the server answers 403, so a Partner can fill in forms whose save always fails. The admin-only tabs should be hidden or read-only for non-admins. | Open |
| NEW-004 | Low | Flights, Road Trips, Travel Atlas | Edit/Delete controls are shown on records the user may not change (another member's flight or atlas entry). Since WP-1.2b these actions return 403. Hide or disable them using `ownerId`. | Open |
| NEW-005 | Low | `GET /api/<collection>` (`getResources`) | `limit`/`offset` are applied in SQL before the ownership filter, so a page can contain fewer than `limit` readable rows. No client passes these parameters today (PERF-009); fix together with WP-3.4 pagination. | Open |
| NEW-006 | Low | `POST /api/restore` (replace mode) | `restoreOptions.currentUser` from the request body is inserted into `users` when the caller's account isn't in the file. Admin-only since WP-1.2a, but it is still an unvalidated user record; build it from the server's own row instead. | Open |
| NEW-007 | Info | Test harness (`pg-mem`) | pg-mem ignores `ROLLBACK` and cannot parse a single multi-megabyte string parameter. The test helpers now emulate rollback with snapshots; very large single-record payloads must be tested against real Postgres. | Documented |
