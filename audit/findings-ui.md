# WanderGrid — UI Consistency & Accessibility Findings

**Date:** 2026-10-11
**Scope:** the reachable UI (inventory §1: 13 navigable pages plus their modals and drawers). The URL-only "2" duplicates and the dead components are noted only where they affect counts. No application code was modified.

**Method**
- **Static analysis:** pattern counts over all tracked `views/`, `components/` and `App.tsx` TSX files; class lookups against the compiled CSS from `vite build`; and a string extraction of 1,582 user-visible strings checked with `cspell`.
- **Runtime tests:** headless Chrome via the repo's `puppeteer-core` against `npm run dev`, logged in with the built-in "Auto-Setup & Demo Run" localStorage dataset.
  - I ran **axe-core 4.10.3** on 9 pages × 2 viewports (1440×900 and 375×812).
  - Responsive checks covered document and `<main>` horizontal overflow, elements past the right edge, and screenshots.
  - I also counted touch-target sizes, rendered font sizes, and tab-key focus visibility.
- **Lighthouse 12.6.1:** accessibility score on the login page was **93**.

---

## Intended design system (the baseline used below)

Sources: `Design.md`, `AGENTS.md` §7–§11, `tailwind.config.js`, `constants.ts`, `components/ui.tsx`, `components/glass/*`.

- **Aesthetic:** "Liquid Glass Everywhere". Cards, pills, buttons, inputs and modals render through `GlassPanel` / `GlassButton` (`@nkzw/liquid-glass`) with the `wg-glass-card` / `wg-glass-pill` classes and 28 px card radius.
- **Tokens (`tailwind.config.js`):**
  - Colors: brand `primary-50…900` (orange, `primary-500 #fa9a1d`); surface and text tokens `light-bg / light-card / light-text / light-text-secondary`, with `dark-*` equivalents; `semantic-red/green/yellow/blue`.
  - Type: font `sans` = Apple system stack (SF Pro); extra sizes `text-2xs` and `text-3xs`.
  - Radii: `xl 12 / 2xl 16 / 3xl 24`.
  - Z-index scale: `z-dropdown … z-tooltip`.
  - Glass shadows.
- **Shared style strings (`constants.ts`):** `INPUT_BASE_STYLE`, `BTN_PRIMARY/SECONDARY/DANGER_STYLE`, `MODAL_SHELL_STYLE`, typography and label constants, segmented-tab and pill styles.
- **Shared components:** `Button`, `Input`, `Select` (wraps `GlassSelect`), `Modal`, `Tabs`, `Card`, `Badge`, `Autocomplete` in `components/ui.tsx`; `StandardDrawer` as the drawer template; `<EmptyState/>` for empty collections; `formatters.ts` for dates and currency.
- **Layout ("Planner Standard"):**
  - Max width 1680 px, with `px-1` gutters on mobile.
  - Hero title on the left with the primary action on the right; intermediate controls centered on mobile.
  - A floating glass tab pill, and a 12-column bucket grid.
- **Copy rules (Design.md §4):** "Radical simplicity": short, direct labels, status pills instead of helper paragraphs.
- **Accessibility rules (AGENTS.md §8):** 44 × 44 px minimum touch targets, and an `aria-label` on every icon-only button.

---

### UI-001 Pinch-zoom is disabled on every page
- **Severity:** High
- **Location:** `index.html:6`
- **Evidence:**
  ```html
  <meta name="viewport" content="width=device-width, initial-scale=1.0, viewport-fit=cover, maximum-scale=1, user-scalable=no" />
  ```
  axe `meta-viewport` (**critical**) fired on 18 of 18 page and viewport checks, and on the login page.
- **Impact:** Low-vision users on phones and tablets can't zoom. That fails WCAG 1.4.4 (Resize Text). It is compounded by the app's very small type (UI-002).
- **Suggested fix:** Remove `maximum-scale=1, user-scalable=no`. If iOS input auto-zoom is the concern, use 16 px input text instead.
- **Effort:** S

### UI-002 Much of the text renders at 8–10 px
- **Severity:** High
- **Location:** `index.html:357-359` (`html { font-size: 95% }`); `tailwind.config.js` (`'3xs': 0.5625rem`, `'2xs': 0.625rem`); 762 uses of `text-2xs` and 69 of `text-3xs` across TSX.
- **Evidence:**
  - With the 95 % root, `text-2xs` computes to 9.5 px and `text-3xs` to 8.55 px.
  - Measured computed font sizes of visible text elements at 1440 px:

    | Page | Text elements | < 10 px | < 11 px | Smallest |
    |---|---|---|---|---|
    | Dashboard | 82 | 28 (34 %) | 32 | 8.0 px |
    | Flights | 116 | 46 (40 %) | 46 | 8.0 px |
    | Settings | 63 | 21 | 22 | 9.5 px |

  - These sizes are used for form labels (`GlassSelect`, `Input` label style), status pills, table metadata, and section headings, often uppercase with wide tracking.
- **Impact:** Hard to read for many users, and especially on mobile with zoom disabled (UI-001). Uppercase tiny labels further reduce legibility.
- **Suggested fix:**
  - Remove the 95 % root override.
  - Set a 12 px floor for informational text: retire `text-3xs` and restrict `text-2xs` to decorative counters.
  - Define the label style at `text-xs` (12 px) or larger in `constants.ts` (`SECTION_LABEL_STYLE`) and Design.md.
- **Effort:** M

### UI-003 The primary orange button fails color contrast (2.16:1), and light-gray text is too faint
- **Severity:** High
- **Location:** `constants.ts:10-11` (`BTN_PRIMARY_STYLE`: `bg-primary-500/85 … text-white`); `components/ui.tsx:84+` (`Button` primary variant); 52 TSX lines combine `bg-primary-500` with `text-white`; 273 uses of `text-gray-400` / `text-zinc-400` / `text-slate-400` without a dark-mode-only prefix.
- **Evidence:**
  - axe `color-contrast` (serious) on Planner-2: "insufficient color contrast of **2.16** (foreground #ffffff …)" on the empty-state primary CTA.
  - Computed WCAG ratios:

    | Pair | Ratio | Requirement |
    |---|---|---|
    | white on `primary-500` #fa9a1d | **2.16:1** | 4.5:1 for text, 3:1 for large or bold text |
    | white on `primary-600` #e78310 | 2.74:1 | |
    | `light-text` #0F172A on #fa9a1d | 8.25:1 | |
    | `gray-400` #9ca3af on `light-bg` #FAFAFA | 2.43:1 | |
    | `zinc-400` #a1a1aa on white | 2.56:1 | |

  - axe also returned 54–79 color-contrast "needs review" nodes per page. Glass and translucent backgrounds prevent automatic checking, so the real number of failures is likely higher.
- **Impact:** The app's main call-to-action style ("New Trip", "Save", "Create Trip") and much of the secondary light-mode text fall below WCAG AA, which matters for low-vision users and for outdoor mobile use.
- **Suggested fix:**
  - Use dark text (`text-light-text`) on `primary-500`, or darken the button fill to around `primary-800` for white text (check that it reaches ≥ 4.5:1).
  - Replace `*-400` body text in light mode with `light-text-secondary` (#334155, about 10:1).
  - Add an automated axe contrast check to CI.
- **Effort:** M

### UI-004 Form fields have visible labels that aren't connected to the controls
- **Severity:** High
- **Location:** `components/glass/GlassSelect.tsx:32-49` (a `<label>` sibling with no `htmlFor`, and a `<select>` with no `id`, `aria-label` or `aria-labelledby`); `components/ui.tsx:113-116` (`Input` passes `label` to the field wrapper that renders an unassociated `{label && <label className={SECTION_LABEL_STYLE}>{label}</label>}` at `:176`); `components/ui.tsx:230-233` (`Select` passes `label` through to `GlassSelect`).
- **Evidence:**
  - axe `select-name` (**critical**) on 12 nodes across 4 page checks: Settings has 5 at both widths, and Travel Atlas has `#region-filter`. Failure: "does not have an implicit (wrapped) `<label>`".
  - Inputs pass axe only because their **placeholder** acts as the accessible name. Clicking a visible label does not focus its field.
  - These shared components are used everywhere: 182 `<Input>`, 31 `<Select>`, 35 `<GlassSelect>`.
- **Impact:** Screen-reader users hear unlabeled combo boxes in Settings (currency, date format, theme, cabin class, land-transport mode) and on filters. Fields named only by placeholder lose their name once the user types, and voice-control users can't target them by their label.
- **Suggested fix:** Generate an id with `useId()` in `Input`, `Select` and `GlassSelect`, and set `<label htmlFor={id}>` plus `id={id}` on the control (or wrap the control in the label). Allow an `aria-label` prop for label-less filter selects.
- **Effort:** S

### UI-005 Modals and overlays have no dialog semantics, and most lack keyboard handling
- **Severity:** Medium
- **Location:** app-wide; `components/ui.tsx:258+` (`Modal`); inline overlays in 15 files, including `views/Flights.tsx` (14 `fixed inset-0` blocks), `views/TravelAtlas.tsx` (2), `components/ExcursionConfigurator.tsx` (2), `components/NewTripDrawer.tsx` (2) and `components/FlightImportWizard.tsx` (1).
- **Evidence:**
  - `grep -r 'role="dialog"\|aria-modal'` across `views/` and `components/` finds **0** matches.
  - The shared `Modal` does trap focus, restore focus and close on Escape (`ui.tsx` around lines 31–80), but it is only one of three modal systems (UI-011).
  - The per-file counts for the inline overlays: Flights has 0 `'Escape'` handlers and no focus management across its 14 overlays (bundle, edit bundle, delete and unbundle confirms, flight form). Travel Atlas and Excursion likewise have none.
  - In the live Settings "Enroll Member" modal (shared `Modal`), there is no `role="dialog"`, and the modal is not linked to its title.
- **Impact:** Screen readers don't announce that a dialog opened or what it's called. In the inline overlays, keyboard users can Tab into the page behind the scrim and can't dismiss with Escape. The behavior differs from modal to modal.
- **Suggested fix:** Add `role="dialog" aria-modal="true" aria-labelledby` to `Modal` and `StandardDrawer`. Migrate the inline overlays in Flights, Travel Atlas, Excursion and the import wizard to the shared `Modal` (or a single `Dialog` primitive) so focus trap and Escape come for free.
- **Effort:** M

### UI-006 Most controls are smaller than the 44 px rule; some are under the 24 px WCAG minimum
- **Severity:** Medium
- **Location:** Design rule in AGENTS.md §8 and Design.md §5. Worst offenders: Travel Atlas edit and remove record buttons (`views/TravelAtlas.tsx:1131-1139`, `p-1 px-2`), Flights row actions (`views/Flights.tsx:2225-2233`, `p-1.5`), the stamp-search clear button (`views/Dashboard.tsx:1351`, `w-6 h-6`), and `GearSettingsTab` remove (`min-w-[28px] min-h-[28px]`).
- **Evidence:** Measured visible interactive elements (`button`, `a[href]`, `[role=button]`, `input`, `select`):

  | Page | Desktop: < 44 px / total (< 24 px) | Mobile 375: < 44 px / total (< 24 px) |
  |---|---|---|
  | Dashboard | 25 / 31 (1) | 14 / 23 (0) |
  | Flights | 36 / 38 (11) | 8 / 18 (0) |
  | Travel Atlas | 34 / 38 (11) | 21 / 29 (**10**) |
  | Settings | 33 / 44 (3) | 20 / 36 (2) |
  | Road Trips | 27 / 36 (2) | 14 / 28 (1) |

  At mobile width, 10 Travel Atlas targets fall below WCAG 2.2 SC 2.5.8 (24 × 24 px minimum).
- **Impact:** Users mis-tap on touch screens, especially on destructive buttons that sit close together, such as "Edit Record" and "Remove". This contradicts the project's own design rule.
- **Suggested fix:** Apply `min-w-[44px] min-h-[44px]` (or a shared `.wg-touch-target` class, which already exists in `AccommodationConfigurator`) to all icon buttons. Pad the hit area without changing visual size where space is tight.
- **Effort:** M

### UI-007 Layouts break at desktop and mobile widths
- **Severity:** Medium
- **Location:** `views/PlannerView.tsx` (filter bar around `:590-670`), `views/VacationCalendar.tsx` (header and tab bar around `:700-990`), decorative glows in `views/Dashboard.tsx` (`absolute … w-[40rem] h-[30rem]`) and `views/VacationPlanner.tsx` (`absolute top-0 right-0 w-36 h-36 …`).
- **Evidence** (measured `main.scrollWidth − clientWidth` plus screenshots):
  - **Planner @1440 px:** `<main>` overflows **114 px**, and 29 elements end past the viewport edge (right = 1553 px). The screenshot shows the filter row (search, All Years, All Months, destination) clipped: the destination select is cut to "Al…".
  - **Vacation Calendar @375 px:**
    - Overflow of 30 px, with 23 elements past the edge.
    - The screenshot shows the hero title truncated to "Va…" and the subtitle to "Aggre…".
    - The tab bar is clipped ("OPTIMIZ…").
    - The profile chip overlaps the mobile bottom navigation labels.
  - **Dashboard @375 px:** `<main>` is horizontally scrollable by **327 px**, caused by an unclipped decorative gradient (`w-[40rem]`, right edge 702 px).
  - **Planner-2 @375 px:** 8 decorative `w-36 h-36` blobs extend past the edge.
- **Impact:** Primary controls are unreachable or cut off on a standard laptop with the sidebar open, and mobile users get sideways scrolling and overlapping navigation. This contradicts Design.md §5 ("no horizontal clipping").
- **Suggested fix:**
  - Let the Planner filter row wrap (`flex-wrap`), or collapse filters into a popover below `xl`.
  - In the Calendar, make the tab pill scrollable or use icons only on narrow widths; drop the subtitle on mobile.
  - Add `overflow-hidden` to the containers of decorative absolute blobs.
  - Add a 375 px and 1280 px visual regression check.
- **Effort:** M

### UI-008 Two competing theme sources cause mixed fonts and grays
- **Severity:** Medium
- **Location:**
  - `index.html:36-110`: the Tailwind Play CDN plus an inline `tailwind.config` that remaps `gray: tailwind.colors.neutral`.
  - `tailwind.config.js`: the compiled build, where `gray` keeps the default cool gray.
  - `index.html:362`: `body { font-family: 'Plus Jakarta Sans', 'Inter', -apple-system… ; color: #181D27 }`.
  - `tailwind.config.js` sets `fontFamily.sans` to the SF Pro system stack.
  - `index.html:420`: `.leaflet-container { font-family: 'Inter' }`.
- **Evidence:**
  - Body text inherits **Plus Jakarta Sans**. Lighthouse shows the font file downloaded, and the screenshots render it.
  - The 117 elements with the `font-sans` class (including the `StandardDrawer` template's root) switch to **SF Pro**, so drawers and some cards use a different typeface from the page around them.
  - `text-gray-*` (461 uses) is defined twice with different hues: neutral from the CDN runtime stylesheet and cool gray from the compiled CSS. Which one wins depends on stylesheet order.
  - The body text color `#181D27` differs from the `light-text` token `#0F172A`.
- **Impact:** Typography and neutral colors vary between components and could change if load order changes. The design spec's declared font (SF) isn't what most users see.
- **Suggested fix:** Pick one source of truth. Remove the CDN script and inline config (also PERF-003). Set the intended font in `tailwind.config.js` and use `font-sans` on `body`. Move the `gray → neutral` decision into the compiled config if wanted, and replace `#181D27` with the token.
- **Effort:** S

### UI-009 211 class names refer to Tailwind colors that don't exist, so they have no effect
- **Severity:** Medium
- **Location:** e.g. `text-zinc-650` (28 uses), `text-zinc-550` (18), `text-zinc-850` (10), `bg-zinc-850` (6), `text-amber-550` (6), `border-zinc-650` (5), `bg-sky-505` / `bg-emerald-505` (`views/VacationCalendar.tsx:1063`), `from-purple-500 to-indigo-650` (`views/UserDetail.tsx:307`), across views and components.
- **Evidence:** 211 occurrences of shades that are not in Tailwind's palette. Looking them up in the compiled production CSS:
  ```
  .text-zinc-650{ → 0 matches   .text-zinc-550{ → 0   .bg-zinc-850{ → 0   .text-amber-550{ → 0   .bg-sky-505{ → 0
  .text-zinc-500{ → 1 (valid shade, for comparison)
  ```
- **Impact:** These elements silently fall back to inherited colors. For example, the Calendar's traveler color dots for Admin and Partner render with no background in one view, and gradients lose their end color. The result is visible inconsistency between views that were meant to look the same.
- **Suggested fix:** Replace these classes with valid shades or tokens. Add a lint rule (`eslint-plugin-tailwindcss` `no-custom-classname`) to catch unknown classes.
- **Effort:** S

### UI-010 Raw colors, sizes, radii and z-indexes widely bypass the design tokens
- **Severity:** Medium
- **Location:** app-wide (counts over TSX in `views/`, `components/` and `App.tsx`).
- **Evidence:**

  | Pattern | Count | Note |
  |---|---|---|
  | Raw palette classes (`bg/text/border-{slate,gray,zinc,blue,emerald,…}-N`) | **6,039** | vs 2,830 uses of `light-text*` / `dark-text*` tokens |
  | Gray families mixed | zinc 1,169 · gray 461 · slate 134 | three different neutrals for the same role |
  | Arbitrary hex classes (`bg-[#…]`, `text-[#…]`) | 35 in 7 files | e.g. `bg-[#fa9a1d]` instead of `bg-primary-500` (`VacationCalendar.tsx:796`) |
  | Hex literals in TSX props and styles | 111 | |
  | Arbitrary font sizes (`text-[Npx]`) | 51 | |
  | Arbitrary radii | 133 | only 4 values (`10/24/26/28px`), so they could be tokens |
  | Numeric z-index `z-10…z-50` | 168 | vs 49 uses of the token scale (`z-modal` etc.) required by AGENTS.md §8 |
  | Solid near-black dark surfaces (`dark:bg-zinc-900`, `dark:bg-gray-900`) | 16 | blocklisted by AGENTS.md §11.1; 10 of them in `Flights2.tsx` |

- **Impact:**
  - Dark and light themes and brand changes can't be applied centrally.
  - Neutrals and stacking order vary page to page; for example, a `z-50` element sits at the same level as `z-modal-backdrop` (50) and can overlap modals.
  - Each new screen drifts further from the spec.
- **Suggested fix:**
  - Add semantic tokens for neutrals (`surface`, `muted`, `border`), radius tokens (`rounded-card: 28px`) and one gray family.
  - Codemod the most common raw classes.
  - Enforce with `eslint-plugin-tailwindcss` and a custom rule banning `z-10…z-50` and arbitrary hex values.
- **Effort:** L

### UI-011 Several components exist two or three times for the same job
- **Severity:** Medium
- **Location / evidence (usage counts):**

  | Job | Implementations (uses) |
  |---|---|
  | Dropdown | `ui/Select` → GlassSelect (31), `GlassSelect` (35), `LiquidGlassSelect` (4); Settings also passes raw `<option>` children |
  | Date entry | `GlassDatePicker` (2), `ui/DatePicker` (4), `DateRangePicker` (13), native `type="date"` inputs (35 in 18 files) |
  | Buttons | `ui/Button` (130), `GlassButton` (32), hand-styled `<button>` (496 in 58 files) |
  | Modals and drawers | `ui/Modal` (23), `StandardDrawer` (1; the AGENTS.md template, used only by `CarriersTab`), inline `fixed inset-0` overlays (49 in 15 files) |
  | Tabs | `ui/Tabs` (4), `GlassSegmented` (10), plus bespoke pill tab bars per page (Planner, Atlas, Calendar, Settings, Flights) |
  | Text input | `ui/Input` (182), `GlassInput` (1), raw `<input>` (64) |
  | Error screens | `AppErrorBoundary` (theme-aware) vs root `ErrorBoundary` (`components/ErrorBoundary.tsx:38-46`: hardcoded `bg-slate-900 text-slate-100 … bg-sky-500`, ignores the light theme and the brand color) |
  | Whole pages | `PlannerView` vs `VacationPlanner` ("Planner-2", both in nav); `Flights`/`Flights2`, `RoadTrips`/`RoadTrips2`, `TripDetail`/`TripDetail2` (inventory §6) |

- **Impact:** The same control looks and behaves differently across pages (date pickers especially). Fixes to accessibility (UI-004, UI-005) and styling must be repeated in each copy, and they drift.
- **Suggested fix:** Standardize on one primitive per job: `Select`, `DateField`/`DateRangeField`, `Button` with variants, `Dialog`/`Drawer`, `Tabs`. Migrate page by page, delete the unused ones, and give the root error screen the theme tokens.
- **Effort:** L

### UI-012 Confirmations and error messages use different patterns from page to page
- **Severity:** Medium
- **Location:**
  - `window.confirm` (12 uses): `views/PlannerView.tsx:354`, `views/RoadTrips.tsx:469,874`, `views/TravelAtlas.tsx:529`, `views/Flights.tsx:3993`, `components/DailyPlannerBoard.tsx:532,798,1079`, ….
  - `alert()` (27 uses): e.g. `views/RoadTrips.tsx:492,717,787,867,894` and `views/Flights.tsx:1298`.
  - Custom glass confirm modals: Settings "Confirm Removal", "Wipe Database"; Flights delete and unbundle; `NewTripDrawer` Archive; the configurators' "Delete → Confirm".
  - Toasts: only Settings (`setSaveToast`) and `CarriersTab` (`setNotification`).
- **Evidence:**
  - Deleting a flight shows a styled in-app confirm. Deleting a land journey (`RoadTrips.tsx:874`) or an Atlas item shows the browser's native `confirm()`. Deleting a trip activity uses native `confirm()` again, with different wording.
  - Validation errors appear as native `alert()` boxes in RoadTrips and Flights, as inline red text in Auth and the configurators, and as console-only logs elsewhere (REL-007).
- **Impact:** The experience is inconsistent and jarring. Native dialogs break the glass aesthetic, block the page, can't be styled or translated, and on mobile show the page's URL. Users can't predict how errors are reported.
- **Suggested fix:**
  - Add a shared `useConfirm()` (built on the shared `Dialog`) and a toast service.
  - Replace `window.confirm` and `alert` everywhere, and show validation errors inline next to fields.
  - Document the patterns in Design.md.
- **Effort:** M

### UI-013 The same things are called by different names
- **Severity:** Low
- **Location:** across the UI (1,582 extracted strings; counts are case-insensitive whole words).
- **Evidence:**
  - **Trip:** "trip" 45, "expedition" 18, "journey" 17, "itinerary" 13, "voyage" 6.
    - The nav says "Planner", the page title says "Expedition Planner", and the tabs say "All Expeditions" (Planner screenshot).
    - Road trips are "land journey" (`RoadTrips.tsx`), "road trip record" (`:469`) and "travel ticket" (`:894`).
  - **Accommodation:** "stay" 21, "accommodation" 16, "lodging" 3 ("+ Add Stay", but "Save Accommodations").
  - **Delete actions:** "Archive" (which actually deletes; see the inventory), "Delete" 34, "Remove" 21, "Dismiss" 6. The same confirm text says "archive/remove" (`PlannerView.tsx:354`).
  - **People:** "Personnel" (Settings tab), "member" ("Enroll Member", "Save Member"), "traveler" (Calendar), "Explorer" (Dashboard fallback greeting).
  - **Nav labels:** "Planner" and "**Planner-2**" (`components/Sidebar.tsx:114,454`): an internal codename shown to users.
  - **Primary save labels:** "Save Changes", "Save Member", "Save Record", "Register to Atlas", "Save Boarding Stub", "Save Itinerary", "Create Journey", "Save Expedition", "Save Excursion", "Save Accommodations", "Consolidate".
- **Impact:** Users can't tell whether an "expedition", a "journey" and a "trip" are the same object, or whether "Archive" is reversible. Help text and search become ambiguous.
- **Suggested fix:**
  - Write a short glossary in Design.md (Trip, Stay, Flight, Road trip, Member) with one verb per action (Delete vs. Archive, which must actually archive).
  - Rename "Planner-2".
  - Standardize primary actions to "Save" / "Create <object>".
- **Effort:** S

### UI-014 Copy errors, jargon and mixed capitalization
- **Severity:** Low
- **Location and evidence:**
  - **Typo:** "Hours **Airward**" (`components/FlightyPassport.tsx:384`). This is not a word; "Hours Airborne" was probably intended.
  - **Pluralization:** `{filteredTrips.length} Trips Plotted` (`views/VacationCalendar.tsx:990`) renders "1 TRIPS PLOTTED" (Calendar screenshot).
  - **Inconsistent spelling:** "Drop-off Location / Drop-off Time" (`TripSetupBoard.tsx:1810,1845`) vs "Dropoff Location / Dropoff Time" (`transport/CarRentalForm.tsx:76,151`).
  - **Confusing tone and jargon:**
    - "Invalid credentials. Please verify design coordinates." (`views/Auth.tsx:57`)
    - "Authorize Session" (sign-in button, `Auth.tsx:312`)
    - "Provision Administrator Account"
    - "Unify All / Filter None" (Calendar, `:777`)
    - "Inspect Trip Logistics", "Got It"
    - "CHECKING SECURITY DATABASE..." (loading text)
    - "WANDERGRID SYSTEMS V2.2" (footer) vs the app version `v0.5-261010.8` shown in the sidebar
  - **Capitalization mixed on one screen:** the Planner header shows "Select" (Title Case) next to "NEW TRIP" (uppercase via `uppercase tracking-wider`). Bucket CTAs say "ADD CONFIRMED TRIP" and "CREATE NEW PLAN", while card text is sentence case ("No confirmed bookings yet").
  - **Verbose helper text against Design.md §4:** bucket subtitles such as "Travel history & logged memories" and "Ideas, drafts, & wishlist expeditions", and empty-state paragraphs.
- **Impact:** It looks unpolished, and error messages don't tell users what to do (for example, "check your email and password").
- **Suggested fix:** Fix the typo and pluralization. Use plain-language errors and labels ("Sign in", "Email or password is incorrect"). Pick one casing convention for buttons (Design.md suggests uppercase-tracked for primary CTAs, so apply it everywhere or nowhere), and trim helper copy per §4.
- **Effort:** S

### UI-015 Smaller semantic and keyboard issues
- **Severity:** Low
- **Location and evidence (axe, plus code):**
  - **`heading-order`** (moderate) on 10 of 18 checks: headings skip levels. The login page also lacks a `<main>` landmark and an `<h1>` (`landmark-one-main`, `page-has-heading-one`).
  - **`aria-prohibited-attr`** (serious): `aria-label` on a role-less `div` in the Planner (`.dark:bg-white/[0.06]`).
  - **`scrollable-region-focusable`** (serious): the Calendar's `.overflow-x-auto` timeline can't be scrolled with the keyboard.
  - **`empty-table-header`:** Flights table, `th.w-[2%]`.
  - **`button-name`** (critical): one icon-only tab button on Travel Atlas at 375 px has no accessible name (the label is hidden on mobile).
  - **Non-semantic click targets:** 18 `onClick` handlers on `div`, `span`, `td`, `tr` or `img` (for example, the Sidebar "next trip" card, `components/Sidebar.tsx:216`). These aren't keyboard reachable.
  - **Map tab stops:** on Flights, 5 of 25 Tab stops land on SVG map `path`s (react-simple-maps geographies) with no visible focus ring, which adds pointless tab stops before the content.
  - **Positive:** Dashboard and Settings Tab stops all showed a visible outline or ring (0 of 24 and 0 of 25 missing). Focus styles are generally present.
- **Impact:** These are minor to moderate barriers for screen-reader and keyboard users.
- **Suggested fix:**
  - Fix heading levels per page and add `<main>` and `<h1>` on Auth.
  - Give the Atlas mobile tab buttons `aria-label`, and the Calendar scroller `tabIndex={0}` with a label.
  - Convert clickable `div`s to `<button>`.
  - Set `tabIndex={-1}` on decorative map geographies.
- **Effort:** S

---

## Unverified

- **Contrast on glass surfaces.** axe returned 54–79 color-contrast "needs review" nodes per page because of translucent and glass backgrounds. I verified only the cases computed in UI-003. Many uppercase `text-2xs` labels on glass likely fail too, but these weren't measured against the actual composited background.
- **Dark mode.** All runtime checks ran in the app's default dark theme (demo settings `theme: 'dark'`). Light-mode contrast (UI-003's gray-400 figures) was computed from tokens, not rendered.
- **Modal focus trap on inline overlays.** My automated Tab-escape test could not reliably locate the overlay containers, which lack `role="dialog"`, so that result was discarded. UI-005's claim that the inline overlays lack focus management rests on the code (no focus or Escape logic in those files), not on the live test.
- **`gray` hue conflict.** Whether the CDN's `gray → neutral` remap or the compiled cool gray wins per element (UI-008) depends on runtime stylesheet order. I confirmed both definitions exist but did not sample the computed colors per element.
- **Screen-reader experience.** No VoiceOver or NVDA pass was done; findings come from axe and the code.

---

## Coverage

**Covered**
- **Design system:** sources reviewed and summarized above.
- **Token usage:** counted across all TSX; invalid classes checked against the compiled CSS.
- **Duplicate components:** usage-counted.
- **Feedback patterns:** confirmations, alerts, toasts and empty states.
- **Copy:** 1,582 strings spell-checked, with terminology counts.
- **Runtime:** responsive checks and axe on 9 pages × 2 viewports, screenshots of the broken layouts, touch-target and font-size measurements, a keyboard focus-visibility sample, and Lighthouse a11y on login.

**Not covered or limited**
- No light-theme runtime pass, and no tablet (768 px) viewport.
- Trip Detail, User Detail, and the modals and drawers' internals were not axe-scanned live. They need a selected trip or an opened modal; they were covered by code review of the shared components only.
- No screen-reader testing.
- No RTL or long-string (localization) testing.
- The URL-only "2" pages were not reviewed beyond counts.

---

## Top 5

1. **UI-001 + UI-002: pinch-zoom is disabled and text is tiny.** Zoom is off on every page, and 34–40 % of text renders under 10 px (down to 8 px) because of the 95 % root size plus `text-2xs`/`text-3xs`.
2. **UI-003: the primary button fails contrast.** White on brand orange measures 2.16:1 against a 4.5:1 requirement, and 273 light-mode `*-400` gray text uses sit around 2.4–2.6:1.
3. **UI-004: form labels aren't connected to their controls.** The shared `Input`, `Select` and `GlassSelect` don't link labels; axe reports 12 critical unnamed selects, and inputs rely on placeholders.
4. **UI-007: layouts break at common widths.** At 1440 px the Planner filter bar is clipped; at 375 px the Calendar header and tabs are cut off and overlap the bottom nav, and decorative blobs make the Dashboard scroll sideways by 327 px.
5. **UI-008 / UI-009 / UI-011: the design system is fragmented.** Two theme sources mix fonts and grays, 211 class names don't exist in Tailwind, and buttons, dropdowns, date pickers, modals and tabs each have two to four implementations, so the same control looks and behaves differently by page.
