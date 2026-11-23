# Trip interchange format (`wandergrid-trip-interchange` 1.x)

A whole travel plan as one JSON file: days and activities, stops, transport, the stays being considered with their
hotel shortlists, day trips, hidden gems and a budget estimate. **Import itinerary** reads it into a new or existing
trip; **Export as JSON** writes a trip back out in the same format.

- Reader and checks: `utils/tripInterchangeSchema.ts` (zod). Mapping, merge and export: `utils/tripInterchange.ts`.
  Status helpers the pages use: `utils/tripPlan.ts`. Wizard: `components/new/trips/TripImportSheet.tsx`; export:
  `TripExportSheet.tsx`.
- Template: [`public/samples/wandergrid-trip-template.json`](../public/samples/wandergrid-trip-template.json)
  (also "Download a template" in the wizard). Full example: `tests/fixtures/trip-interchange-japan-korea.json`.
- Decision: `docs/DECISIONS.md` D-08. Rule home: `docs/DOMAIN_RULES.md` rule 10a.

## Making a file with an AI assistant

**Settings › Data › Make a trip file with AI** (`components/new/trips/ItineraryAiGuide.tsx`, also linked from the
import wizard) explains it: download the template, give it to ChatGPT, Claude or another assistant with a copyable
prompt, then import the reply. The template's `"$comment"` holds the format's rules written for the assistant (one JSON
object, no invented times/prices/numbers, stable ids, one day per date, candidates not bookings…); the reader accepts
and ignores `$comment`. A pasted reply may keep the assistant's message or a code fence around the JSON: the reader
takes the JSON out and says so in Warnings. To revise, the guide's second prompt asks the assistant to keep every id,
so importing the new file into the same trip updates it.

## Importing

1. **Trips → Import itinerary** (toolbar), **Settings › Data › Import itinerary**, or a trip's **⋯ → Import itinerary** to import into that trip.
2. Drop or choose the `.json` file (or paste it), then **Check file**. Problems are listed with their path
   (`days[3].activities[1].start_time`) and nothing goes further until they are fixed.
3. **Preview**: tabs for Days, Stays, Transport, Hidden gems, Budget and Warnings. Untick anything you don't want;
   "Leave out the optional and alternative items" does that in one go. Choose **New trip** or an existing trip. A
   plan imported before is found by its `trip.external_id` and chosen for you.
4. **Review changes**: what is added, updated, already there, linked or left out, and any conflicts with your edits
   (Keep mine / Use the file, one by one or for all).
5. **Create trip** / **Import into …** saves everything in one transaction (`/api/batch`) or nothing. The toast that
   follows can undo it (the trip as it was is put back, or the new trip deleted).

Places are looked up on the map when the trip saves, with the same geocoder as any trip (check them on the Route
tab). The file itself never supplies coordinates.

## The file

Dates are calendar days (`YYYY-MM-DD`) and times are local 24-hour `HH:mm`, never converted to a time zone. Text is
trimmed and control characters are removed; Unicode is kept. `null` and a missing field mean the same thing.

| Key | Type | Notes |
| --- | --- | --- |
| `schema_version` | `"1.x.y"` | Major version 1 only. A newer minor version is read with a warning. |
| `format` | `"wandergrid-trip-interchange"` | Required. |
| `exported_at` | string | Written by export. |
| `$comment` | string or string[] | Notes for whoever fills the file in (the template's AI instructions). Ignored. |
| `trip` | object | `external_id` (required, stable), `name`, `start_date`, `end_date`, `status` (planning, upcoming, past, cancelled), `classification` (Personal, Business, Family, Bleisure, Other), `currency`, `origin`, `travelers[]` (`label`, `type`, `age_at_trip`), `notes[]`. |
| `destinations[]` | object | `id`, `name`, `country_code` (ISO 2), `arrival_date`, `departure_date`, `recommended_area`. |
| `days[]` | object | `id`, `date` (inside the trip; one entry per date), `day_number` (checked against the date), `destination_id`, `title`, `summary`, `schedule_status`, `notes[]`, `activities[]`. |
| `days[].activities[]` | object | `id`, `title`, `location_name`, `order`, `priority` (planned, recommended, optional, alternative), `booking_status` (unbooked, candidate, booked, paid), `start_time`, `time_status` (unscheduled, tentative, fixed), `notes`, `type`, `cost`. |
| `accommodation_stays[]` | object | `id`, `destination_id`, `check_in`, `check_out` (after check-in), `nights` (checked), `status`, `preferred_area`, `hotel_options[]` (`id`, `name`, `rank`, `status`: candidate, booked, rejected), `target_per_night` or `target_per_night_eur`, `family_requirements[]` / `requirements[]`, `notes`, `booking` (`name`, `address`, `type`, `check_in_time`, `check_out_time`, `confirmation_code`, `website`, `cost`). |
| `transport[]` | object | `id`, `date`, `mode`, `origin`, `destination`, `status`, `departure_time`, `arrival_time`, `arrival_date`, `provider`, `identifier`, `booking_reference`, `seat`, `cost`, `notes`. |
| `budget` | object | `currency`, `target`, `categories` (name → amount), `note`. |
| `day_trips[]` | object | `id`, `date`, `origin`, `destination`, `estimated_total_hours`, `priority`, `notes`. |
| `hidden_gems[]` | object | `id`, `name`, `destination_id`, `date`, `status` (planned, optional, alternative), `notes`. |
| `import_notes` | object | name → text, kept as written. |
| `unmapped_fields` | object | Written by export: fields WanderGrid didn't use, by their path in the original file. |

Every `id` is 1–200 characters with no spaces or slashes, and unique within its list (activity ids across all days,
hotel option ids across all stays). `destination_id` must name a destination.

### Refused before anything else

Files over 2 MB, anything that isn't a JSON object, nesting deeper than 12 levels, another `format`, a major version
other than 1, wrong field types, impossible dates (`2027-02-30`), times outside `00:00`–`23:59`, negative or huge
amounts, end dates before start dates, repeated ids or dates, broken `destination_id` references, and a transport mode
nothing matches. Keys named `__proto__`, `constructor` or `prototype` are removed on reading (with a warning) and
refused by the server in stored trips.

### Warnings (import still possible)

Fields the format doesn't define (kept in `trip.plan.extra`, written back on export), `day_number` or `nights` that
disagree with the dates (the dates win), dates outside the trip, days with no entry, budget categories that don't add
up to the target, shortlist targets above the accommodation allowance, a budget in a currency other than the
workspace's (kept as an estimate, not set as the target), unknown priorities or statuses, a hidden gem that matches no
activity, and multi-mode legs.

## How it maps

| File | WanderGrid | Notes |
| --- | --- | --- |
| `trip` | `Trip` | `status` → `Planning`/`Upcoming`/`Past`/`Cancelled` with `intent`; `location` = first destination and its country; `notes[]` → lines of `trip.notes`. |
| `destinations[]` | `trip.locations[]` (Route planner stops) | `plan.externalId`, `plan.area`, `plan.countryCode`. |
| `days[]` headings | `trip.plan.days[]` | Shown at the top of each Itinerary day. |
| `days[].activities[]` | `trip.activities[]` | `time` is `''` when unscheduled (shown as "Any time"); `plan.priority`, `plan.bookingStatus`, `plan.timeStatus`, `plan.order`, `plan.hiddenGem`. `cost` becomes `cost` only when booked or paid, otherwise `plan.estimatedCost`. |
| `accommodation_stays[]` | `trip.plan.stays[]` with `candidates[]` | **Never an `Accommodation`**, unless the stay is booked and names its hotel (`booking.name` or a `booked` option); then one `Accommodation` is added and linked to the candidate. |
| `transport[]` | `trip.transports[]` | Mode mapped explicitly (below). No times, numbers or references are invented: they stay empty. `plan.bookingStatus` defaults to `booked` only when the file has no status. |
| `budget` | `trip.targetBudget` + `trip.plan.budget` | No `Expense` is created. `ledgerCurrency` is set if the trip has none and no expenses. |
| `day_trips[]`, `hidden_gems[]` | `trip.plan.dayTrips[]`, `trip.plan.hiddenGems[]` | A gem also labels the activity of the same name (accents ignored) on its date. |
| `trip.travelers[]` | `trip.plan.travellers[]` | Not turned into accounts or companions. |
| anything else | `trip.plan.extra` | By path, max 100 KB. |

Transport modes: Flight/plane/air → `Flight`; Train/rail/Shinkansen/KTX/SRT/TGV/ICE/Eurostar/metro/tram → `Train`;
Bus/coach/shuttle → `Bus`; Ferry/boat/hydrofoil → `Ferry`; Cruise → `Cruise`; car rental/hire → `Car Rental`;
car/drive → `Personal Car`. The text as written is kept in `plan.modeLabel` when it differs ("Shinkansen"). A leg
written with several modes ("Train/Bus", "Bus + Ferry") is saved as the first one, with a warning to check it.

### What stays "not booked"

A leg or activity with `plan.bookingStatus` `unbooked` or `candidate` and no number or booking reference is
*proposed* (`isProposed`): it shows "Not booked" and is left out of the flight log and the trip's next-flight card.
Adding a flight number or booking reference makes it booked. Candidates show "Candidate"; booking one from the
Bookings tab's Stay shortlist adds an `Accommodation` for the planned nights.

## Importing again, and into a trip that has things in it

Imports are additive: nothing in the trip is removed. Each record is matched by the file's id (`plan.externalId`,
or the record's own id for a WanderGrid export).

- **Not in the trip:** added. If the trip already has the same thing entered by hand (same title and date; same
  route, mode and date; same name and check-in), that record is linked to the file instead of copied.
- **In the trip, unchanged since the last import** (its imported fields still match the fingerprint stored in
  `plan.importHash`): updated to the file's values.
- **In the trip and edited since, or booked** (booked/paid, a booking reference, a cost or a payer): each differing
  field is a conflict. The trip's value is kept unless you choose the file's.
- The trip's name and target budget are conflicts too; its dates widen to cover the plan; notes are added, not replaced;
  its status, privacy, participants, bookings, costs and expenses are not touched.
- Day headings, day trips and hidden gems are replaced by id (days by date). A stay plan keeps its booking and any
  hotel booked or ruled out since.

Importing the same file twice changes nothing. Exporting a trip and importing that file into the same trip changes
nothing.

## Exporting

Trip menu → **Export as JSON**. Ids are the ones the trip was imported with, so the file round-trips. Never written:
expenses, who paid, account members, coordinates. Booking references, seats and companions' names are written only
when "Include booking references, seats and companions' names" is ticked; the sheet warns that a reference lets anyone
change or cancel a booking.

## Known limits

- Merging never deletes: an item removed from the file stays in the trip. There is no "replace the plan" mode.
- Booking a candidate adds the stay without times or a reference; add them in Stays.
- Travellers are kept as text; they are not matched to members or companions.
- A same-day return written as one leg stays one leg (no return leg is invented).
- Geocoding uses the app's geocoder at save time; there is no per-place review step in the wizard.
