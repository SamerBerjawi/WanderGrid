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

## Phase 1b: the balance ledger (PR: feat/leave-ledger)

| # | Decision | Why / alternative |
|---|---|---|
| 1b.1 | The leave-year start month lives on the **leave type** (`yearStartMonth`), not on each member's yearly policy | A per-year policy cannot say which year a date belongs to (the start month decides that), so a per-policy start would be circular. Decision A3 asked for "per policy"; per type is the closest consistent reading. **(own call)** |
| 1b.2 | `UserPolicy.year` and an allocation's `targetYear` now mean the **leave year**; with a January start nothing changes | Keeps one meaning of "year" everywhere. **(own call)** |
| 1b.3 | Carried-over days expire counted from the leave-year start ("3 months" = to the end of the third month); a fixed date is its first occurrence in the leave year | Matches "months into the year" for any start. **(own call)** |
| 1b.4 | Opening balance is a field on the yearly policy; adjustments are a list on the member (`leaveAdjustments`), each with days (±), leave year, date and note | Opening balance belongs to one year's allowance; adjustments are a ledger that needs history. Both are on the member record, which members can already edit for themselves (A2). **(own call)** |
| 1b.5 | Monthly accrual is earned at the **start** of each month of the leave year; the balance shows "accrued so far" next to what is left, and what is left is still counted against the whole year | The common reading in HR tools; planning a summer break should not show a deficit in January. Alternative: earned at month end. **(own call)** |
| 1b.6 | Each member may have their own working week (`User.workingDays`), set in Settings › Leave; the Calendar grid uses it when one member is in view | Part-time schedules (plan section 6). **(own call: where it is set)** |
| 1b.7 | Migration 0005 (and every restore, and local mode) turns the old yearly `allowance`/`leaveBalance` into an Annual leave allowance for the year of the conversion, creating an "Annual leave" type if there is none, and `takenLeave` into a negative adjustment — **skipped when the member already has leave entries that year** | The recorded days used to stand in for leave on trips; once those trips' leave is counted, deducting them again would double-count. Decision A8. **(own call: the skip)** |
| 1b.8 | The old fields are no longer read anywhere (the yearly-allowance fallback, the Member page's "Recorded as taken" slice and the admin-only allowance sheet are gone; Member page links to Settings › Leave) but stay on records | Removing them would need another migration and break older clients reading backups. **(own call)** |
| 1b.9 | A new member (sign-up or added by an admin) starts with **every leave type's default allowance** for the current year; the "Leave days a year" field on Add member is gone | Sensible defaults without country rules; admins and members adjust in Settings › Leave. **(own call)** |

## Phase 1c: public holidays (PR: feat/leave-holidays)

| # | Decision | Why / alternative |
|---|---|---|
| 1c.1 | Members follow a **calendar** (a country `BE`, or a region `DE-BY`) for every year (`User.holidayCalendars`); the old per-year links (`holidayConfigIds`) are read as the same calendars until changed | Following a calendar once a year was easy to forget and silently stopped counting holidays in January. **(own call)** |
| 1c.2 | Holidays are still stored one saved calendar per calendar and year (`BE-2026`, `DE-BY-2026`) | Keeps day-off switches per year and the existing data and feed working; no migration. **(own call)** |
| 1c.3 | When the Calendar opens, a saved calendar missing this year, next year or the year in view is fetched once; an **admin's** visit saves it for everyone, anyone else's uses it for that visit only | Only admins may write calendars (server rule kept); "annual refresh" without a scheduled job. Alternative: a server job each December (no scheduler exists). **(own call)** |
| 1c.4 | A region calendar holds the country's nationwide holidays **plus** that region's own (marked Regional); other regions' days are left out and counted | One calendar per place someone lives, rather than stacking a country and a region calendar. Region names come from OpenHolidays; when it does not know the country, Nager.Date's region codes are shown as they are. **(own call)** |
| 1c.5 | Admins add days to a saved calendar by hand (a company holiday, a local feast); they survive a refresh, can be removed, and like any holiday can be switched off | "Manual creation, editing and exclusion". **(own call)** |
| 1c.6 | Workspace events now count: one marked "not a working day" is a **company day off for everyone** (leave over it costs nothing); a working day on a weekend makes that day cost leave | Before, the switch only changed the look. Company days apply to every member. **(own call)** |
| 1c.7 | Substitute holidays are taken as the services publish them (Nager.Date lists substitute days for the countries that have them); the member's weekend rule handles the rest | No country rules hard-coded (plan section 9). **(own call)** |

## Phase 1d: trips and leave together (PR: feat/leave-trips)

| # | Decision | Why / alternative |
|---|---|---|
| 1d.1 | Disagreements between a trip and its leave are **notes**, not errors: working days with no leave, leave on other dates (trip moved), refused leave, leave still requested for a confirmed trip, leave still counting for a cancelled trip; leave running past the trip is shown only as information | Travel and leave dates differ on purpose (a weekend trip needs no leave; a day off before a flight is common). **(own call)** |
| 1d.2 | A day the member marked as "worked anyway" counts as covered | They said they work it. **(own call)** |
| 1d.3 | The trip page shows the most pressing issue as a pill next to the leave chip; Plan leave lists them all; the Calendar shows "Leave to look at" (the subject's trips in the next year, up to five) | One glance per place, without a separate page. **(own call)** |
| 1d.4 | "Plan a trip for these days" on leave with no trip opens the new-trip sheet with its dates and name, and the new trip **takes over that leave** (links it) | Suggest creating a trip from time off without duplicating the leave. **(own call)** |
| 1d.5 | "Suggest reserving leave when creating a trip" is the existing chip ("Needs N days of leave") and Plan leave on every trip card and page, plus the trip form's Leave section; no extra prompt | Avoids a nag in the trip flow. **(own call)** |
