# Leave planner: decisions log

Every product and technical decision taken while building the holiday and time-off planner (leave Phases 0–2),
for review. The user approved the plan on 2026-11-16 with the recommended answers to the eight open questions and
asked for the remaining phases to proceed without stopping; everything below marked **(own call)** was decided during
the build, without asking. Each entry says what was decided, why, and where it lives, so it can be revisited.

## Approved up front (2026-11-16)

| # | Question | Answer |
|---|---|---|
| A1 | Where leave is stored | Its own `leave` collection, linked to trips by `tripId` |
| A2 | Who manages what | Leave types: admins. Allowances, adjustments and leave: each member for themselves; admins for anyone |
| A3 | Leave year | A configurable start month per policy (not calendar years only) |
| A4 | Unit | Days and half days (no hours) |
| A5 | States | Draft, planned, requested, approved, rejected, cancelled; approval steps optional per member |
| A6 | Reminders | In-app only |
| A7 | Attachments | Notes only |
| A8 | Old `allowance` / `takenLeave` | Converted to an opening balance and an adjustment, then retired |

## Phase 0 (PR #115, merged)

| # | Decision | Why |
|---|---|---|
| 0.1 | Every page counts leave through `utils/calendarModel.ts` via `hooks/useLeaveRules.ts` | The Member page, Dashboard and Year in review disagreed with the Calendar |
| 0.2 | A working day costs at most one day across a member's entries **(own call: order)** | Overlapping time off and trips were counted twice |
| 0.3 | "Next working day" skips days other holidays hold; "Day in lieu" credits the Lieu type, else the first Annual type **(own call: target type)** | Two weekend holidays shared a Monday; the lieu rule did nothing |
| 0.4 | Carried-over days are used first and expire on the source policy's date; the balance warns before | Expiry was stored but ignored |
| 0.5 | Members may edit their own allowances (the server already allowed it) | Decision A2 |
| 0.6 | Weekend rule labels: No extra day / Next working day / Day in lieu **(own call)** | "Standard" and "Move to Monday" no longer described the behaviour |

## Phase 1a: leave entries (PR: feat/leave-collection)

| # | Decision | Why / alternative |
|---|---|---|
| 1a.1 | One entry **per member**; migration 0004 gives each traveller on a leave-carrying trip their own entry | Balances are per member; a shared entry could not hold different states or dates. **(own call)** |
| 1a.2 | Entry ids: hidden time off keeps its `leave-…` id; trip leave becomes `leave:<tripId>:<memberId>` | Stable ids make the migration idempotent and keep calendar-feed UIDs the same for converted time off. **(own call)** |
| 1a.3 | Migrated state: cancelled trip → cancelled; confirmed, past or Upcoming trip → approved; otherwise planned | Past leave was taken, so it counts as approved. **(own call)** |
| 1a.4 | Everyone in the workspace can **read** every entry; only the member or an admin can write, and a member cannot hand an entry to someone else | The household calendar shows everyone's time off (as it did before for admins); sick leave is visible to the household too. Alternative: owner-only reads. **(own call)** |
| 1a.5 | Which entry owns a shared day: booked (planned or approved) before requested, then a split, then the earlier start | A request yields to booked leave; otherwise the first entry keeps its days. First tried approved-before-planned, which moved days onto trips unexpectedly. **(own call)** |
| 1a.6 | Counting: planned and approved count as used or planned; requested counts as **pending** (taken off the remaining balance); draft, rejected and cancelled never count | Conservative balance, as in most HR tools. **(own call)** |
| 1a.7 | Without approval tracking a member sees Idea / Planned / Confirmed / Cancelled; with it, Idea / Requested / Approved / Rejected / Cancelled. A switch per member in Settings › Leave | Decision A5; "Confirmed" reads better than "Approved" when no one approves. **(own call: labels)** |
| 1a.8 | Ideas (drafts) show on the calendar muted and dashed; requests dashed; rejections and cancellations are hidden | Ideas should be findable; refusals clutter. **(own call)** |
| 1a.9 | The trip form's Leave section edits **the traveller's own** linked entry (signed-in member if travelling, else the first traveller); "Take leave" on a trip does the same | Before, one leave type on a trip counted for every participant. Others add theirs on the Calendar. **(own call)** |
| 1a.10 | When a trip's dates change, linked entries whose dates matched the old trip dates move with it; entries with their own dates stay | Keeps the common case in step without overwriting deliberate differences. **(own call)** |
| 1a.11 | Deleting a trip keeps its leave and removes the link; deleting a member deletes their leave | The time off may still happen; a removed member's leave has no owner. **(own call)** |
| 1a.12 | The calendar shows trips and leave as separate items (a Leave layer chip next to Trips); "Leave only" shows leave entries only; the Year view shows leave before trips | "Distinguish travel dates from leave dates". **(own call)** |
| 1a.13 | Calendar feed: leave entries are all-day events (requested marked "(requested)" and TENTATIVE); trips name the leave linked to them; drafts, refusals and cancellations stay out | Same uid for converted time off, so subscribed calendars update instead of duplicating. **(own call)** |
| 1a.14 | Restores convert older backups (leave on trips) on the server and in local mode; backups now carry `leave` under the Calendar group | Old backups must keep working. **(own call)** |
| 1a.15 | The leave sheet previews the cost after overlaps and each affected balance before → after | Plan item "show the balance impact before confirming". |
