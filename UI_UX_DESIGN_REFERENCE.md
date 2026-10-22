# UI/UX Design Reference: "rapport" CRM concept

Analysis of the CRM concept video by @_code_and_chill_ on Threads ("Sales pipeline CRM dashboard"). It is the reference for a ground-up redesign of WanderGrid with KokonutUI, Magic UI and BklitUI.

> **Status:** design reference for the **New pages** (§5.0), with decisions recorded on 2026-10-18 (§7). It changes no code.
>
> **Authority:** for the New pages, this document **wins over `Design.md`** wherever they conflict (surfaces, palette, type, layout). Every rule from `Design.md` and `AGENTS.md` that this document does not override still applies. §6 lists them.
>
> **Palette:** the New pages use **only the video's colours** (§1.4). They do not reuse or mix with the Golden Hour (`sunset-*`) palette or the liquid-glass tokens.

## 0. Source and method

| | |
| --- | --- |
| Source | `threads.com/@_code_and_chill_/post/DejdQ53EdS2` (the video is hosted on the Instagram CDN) |
| Format | 17.3 s, 720×1280 portrait, looping, with a cursor overlay. The UI is rendered at a **portrait-tablet viewport** (about 800 CSS px wide). |
| Scope of the capture | The video shows **one breakpoint only**. Every measurement below describes that tablet-portrait rendering. WanderGrid's redesign must be **responsive across desktop, tablet and mobile**. §2.4 extrapolates the desktop and mobile layouts from the concept's patterns, and those parts are design proposals, not observations. |
| Method | Paused frames sampled every 0.5–1.5 s, plus extra samples during transitions. Colours were read from decoded frame pixels with a canvas. The video is compressed, so treat the hex values as close (about ±3%) but not exact |
| Product in the video | "rapport", a sales CRM with seven pages: Overview, Pipeline, Customers, Schedule, Finance, Growth and Projects |

### Timeline of the recording

| t (s) | Screen | What happens |
| --- | --- | --- |
| 0.0–2.5 | **Overview** ("Sales Overview") | Static dashboard. The cursor rests on the Revenue card |
| 2.5–3.0 | → **Pipeline** | Cross-fade between pages. Kanban cards enter with a staggered fade-up, column by column and top to bottom |
| 3.0–4.5 | **Deal Pipeline** (kanban) | A card is dragged from Proposal and dropped on the **Won** drop zone at the bottom. A toast says "Fleet licence expansion won · $7,710 · Undo". A "+$7,710" delta floats above the Won zone. The header KPIs count to their new values |
| 4.5–6.0 | → **Customers** | Hover pill on the "Customers" tab, then a page cross-fade |
| 6.0–6.5 | **Customer Directory** (card grid) | The cursor moves to "Clara Vos" and clicks |
| 6.5–7.0 | → **Customer Information** | Progressive reveal: card shells appear first and their content fades in afterwards |
| 7.0–8.6 | **Deal modal** | An Interaction History card is clicked. The page blurs, and the card **morphs** (shared-element transition) into a centred modal in the same stage colour. "Move to Proposal" is clicked: the modal changes colour from yellow to green, the stepper advances and the probability changes from 20% to 45% |
| 8.6–9.5 | Modal closes | The content fades out first, then the solid green shape shrinks back into its card. The toast says "Support plan upgrade → Proposal · Undo" |
| 9.5–10.5 | Customer Information (settled) | Full profile, detail list, interaction history and tasks |
| 10.5–11.5 | → **Finance** (scrolled) | Cash flow, Aging and the Invoices table. The table's lower rows fade out into a "Show all 47" mask |
| 11.5–13.5 | **Invoice sheet** | A table row is clicked. A floating sheet slides in from the right over a blurred page. "Mark paid" swaps the document state with a cross-fade and stamps it "PAID" |
| 13.5–14.5 | Sheet closes | The row status is now Paid. The toast says "RP-2406 marked paid · $33,300 · Undo" |
| 15.0–16.5 | → **Growth** ("Growth Reports") | Stacked bars, a lead-source ring and a monthly bars chart |
| 16.5–17.3 | Loop | Cross-fade back to Overview |

### Frames that need clarification

The recording is fast and heavily compressed. The following details could not be confirmed:

1. **Drag lift styling (3.0–3.6 s).** The dragged card looks lifted, with a larger shadow and possibly a 1–2° tilt. The tilt is too subtle to confirm at this frame rate. → **Decided: include the tilt** (§7).
2. **The modal morph.** At 7.2 s the clicked card shows a cursor ripple and a solid colour fill before it expands. At 7.8 s compression ghosts the frame, so the scale-up shows as double exposures. It is not clear whether the content cross-fades during the morph or only after it. The best reading is that the content fades out, the shell morphs, and the new content fades in.
3. **The invoice sheet at 13.0 s.** The recording itself zooms in on the sheet, so the sheet fills the frame. At 12.3 s the sheet sits at about 55% of the viewport width. Treat the zoom as a camera move, not a UI state.
4. **The left dock has no hover or tooltip states** because the cursor never visits it. Magnification behaviour is unknown. → Use no magnification; give each dock icon a tooltip on desktop (inherited rule: `aria-label` on icon-only buttons).
5. **Schedule and Projects pages are never shown.** The Tasks Schedule card (month picker "October") is cut off at the bottom of Customer Information. → CalendarNew is designed from first principles using the patterns in this document.
6. **Dark mode is never shown.** The dock has a moon icon, so a theme toggle exists. → **Decided: a derived warm dark theme** (§1.4).
7. **Typeface.** It is a geometric grotesk (round "a" and "o", low contrast) that resembles *Outfit*, *Urbanist* or *General Sans*. The exact face is unconfirmed. → **Decided: Outfit** (§1.2).

---

## 1. Visual Language & Design System

### 1.1 Colour palette

The palette is warm and paper-like. Four saturated "ink" colours carry all the meaning, and surfaces are near-white rather than glass.

| Role | Sampled hex | Observed usage |
| --- | --- | --- |
| **Canvas** | `#EAE8DF` (mid), `#EEE3C5` (top glow) | A warm off-white page with a soft radial yellow glow at the top centre, fading to a neutral bottom. Very low saturation |
| **Surface (card)** | `#F4F2EC` | Large cards (Revenue, Hot deals, Aging). Slightly lighter than the canvas, so cards read through value contrast and shadow rather than borders |
| **Surface, inset** | about `#ECEAE3` | Nested panels inside cards (customer "Open pipeline / Last contact" box, kanban column bodies, segmented-control tracks) |
| **Ink** (primary text, dark fills) | `#181A1A` | Headings and numbers. The active nav pill, the dock, "+ New deal" and "Export CSV" buttons, toasts, and "Closing" stage cards |
| **Muted text** | about `#8F887C` | Labels under KPIs, meta text ("Closes Oct 22"), axis labels. A warm grey, never blue-grey |
| **Green** (pine) | `#2C5D4F` | "Proposal" stage cards, Team quota card, collected-cash line, positive chips ("+5% vs last month", "$52.8K weighted"), healthy progress bars |
| **Rust** (terracotta) | `#C7441E` | "Negotiation" stage cards, Revenue line and area fill, "Overdue / 3 late" chip, 90+ day aging, at-risk progress bars, Email lead source |
| **Mustard** (sun) | `#F0C94C` | "Qualification" stage cards, quota ring, highlight chips ("+$60.8K month", "$363.3K", "+4 this week"), the Undo button in toasts, favourite stars |
| **Stage: Won** | white card + green "✓ Won" | Won deals invert to plain surface with a small green check label |
| **Status: Draft / neutral** | grey dot + grey pill | Invoice "Draft", inactive segments |
| **Data-only accents** | blue, indigo, purple, green | Only for brand marks in the lead-source ring (LinkedIn, Discord, Slack, WhatsApp). They never appear in UI chrome |

**Principles**

- **Colour is a categorical encoding, not decoration.** One hue means one pipeline stage everywhere: kanban columns, Hot deals, interaction history, the stage-mix bar and the deal modal. When a deal changes stage, the colour of its card and modal changes with it.
- **A fixed order of four colours** (yellow, green, rust, ink) mirrors the funnel order (Qualification, Proposal, Negotiation, Closing). The Stage mix card shows the same four as a segmented proportion bar.
- **Saturated fills carry inverted text.** Cards in rust, green or ink use white text with 70%-opacity meta text. Mustard cards use ink text. This is a contrast rule, not a style choice.
- **No gradients on chrome.** The only gradients are the canvas glow and the chart area fill (rust fading to transparent).
- **Contrast.** Ink on canvas is about 14:1. White on rust is about 4.9:1 and white on green about 7.5:1. White on mustard would fail, which is why mustard uses ink text. The video's muted grey (about `#8F887C`) is only **2.9:1** on the canvas, which fails WCAG AA, so the token in §1.4 darkens it to 4.5:1.
- **Theme approach.** The video shows light mode only. The dark theme in §1.4 is derived from it (decision in §7).

### 1.2 Typography & hierarchy

There is one typeface (a geometric grotesk) at a few sizes, and weight does most of the work.

**Decided typeface: Outfit** (variable, weights 400–700), self-hosted from the app's own origin so the CSP needs no new font host. Use tabular figures (`font-variant-numeric: tabular-nums`) for every amount, date and count. The **11px floor** from `Design.md` still applies: 11px is for chips and counters only, and informational text is 12px or larger.

| Level | Approx. size / weight | Line height | Example |
| --- | --- | --- | --- |
| Page title | 36–40px / 500 | about 1.05, set on **two lines** | "Sales / Overview", "Deal / Pipeline", "Growth / Reports" |
| Hero metric | 28–32px / 500, tabular figures | 1.0 | "$1,014,640", "$405,090", "$53,010" (modal) |
| KPI value | 20–22px / 600 | 1.1 | "$112,560", "75%", "12" |
| Card title | 15–16px / 500 | 1.3 | "Revenue", "Hot deals", "Interaction History" |
| Deal card title | 17–18px / 600 | 1.2 | "Fleet licence expansion" (wraps to two lines) |
| Body / list value | 14px / 500 | 1.4 | "Tidewater Freight", "clara@tidewater-freight.com" |
| Meta / label | 12px / 400, muted | 1.3 | "Won this month", "Closes Oct 22", "First name" |
| Chip | 11–12px / 600 | 1 | "+5% vs last month", "3 late", "Paid" |

**Observations**

- **Editorial titles, compact data.** The two-line, medium-weight title (not bold) gives an editorial feel. Data underneath is dense and tabular.
- **Numbers dominate.** Each card leads with one large figure and an inline muted qualifier on the same baseline ("$1,014,640 won in 12 months · 0 of 12 at target").
- **Sentence case everywhere.** There are no all-caps labels except "INVOICE" on the invoice document.
- **KPI pattern.** An icon in a 40px white circle, then the value with an optional chip, then a muted label underneath. This "icon + value + label" triplet appears at the top of every page in groups of three.
- **Tables** use 13–14px text, an ink-coloured ID column (`RP-2400`), and a two-line cell (primary plus muted secondary, for example "Nov 15 / Paid Oct 16").

### 1.3 Surfaces & elevation

| Token | Observed value | Notes |
| --- | --- | --- |
| Radius: page cards | about 28px | Revenue, Hot deals, Aging, Invoices |
| Radius: deal cards and modal | about 20–24px | Nested cards are slightly tighter than their parents |
| Radius: inset panels | about 14–16px | Info boxes and aging bar slots |
| Radius: pills, chips, icon buttons | full | Every button is a pill or a circle. No square buttons |
| Border | none, or a white hairline at about 60% | Cards have a faint lighter top-edge highlight, not a dark outline |
| Shadow: resting card | very soft and wide (about `0 1px 2px rgb(0 0 0 / .04), 0 8px 24px rgb(0 0 0 / .04)`) | Barely visible. Separation comes mainly from value contrast |
| Shadow: coloured card | slightly stronger, tinted | Hot deals cards sit visibly above the parent card |
| Shadow: dragged / modal / sheet | deep (about `0 24px 60px rgb(0 0 0 / .18)`) | Only elements that are interactively elevated get real depth |
| Backdrop blur | **only on overlays** | The modal and sheet blur the whole page (about 16–24px) with a light, not dark, tint. Cards themselves are opaque: there is **no glassmorphism** on content |
| Depth hierarchy | canvas → card → inset panel / coloured card → floating (dock, toast) → overlay (modal, sheet) | Five clear levels |

### 1.4 Design tokens for the New pages (light and dark)

These values come from the video (light) and a derived warm dark theme. Define them as CSS variables holding RGB triplets, the way `tailwind.config.js` already defines its colours, under a **new namespace** (proposed: `rp-*`, after "rapport"). They must not reuse `sunset-*`, `primary-*` or the glass tokens. Arbitrary hex values in class names stay forbidden (`npm run lint:tokens`).

| Token | Role | Light | Dark | Text on it |
| --- | --- | --- | --- | --- |
| `rp-canvas` | Page background | `#EAE8DF` | `#171614` | `rp-ink` / `rp-paper` |
| `rp-glow` | Radial glow at the top of the canvas | `#EEE3C5` | `#2A2418` | — |
| `rp-surface` | Cards | `#F4F2EC` | `#211F1C` | `rp-ink` / `rp-paper` |
| `rp-inset` | Panels inside cards, segmented tracks, kanban column bodies | `#ECEAE3` | `#2A2824` | `rp-ink` / `rp-paper` |
| `rp-line` | Hairline separators (tables, lists) | `#DEDBD2` | `#34312C` | — |
| `rp-ink` | Primary text (light), ink fills: dock, dark buttons, toasts, "travelling now" cards | `#181A1A` | `#EDEAE3` (inverted: fills become light) | `rp-on-ink` |
| `rp-on-ink` | Text and icons on an `rp-ink` fill (inverts with it) | `#FFFFFF` | `#171614` | — |
| `rp-paper` | Text on green and rust fills | `#FFFFFF` | `#F2EFE8` | — |
| `rp-muted` | Labels, meta, axes | `#6E675C` (4.5:1, darkened from the video's `#8F887C`) | `#A39C8F` (6.6:1) | — |
| `rp-green` | Confirmed / upcoming; positive | `#2C5D4F` | `#3B7464` | `rp-paper` |
| `rp-rust` | Action needed; negative / overdue | `#C7441E` | `#C7441E` (unchanged: a lighter rust fails 4.5:1 with white text) | `rp-paper` |
| `rp-mustard` | Draft / planned; highlight chips; Undo | `#F0C94C` | `#F4D36A` | `rp-on-mustard` |
| `rp-on-mustard` | Text on mustard: always dark, in both themes | `#181A1A` | `#181A1A` | — |
| `rp-ochre` | Mustard for icons and small accents on light surfaces (3.8:1) | `#9A740A` | `#F4D36A` | — |

**Elevation tokens** (§1.3 values): `rp-shadow-rest` (cards), `rp-shadow-raised` (coloured cards), `rp-shadow-float` (dragged card, modal, sheet, dock, toast). In dark mode shadows are replaced by a 1px `rp-line` outline plus the lighter surface step, because shadows don't read on a dark canvas.

**Radius tokens:** 28px page cards, 22px deal or trip cards and modals, 16px inset panels, full for pills, chips and icon buttons.

**Near-black exception.** `AGENTS.md` §11.1 forbids near-black surface fills. The video's ink fills (dock, toasts, dark buttons, "travelling now" cards) are a deliberate part of this design, so the New pages allow them **only through the `rp-ink` token**, never `bg-black`, `bg-zinc-900` or a hex value.

### 1.5 Icons and logos (all New pages)

Icons and logos carry a lot of the concept's clarity: every KPI, toolbar button and list row has one. New pages use them consistently.

**Icons (Hugeicons only)**
- Import icons only from the adapter `components/ui/hugeicons.tsx` (stroke-rounded). If an icon is missing, add a named export there; never import `lucide-react` or another set.
- **Where icons are required:**
  - every icon-only button (it also needs an `aria-label`)
  - toolbar and dock tools
  - tab and segmented options where they help recognition, such as view modes and settings sections
  - settings rows and toggles: a leading 18px muted icon, through the `icon` prop of `RpRow` and `RpToggle`
  - section headings: a 14px icon on `RpSection`
  - empty states
  - KPI tiles: an icon in a 40px circle, per §1.2
- **Sizes:** 14px in section headings and meta lines, 16px in chips and tabs, 18px in rows, 20px in toolbar buttons and the tab bar.
- **Colour:** icons are `rp-muted` at rest and `rp-ink` (or `rp-on-ink` on ink fills) when active. Icons never carry status colour on their own: status uses the colour tokens and a label.
- **Compact tabs:** where space is tight (mobile), inactive tabs may show the icon and count only, with the name on the active tab (`hideTitle` on Swipe Tabs). The name stays the accessible label.

**Logos**
- Show the real logo wherever a carrier, operator, airline, hotel brand or service appears: route and journey rows, operator chips, bookings and integrations.
- Use `RpLogo` (`components/new/ui.tsx`). It tries `utils/carrierLogo.ts` in order (Brandfetch with the workspace key, then the airline-code image, Clearbit, then the favicon) and falls back to a relevant Hugeicons glyph (the mode icon for transport).
- Logos sit on a white chip (they are drawn for light backgrounds), with rounded 10px corners, or fully rounded in chips. They are 28px in chips and 36px in rows.
- A logo never replaces the text name in lists: show both.

---

## 2. Layout & Shell Architecture

### 2.1 Sidebar & navigation

There are two separate navigation systems.

**A. Primary nav: a horizontal pill tab bar under the brand row.**

- The tabs are text-only: Overview, Pipeline, Customers, Schedule, Finance, Growth, Projects.
- The **active** tab is a solid ink pill with white text.
- **Hover** shows a soft grey pill behind the label (visible at 5.0 s). The active pill appears to move between tabs, a classic shared-layout "magic pill".
- The page itself is the content. There is no separate sidebar of pages.

**B. A floating vertical action dock on the left edge.**

- It is a dark (`#181A1A`) capsule about 60px wide, vertically centred, overlapping the page gutter, and sticky while scrolling.
- Icons are stroke-style and white, about 20px:
  - Search, Add, Favourites, Calendar, Phone/mobile, Send, Share, Export/Upload
  - a divider
  - Settings and Theme (moon)
- This is a **global quick-action dock** for verbs, not destinations. The first candidate is KokonutUI **Tool Dock**, with Magic UI `Dock` as the fallback (see §4).

**WanderGrid navigation (decided).**

- **Desktop and tablet:** **grouped top tabs** in the video's pill style (Split Nav). There are six tabs: Dashboard, Trips, Flights (Road trips is a sub-tab inside it), Calendar, Atlas and Map. Settings, members and sign-out live in the **Account Menu**.
- **Mobile:** a **bottom tab bar** with 4–5 of those pages and "More". The action dock folds into a centre **"+" button** that opens the Command Palette's quick actions.

**Brand and user row (top).** The logo mark (an ink rounded square with "R") sits on the left with the wordmark "rapport". On the right are three 44px circular white buttons: Inbox, Notifications (a red dot shows unread items) and an avatar. There is no workspace switcher.

### 2.2 Header & command bar

Every page has the same header, top to bottom:

1. **Back button** (only on detail pages): a 44px white circle with an arrow, to the left of the title.
2. **Two-line title** on the left, with the **KPI triplet** to its right. At the captured tablet width the third KPI already wraps on some pages (Customer Information). §2.4 covers the other breakpoints.
3. **Toolbar row** (on list pages):
   - a search pill ("Search deals…", "Search name, company, city…")
   - filter chips (All · Enterprise · Mid-market · SMB), where the selected chip is ink
   - an avatar filter row (team members)
   - a **Board / List** or **Grid / Table** segmented toggle
   - a sort pill ("Last contacted")
   - icon buttons (Download, Export)
   - one dark primary pill: "+ New deal", "+ New customer" or "+ New invoice"
4. **Range controls** (Growth): a 3M / 6M / 12M segmented control and a dark "Export CSV" button, right-aligned above the content.

There is no visible command palette (⌘K). The dock's Search icon is the presumed trigger. Breadcrumbs are replaced by the single back circle.

### 2.3 Main content canvas

- At the captured tablet width the content column is about 760px with gutters of about 20px. The dock overlaps the left gutter and the edge of the cards.
- The page is a **single vertical stack of full-width cards** with two-column rows where it helps:
  - Team quota (about ⅓) beside Stage mix (about ⅔)
  - Profile (½) beside Details (½)
  - Lead sources (½) beside New customers (½)
- **Card anatomy** is consistent: a title on the left, then `···` and `↗` (expand) circle buttons on the right, then a hero number, then the visual.
- **Patterns observed:**
  - *Bento dashboard* (Overview, Growth): mixed-size cards.
  - *Kanban board* (Pipeline): fixed-width columns (about 290px) that scroll horizontally. Each column has a header (dot, name, count badge, total, `+`). Two **sticky drop zones** at the bottom are labelled "Won · Drop to win" and "Lost · Drop to lose".
  - *Card grid* (Customer Directory): two columns. Each card shows a favourite star, avatar, name, role, an inset metrics box, a health progress bar with a number, a tier chip, and mail/phone circles.
  - *Profile + definition list* (Customer Information): a detail list where each row has an icon, a label over a value, and a trailing circular action (edit, copy, call, open).
  - *Horizontal card rail* (Interaction History): stage-coloured deal cards that scroll horizontally.
  - *Data table* (Invoices):
    - Columns: ID, customer (avatar, name, contact), sortable Issued, Due (date plus muted status), right-aligned Amount, a status pill with a dot, and a `···` menu.
    - Rows are about 56px tall, with hairline separators and no zebra striping.
    - The bottom rows **fade out under a gradient mask** with a "Show all 47 ⌄" button.
- **Density** is medium-comfortable on cards (24px padding, 12–16px gaps) and denser in the table and the kanban.

### 2.4 Responsive behaviour: desktop, tablet and mobile (proposal)

The video shows only tablet portrait. The table below extends the concept to every breakpoint WanderGrid supports. It uses Tailwind's default breakpoints, which the repo already uses, and stays within `Design.md` §5: 44px targets, `px-1` mobile gutters, grids that stack, and dialogs that close on Escape.

| Tier | Width | Reference |
| --- | --- | --- |
| **Mobile** | < 640px (base) | 375–430px phones |
| **Tablet portrait** | 640–1023px (`sm`, `md`) | **What the video shows** (about 800px) |
| **Desktop / tablet landscape** | ≥ 1024px (`lg`) | Laptop, iPad landscape |
| **Wide** | ≥ 1536px (`2xl`) | Capped by the existing `max-w-[1680px]` shell |

| Element | Mobile | Tablet portrait (observed) | Desktop and wide |
| --- | --- | --- | --- |
| **Primary nav** | **Bottom tab bar** (decided): 4–5 main pages and "More", above the safe area | Grouped top pill tabs (6), scrolling horizontally if they overflow | **Grouped top pill tabs** (decided): Dashboard, Trips, Flights (+ Road trips), Calendar, Atlas, Map. Settings and members are in the Account Menu |
| **Action dock** | Folds into a centre **"+"** button in the bottom tab bar, which opens the Command Palette's quick actions | A floating vertical capsule on the left edge | The same capsule, sitting in the gutter outside the content column so it never overlaps cards |
| **Brand and user row** | Logo mark only (no wordmark). Avatar opens Account Menu. Inbox and notifications move inside the Account Menu | As observed | As observed, with room for a ⌘K search pill in the header |
| **Page title and KPIs** | The title stays on two lines. The KPIs become a horizontal **Momentum Rail** or a 3-up compact grid under the title | Title with KPIs beside it, wrapping | The title and all KPIs on one row. Each KPI may grow into a **Metric Card** |
| **Toolbar** | Search becomes a full-width pill. Filters become a horizontally scrolling chip row (`p-3 -m-3`). The primary action becomes full-width (`w-full sm:w-auto`) or moves into the dock | One wrapping row | One row: search left, filters centre, view toggle and primary action right |
| **Bento / dashboard** | One column. Every card is full width, in priority order | Mostly one column, with ⅓ + ⅔ and ½ + ½ pairs | A 6- or 12-column **Widget Grid** with 2–4 cards per row. Users may rearrange it |
| **Hot-deal style card grid** | A **Momentum Rail**: one card plus a peek, swiped horizontally | 3 columns | 4–6 columns, or a rail |
| **Kanban** | One column per screen using **Swipe Tabs**, one tab per stage. Drag between stages becomes a long-press "Move to…" menu, or the modal's stage stepper | Fixed-width columns about 290px, scrolling horizontally | All stage columns visible. Drop zones are fixed at the bottom of the board |
| **Directory card grid** | 1 column | 2 columns | 3–4 columns |
| **Detail page (profile + list)** | Stacked: profile, details, then rails. Sections may sit in **Swipe Tabs**. A **Scroll Index** on long pages | 2 columns (½ + ½) | 3 columns: profile, details, then activity or schedule |
| **Horizontal history rail** | **Momentum Rail** with snapping | Horizontal scroll | Wider rail, or a 2-row grid |
| **Data table** | Becomes a **card list**: each row is a card with its primary value and a status pill. Secondary columns are dropped | Full table, with the bottom rows fading out | Full table with more columns. The sheet can open **beside** it (split view) instead of over it |
| **Centred modal** | Becomes a **bottom sheet** (Smooth Drawer, Vaul snap points). The morph can still start from the card | Centred, about 540px | Centred, about 560–640px |
| **Right sheet** | Full-height bottom sheet (Smooth Drawer) | Floating right sheet at about 55% width | Floating right sheet of 420–560px, or a docked split panel on wide screens |
| **Toast** | Full width minus gutters, above the bottom toolbar | Bottom centre | Bottom centre, or bottom right |
| **Pickers** (date, time, number) | **Wheel Picker** | Popover calendar or Wheel Picker | Popover calendar |
| **Hover-only affordances** | None: every hover action needs a tap or long-press equivalent | Mixed | Hover states as observed |

**Rules for every tier**

- Design **mobile first** and enhance upward. Never ship a desktop layout that has merely been squeezed.
- Every gesture-heavy component (drag, flick, hold, tear) needs a **keyboard and plain-tap fallback**. The KokonutUI components listed here mostly ship with keyboard support, but check each one.
- Honour `prefers-reduced-motion`: morphs become fades and flick physics settle instantly.
- Verify each redesigned page at 375px, 768px portrait, 1024px landscape and 1440px+, in both light and dark.

---

## 3. Micro-Interactions & Overlays

### 3.1 Modals & drawers / sheets

| | Deal modal (centred) | Invoice sheet (right) |
| --- | --- | --- |
| Trigger | Click on a deal card | Click on a table row |
| Entrance | **Shared-element morph**: the card's coloured shell grows into the modal. The content fades out before the morph and the new content fades in after it | Slides in from the right edge, about 300–400ms, decelerating |
| Exit | The reverse morph: the content fades and the shell shrinks back to the card's position. If the stage changed, the colour changes too | Slides out to the right |
| Backdrop | Strong page **blur** (about 20px) with a faint light veil. No dark dimming | Blur with a light veil. The dock stays visible but blurred |
| Geometry | About 540px wide, centred, 24px radius, filled with the **stage colour** | A floating panel inset about 8px from the top, right and bottom edges, about 55% of the viewport wide, 24px radius |
| Header | Muted "Opened Sep 30, 2026" with a circular ✕ | "Invoice RP-2406" title, status chip and customer, with a circular ✕ |
| Body | Title, company, hero amount, a **5-segment stage stepper**, an inset metrics strip (Expected close · Probability · Weighted), assignee avatars with names, and a note row | A rendered invoice document card (an "invoice preview" pattern) |
| Footer | Inline, not sticky. Secondary outline pill "Open in pipeline" and primary light pill "Move to Negotiation ›", which advances the stage | Pill actions: "Mark paid" (ink), "Download" and "Copy link" (ghost). The available actions change with state |
| State change | The colour and stepper animate in place. The modal does not close | A cross-fade to the paid state. A rotated "PAID" stamp appears, the totals relabel, and "Mark paid" disappears |

### 3.2 Toasts (undo pattern)

- A dark ink pill at the bottom centre with an icon (🏆 for won, ✓ for done), a message with the amount, and a **mustard "Undo" pill button**.
- It appears after every mutation (drop to Won, stage change, mark paid). The toast persists across page changes and stays visible after navigating, so it is app-level, not per page.
- This is an **optimistic UI** pattern: the change applies immediately and the toast offers Undo instead of a confirmation dialog.

### 3.3 Popovers, tooltips & dropdowns

- The `···` buttons on every card and row imply dropdown menus. **No menu is opened in the recording.**
- There are no tooltips. The chart cursor is visible on Revenue, but no tooltip crosshair is rendered in the sampled frames.
- Filter and segmented controls change in place with no popover.

### 3.4 Motion & physics

| Interaction | Perceived behaviour | Suggested spec |
| --- | --- | --- |
| Page change | Cross-fade with a slight upward drift of the new content | 250–300ms, `easeOut` (`cubic-bezier(.2,.8,.2,1)`) |
| List and card entrance | **Staggered blur-fade-up** per card, about 40–60ms apart, top to bottom and column by column | Magic UI `BlurFade` with `delay = i * 0.05` |
| Detail-page reveal | The card shells appear first, then their contents fade in | Skeleton shell, then content `opacity` 0→1 over 200ms |
| Card → modal | A shared layout morph with a soft spring and no overshoot | `motion` `layoutId` with `type: "spring", bounce: 0.15, duration: 0.5` |
| Stage change in the modal | Background colour tween, stepper fill, and the numbers re-count | 300ms colour tween with `NumberFlow` for the figures |
| Drag (kanban) | The card lifts with a deep shadow. The target column gets a tinted fill and outline. A placeholder gap opens | `@dnd-kit` `DragOverlay` with a lift scale of 1.02 and a **1–2° tilt** (decided) |
| Drop to Won | The card collapses into the drop zone. A floating "+$7,710" delta rises and fades. The header KPIs **count** to their new values | Delta: `y: -12`, `opacity` 1→0 over 900ms. KPIs: `NumberFlow` |
| Sheet | A slide from the right with a fast deceleration | 350ms, `cubic-bezier(.32,.72,0,1)` (iOS sheet curve) |
| Hover | A soft background pill fades in behind nav items. Buttons darken slightly | 150ms |
| Press | Clicking shows a **circular ripple ring** at the cursor (seen at 7.2 s and 11.6 s) | **Not built** (decided): treated as a screen-recorder effect. Use a subtle press scale (0.97) instead |
| Charts | Static in the frames shown. No draw-in animation was observed | **No draw-in** (decided). Charts render in place; only numbers roll when data changes |

**Overall feel:** calm and physical. Durations are short (150–350ms) on chrome and longer (about 500ms) on spatial morphs, with springs that have very little bounce. Nothing loops or decorates, and every motion confirms a state change.

---

## 4. Component Mapping (KokonutUI first, then Magic UI; BklitUI for charts)

### 4.1 The KokonutUI-first rule

When redesigning any page or section, **check the KokonutUI shortlist (§4.2) first**. Use a Magic UI or BklitUI component only when no KokonutUI component fits. Build a plain (vanilla) component only when none of the three fits, and note why in the page's migration notes (§5.2).

**Charts are always BklitUI** (decided), styled with the `rp-*` tokens, unless a KokonutUI card (Metric Card, Spending Ring) is itself the whole widget. Recharts is not used on New pages.

Not every component will be used, and none has to be used on every page. The rule is about the **order you consider them in**, not a quota.

### 4.2 KokonutUI shortlist

The descriptions below come from KokonutUI's own docs metadata and registry, checked on 2026-10-18. Several components have new display names but old registry slugs; install by **slug**:

```bash
npx shadcn@latest add @kokonutui/<slug>
```

| Component | Slug | What it is | Best WanderGrid uses | Concept pattern it covers |
| --- | --- | --- | --- | --- |
| **Flick Card** | `card-flip` | A two-sided card you spin with a drag or a flick. Thickness, light and a floor shadow follow the angle. Its default content is an event ticket | **Boarding pass or ticket** (front: route; back: PNR, seat, gate). Passport stamps. Trip card front and back | Deal card detail |
| **Throw Deck** | `card-stack` | A pile of image cards you drag, flick off the top and send under the deck, with arrow keys and a details view | Destination ideas and wishlist triage. A trip photo stack. "Where next?" picks on the Dashboard | — (new) |
| **Widget Grid** | `bento-grid` | Dashboard widgets on a 6-column grid. You lift, drag and resize them with spring physics and full keyboard support | **The new Dashboard**: user-arranged widgets (next trip, leave balance, flight stats, map snapshot) | Overview / Growth bento |
| **Momentum Rail** | `carousel-cards` | A card rail you flick with momentum. It snaps on a spring, with cover-flow depth and parallax as you scroll. Image cards with a heart toggle | Upcoming trips rail. Stays and activities in Trip detail. Mobile KPI rail. Atlas "recently visited" | Interaction History rail, Hot deals on mobile |
| **Metric Card** | `metric-card` | A KPI card: scrub a day, drag a range or pick a segment; the number rolls, the line morphs and the breakdown follows. Supports pinned events | Distance flown, nights away or trip spend over time, with trips pinned as events | Revenue / Cash flow cards, KPI triplet |
| **Spending Ring** | `spending-ring` | A breakdown ring you spin like a dial. Flick it and it settles with a category under the marker. Shows change versus last month | Trip budget by category (flights, stays, food, transport). Leave days by type | Team quota ring, Lead sources ring |
| **Split Nav** | `morphic-navbar` | A nav bar that splits around the active link, with drag-to-scrub, flick projection and an optional compact fold | **Primary top navigation**. The compact fold covers mobile | Pill tab bar |
| **Swipe Tabs** | `smooth-tab` | Tabs with a swipeable panel, a drag-tracked indicator and spring physics | Trip detail sections (Itinerary, Stays, Packing, Notes). Kanban stages on mobile. Settings sections | Board/List toggles; mobile kanban |
| **Account Menu** | `profile-dropdown` | An account card that morphs into its own menu, with account switching, status, theme and hold-to-sign-out | The avatar menu: member switch, theme, Settings, sign out | Avatar button in the user row |
| **Command Palette** | `action-search-bar` | A ⌘K palette with nested pages, fuzzy matching and in-row progress for running actions | Global search (trips, flights, countries), quick actions (New trip, Log flight, Import), and the dock's Search button | Dock Search / ⌘K |
| **Smooth Drawer** | `smooth-drawer` | A bottom sheet on Vaul snap points that peeks at a summary and drags up for details | **The mobile form of every modal and right sheet**. Trip cost summary. Flight detail on phones | Deal modal / Invoice sheet on mobile |
| **Scroll Index** | `scroll-index` | A section rail for long pages, with one tick per heading that you hover, click or drag to scrub | Trip detail day-by-day itinerary. Settings. Atlas by region | — (new) |
| **Stack Panel** | `stack-panel` | An iOS-style settings stack: rows with values, switches and checks that push nested pages | **Settings** (Workspace › Integrations › API keys). Filter panels. Account Menu sub-pages | Detailed Information list |
| **Wheel Picker** | `wheel-picker` | An iOS-style wheel with multiple columns, optional wrap-around and controlled or uncontrolled value | Flight departure and arrival times. Dates on mobile. Leave day counts. Cabin class | — (form input) |
| **Particle Button** | `particle-button` | A status button for async actions. It shows a spinner, then a drawn check with a particle burst on success, or a shake on error | Save trip, Import flights, Run backup, Track flight | Primary dark pill (async) |
| **Hold Button** | `hold-button` | Press and hold to confirm. The fill drains back if you release early, and a check is drawn on completion | **The standard confirm for every permanent delete** (decided): trip, flight, road trip, member, restore over existing data, revoking a key | Destructive confirm |
| **Switch Button** | `switch-button` | A light/dark toggle: the sun folds into a moon while the new theme spreads from the button as a circle | Theme toggle in the dock and Account Menu. Wire it to the existing theme state through `theme` and `onThemeChange` | Dock moon icon |
| **Tear Button** | `tear-button` | Confirm by tearing off a paper stub, with paper tones and an optional reprint | **Not used for deletes** (decided: Hold Button everywhere). Kept on the shortlist only for a playful, non-destructive moment, if one comes up | — |
| **Morph Popover** | `morph-popover` | A button that grows into a small form, then shrinks into a confirmation once sent | Quick note on a trip, "Add city", feedback, quick-add an activity | Note row in the deal modal |
| **Undo Button** | `undo-button` | Starts an action with a timed window to undo it, and does the real work only if the window closes without an undo | Archive trip, mark flight as completed, change status: anything reversible | **Undo toast pattern** (§3.2) |

### 4.3 Full pattern map

| Pattern in the video | 1st: KokonutUI | 2nd: Magic UI | 3rd: BklitUI (charts) / primitives / existing repo |
| --- | --- | --- | --- |
| Left vertical action dock | Tool Dock (`toolbar`) | Dock | Existing `components/ui/dock.tsx`, `MapDock.tsx` |
| Top tab bar with a moving active pill | **Split Nav** | — | Existing `components/kokonutui/morphic-navbar.tsx` |
| Search / ⌘K | **Command Palette** | — | — |
| Avatar menu | **Account Menu** | — | — |
| Notifications | Notification Stack (`notification-stack`, not on the shortlist) | Animated List | — |
| Team avatar filter, assignee stacks | Team Selector (not on the shortlist) | Avatar Circles | — |
| KPI triplet with rolling numbers | **Metric Card** (large), Momentum Rail (mobile) | Number Ticker | `@number-flow/react` (existing) |
| Bento dashboard | **Widget Grid** | Bento Grid | — |
| Staggered card entrance | — | Blur Fade | `motion` variants |
| Revenue / cash-flow chart | **Metric Card** (when it is the whole card) | — | Bklit Area, Line or Composed chart |
| Quota ring / lead-source ring | **Spending Ring** | Animated Circular Progress Bar | Bklit Ring, Gauge or Pie chart |
| Stage mix / aging / stacked bars | — | — | Bklit Bar chart (stacked, with tracks) |
| Deal / trip cards | **Flick Card** (two-sided), **Momentum Rail** (lists) | Magic Card | Plain card with a status-colour token |
| Horizontal history rail | **Momentum Rail** | Marquee (decorative only) | — |
| Card → modal morph | — | — | `motion` `layoutId` with a dialog shell |
| Right sheet (desktop) / bottom sheet (mobile) | **Smooth Drawer** (mobile) | — | Right sheet built on `motion` (desktop) |
| Board/List, 6M/12M toggles, stage tabs | **Swipe Tabs** | — | — |
| Kanban drag and drop with drop zones | Throw Deck (card-pile triage only) | — | `@dnd-kit/*` (existing) |
| Undo toast | **Undo Button** (inline), plus an app-level toast host | Animated List | — |
| Async primary action | **Particle Button** | Shimmer Button | — |
| Destructive confirm | **Hold Button** (every permanent delete) | — | — |
| Theme toggle | **Switch Button** | Animated Theme Toggler | Existing `ThemePicker` |
| Inline quick form | **Morph Popover** | — | — |
| Settings rows with nested pages | **Stack Panel** | — | — |
| Long-page navigation | **Scroll Index** | Scroll Progress | — |
| Time / date / number entry | **Wheel Picker** | — | Existing date pickers in `components/ui/` |
| Table with fade mask and "Show all" | — | Progressive Blur | Table component (no library yet) |

### 4.4 Porting notes for KokonutUI components

- **Icons.** Most components import `lucide-react`. Map those icons to the Hugeicons adapter (`components/ui/hugeicons.tsx`) or pass icons in as props, so the app keeps one icon set.
- **Next.js imports.** `carousel-cards` (Momentum Rail) and `morphic-navbar` (Split Nav) use `next/*` imports. WanderGrid has no router, so replace links with `ViewState` callbacks.
- **Vaul.** Smooth Drawer depends on the shadcn `drawer` (Vaul) and `button` registry items.
- **Tokens.** Replace colour literals (`zinc-*`, arbitrary hex) and any arbitrary `z-[…]` with WanderGrid tokens so that `npm run lint:tokens` passes.
- **Demo data.** Several components default to demo content (event ticket, checkout order, sample article). Always pass real props.
- **Tracking.** Record each port, with its KokonutUI version (most are 1.0–2.0, dated October 2026), in a change registry like `docs/gev-changes.md`.

### 4.5 Ports already in `components/kokonutui/`

Only the port added with MemberNew is listed here; the other ports (Swipe Tabs, Hold Button, Particle Button and so on) are in the folder and are listed on the branches that added them. Merge this list when the branches meet.

| Component | Slug | File | Notes |
| --- | --- | --- | --- |
| Stack Panel | `stack-panel` v1.0.0 | `components/kokonutui/stack-panel.tsx` | `lucide-react` and `@/lib/utils` replaced by the Hugeicons adapter and `utils/cn`; `zinc-*` and `bg-black` replaced by `rp-*` tokens; the demo page removed; rows take an `icon` (18px), a `detail` that can be any node and `disabled`; the toggle is green when on; tap targets are 44px |

---

## 5. Application Feature Inventory Mapping Template

### 5.0 New pages: naming, URLs and migration

Every redesigned page is **built first as a new page named after the existing page plus `New`**. The original page stays untouched and live until the New page is approved.

| Existing view (code) | New page | File | URL (proposed) |
| --- | --- | --- | --- |
| `Dashboard.tsx` | **DashboardNew** | `views/new/DashboardNew.tsx` | `/dashboard-new` |
| `PlannerView.tsx` | **TripsNew** | `views/new/TripsNew.tsx` | `/trips-new` |
| `TripDetail.tsx` | **TripNew** | `views/new/TripNew.tsx` | `/trip-new/:id` |
| `Flights.tsx` | **FlightsNew** | `views/new/FlightsNew.tsx` | `/flights-new` |
| `RoadTrips.tsx` | **RoadTripsNew** | `views/new/RoadTripsNew.tsx` | `/roadtrips-new` |
| `VacationCalendar.tsx` | **CalendarNew** | `views/new/CalendarNew.tsx` | `/calendar-new` |
| `ExpeditionMapView.tsx` | **MapNew** | `views/new/MapNew.tsx` | `/map-new` |
| `TravelAtlas.tsx` | **AtlasNew** | `views/new/AtlasNew.tsx` | `/atlas-new` |
| `UserDetail.tsx` | **MemberNew** | `views/new/MemberNew.tsx` | `/member-new/:id` |
| `Settings.tsx` | **SettingsNew** | `views/new/SettingsNew.tsx` | `/settings-new` |
| `Auth.tsx` | **AuthNew** | `views/new/AuthNew.tsx` | `/auth-new` |
| App shell (`Sidebar.tsx`) | **ShellNew** | `components/new/ShellNew.tsx` | Wraps every `-new` URL |

**Clean-slate rule (most important)**

- **Design every New page from a blank canvas, using this document only.** Do not open, screenshot or imitate the existing page's design or layout.
- **What carries over from the old app is its features:** the data, actions and backend capabilities, found in `services/` (`dataService`), the `/api` endpoints, hooks and types. How the old page presents them does not carry over.
- **Nothing visual is ported by default.** That includes hero cards, statistics, KPI tiles, charts, widgets, banners, section order, and copy. An element is included only if it earns its place in the new design on its own merits. "It was on the old page" is never a reason to include it.
- **Process for each page:**
  1. List its features from the data and service layer: what the user can read, create, change and delete, and which integrations it calls.
  2. Decide, feature by feature, whether it belongs on this page, moves to another page, or is dropped. Record each drop in the page's migration notes, so it is a decision rather than an accident.
  3. Design the page from §1–§4, KokonutUI first.
- The existing view file names in the inventory below only identify which **features** a New page inherits. They are not design references.

**Rules**

- **Names.** The page component is `<Name>New`, exported by name (`export const FlightsNew`), using the user-facing name (Trips, Calendar, Atlas, Member) rather than the code name.
- **Reaching them (decided: separate URLs).** Each New page has its own `-new` URL beside the original. There is no feature flag. `App.tsx` already maps URL paths to views (see the `/flights-2` aliases), so each `-new` path is added to that mapping. The New pages render inside **ShellNew**, so the new navigation only appears on `-new` URLs. Nothing in the existing UI links to them until they are approved.
- **Shared pieces.** New components go in `components/new/` (KokonutUI ports in `components/kokonutui/`). New pages may import data hooks and services (`dataService`, `useWanderSync`, `utils/formatters.ts`). They must **not** import UI components from the original pages, and the original pages must never import anything from `views/new/` or `components/new/`.
- **Links into the map.** Pages that open the map on something use `mapLink()` from `utils/mapLinks.ts` (`?route=JFK-CDG`, `?trip=<id>`, `?focus=lat,lng,zoom`), never hand-built query strings. On migration only `MAP_PATH` changes.
- **Logic.** Reuse the data and service layer (`dataService`, hooks, formatters, types). Where an original page holds feature logic inline (data loading, handlers), move that logic into `hooks/` or `utils/` and have both pages call it. Never copy JSX, components, layout or styling from the original page.

**Migration once a New page is approved**

1. Point the original URL (for example `/flights`) and its `ViewState` at the New page.
2. Keep the `-new` URL as an alias so bookmarks still work.
3. Delete the original page and any components only it used.
4. Rename the file and component to drop `New` (`FlightsNew` → `Flights`), and update imports.
5. Run `npx tsc --noEmit`, `npm run lint:tokens` and the e2e suite.
6. Once every page is migrated, fold this document's tokens and rules into `Design.md` and retire the glass and Golden Hour tokens that are no longer used.

To make this cheap, each New page should take the **same props** as the page it replaces.

The view inventory below lists which **features** each New page inherits, and suggests patterns from the concept. It describes no old layout. The suggestions (KPIs, rings, rails and so on) are **new-design ideas to evaluate**, not elements to port; edit them freely. Leave **Owner** and **Status** for planning.

### 5.1 Concept → WanderGrid colour semantics (decided)

| Concept stage colour | Concept meaning | WanderGrid equivalent |
| --- | --- | --- |
| Mustard (`rp-mustard`) | Qualification (early) | **Draft / planned** trip |
| Green (`rp-green`) | Proposal (in progress) | **Confirmed / upcoming** trip |
| Rust (`rp-rust`) | Negotiation (needs action) | **Action needed**: unpaid stay, missing flight, leave conflict |
| Ink (`rp-ink`) | Closing (committed) | **In progress / travelling now** |
| White + ✓ | Won | **Past / completed** trip |

### 5.2 View inventory

| # | Features come from (file) | Features to carry (data and actions) | Closest concept pattern | KokonutUI first | Then Magic UI / Bklit / existing | Target layout paradigm | Responsive (mobile → tablet → desktop) | Migration notes / interaction checklist | Owner | Status |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | Shell → **ShellNew** (`App.tsx`, `Sidebar.tsx`) | Page navigation, theme, user | Top pill tab bar, left action dock, brand/user row, global toast | **Split Nav**, **Tool Dock**, **Account Menu**, **Command Palette**, **Switch Button** | Magic UI Dock; app-level toast host | Top bar + floating dock | Bottom tab bar with a centre "+" → grouped top tabs + side capsule → grouped top tabs, with the dock in the gutter | ☐ Six grouped tabs: Dashboard, Trips, Flights (+ Road trips), Calendar, Atlas, Map; Settings and members in the Account Menu ☐ The dock holds verbs (New trip, Search, Log flight, Theme) ☐ ⌘K opens the Command Palette ☐ 44px targets | | |
| 2 | Dashboard → **DashboardNew** | Travel stats, stamps, live flight, charts | **Overview**: KPI triplet, hero chart, "Hot deals" cards, quota ring, stage mix | **Widget Grid**, **Metric Card**, **Spending Ring**, **Momentum Rail**, **Throw Deck** ("Where next?") | Blur Fade, NumberFlow, Bklit Bar for the stage mix | User-arranged widget bento | 1 column + rails → mixed ⅓/⅔ → 6-column Widget Grid (drag and resize on desktop only) | ☐ Upcoming trips as a Momentum Rail in status colours ☐ Leave balance as a Spending Ring ☐ Distance and spend as Metric Cards with trips pinned as events ☐ `↗` on each widget links to its page | | |
| 3 | Planner → **TripsNew** | Trip buckets (draft, confirmed, past), filters | **Deal Pipeline** kanban with column totals and Won/Lost drop zones | **Swipe Tabs** (mobile stages, Board/List), **Undo Button**, **Hold Button** (delete), **Particle Button** (New trip) | `@dnd-kit` (existing), Avatar Circles | Kanban board ⇄ list | Swipe Tabs, one stage per screen with long-press "Move to…" → scrolling columns → every column visible with fixed drop zones | ☐ Columns = trip status ☐ Drag changes status with undo ☐ Drop zones Archive (undo) / Delete (Hold confirm) ☐ Column header count and total days or cost (built: count and total days) | | Built (see §5.4) |
| 4 | Trip detail → **TripNew** | Itinerary, stays, activities, packing, AI | **Customer Information**: profile + detail list + history rail + tasks schedule | **Swipe Tabs** (sections), **Scroll Index** (day-by-day), **Momentum Rail** (stays and flights), **Morph Popover** (quick note or activity), **Spending Ring** (budget), **Wheel Picker** (times) | `motion` layoutId; Bklit charts (optional) | Detail page: hero + list + rails | Stacked sections in Swipe Tabs → ½ + ½ → 3 columns with Scroll Index on the side | ☐ The trip card morphs into the hero ☐ Detail rows with trailing actions (edit, copy, open map) ☐ Rail of stays and flights coloured by type ☐ Activity schedule like "Tasks Schedule" | | |
| 5 | Trip quick view (`TripModal.tsx`, `NewTripDrawer.tsx`) → inside **TripsNew** / **TripNew** | Create and edit trips | **Deal modal**: stage-coloured, stepper, "Move to …" | **Smooth Drawer** (mobile), **Flick Card** (front: summary, back: booking refs), **Particle Button** (save), **Wheel Picker** (dates on mobile) | `motion` layoutId dialog | Morphing modal / bottom sheet | Bottom sheet with snap points → centred modal about 540px → centred modal about 600px | ☐ Stepper = Draft → Booked → Travelling → Done ☐ The primary action advances status in place and the colour follows ☐ Inline footer (Design.md §3.6) | | |
| 6 | Flights → **FlightsNew** | Flight log, import, tracker, stats | **Invoices table** + **Invoice sheet** + Finance KPIs | **Flick Card** (boarding pass, flip for PNR / seat / gate), **Smooth Drawer** (mobile detail), **Metric Card** (distance, hours), **Particle Button** (import / track), **Hold Button** (delete flight), **Wheel Picker** (times) | Progressive Blur mask; Bklit Bar / Line | Table + right sheet | Card list + bottom sheet → table + floating sheet → table + docked split sheet | ☐ **Table / Board view toggle** (decided): Table follows the video; Board is the Departure Board restyled in the `rp-*` palette and Outfit ☐ Row click opens a boarding-pass sheet ☐ Status pills: Scheduled / Landed / Cancelled ☐ "Show all" fade mask | | |
| 7 | Road trips → **RoadTripsNew** | Land and sea journeys | Same as Flights | Same as Flights (Flick Card as the ticket) | Same as Flights | Table + sheet | Same as Flights | ☐ Shares the journey sheet ☐ Mode icon column | | |
| 8 | Vacation calendar → **CalendarNew** | Leave days, holidays | "Tasks Schedule" month card (partly seen) + **Schedule** page (not shown) | **Spending Ring** (leave by type), **Wheel Picker** (day counts, dates on mobile), **Smooth Drawer** (day detail on mobile), **Undo Button** (cancel leave) | Bklit Heatmap (year view) | Calendar + side sheet | Agenda list + bottom sheet → month grid → month grid + side panel, or a year heatmap | ☐ The concept gives little guidance here ☐ Leave balance ring ☐ Click a day to open a sheet | | |
| 9 | Map → **MapNew** | Full-screen route map | **Not in the concept** | **Tool Dock** (map controls), **Swipe Tabs** (layers), **Smooth Drawer** (route detail on mobile) | Existing `MapDock.tsx`, Magic UI Dock | Full-bleed map + floating dock | Bottom toolbar + bottom sheet → side dock → side dock + side panel | ☐ Only adopt the chrome ☐ Keep the map performance rules (AGENTS.md) | | |
| 10 | Travel atlas → **AtlasNew** | Visited countries and cities | **Customer Directory** grid + Growth charts | **Throw Deck** (wishlist triage), **Momentum Rail** (recently visited), **Flick Card** (passport stamp, flip for dates), **Scroll Index** (regions), **Morph Popover** ("Add city") | Bklit Choropleth | Card grid + choropleth | 1-column cards → 2 columns → 3–4 columns + map | ☐ Country cards like customer cards (flag, visits, last visit, progress) ☐ Region filter chips ☐ Grid/Table toggle | | |
| 11 | Member detail → **MemberNew** | Leave entitlement, documents | **Customer Information** profile | **Spending Ring** (leave used by type), **Stack Panel** (documents), **Wheel Picker** (dates), **Hold Button** (remove member) | Animated Circular Progress | Profile + list | Stacked → ½ + ½ → 3 columns | ☐ Rows: passport, DOB, entitlement with trailing edit | | |
| 12 | Settings → **SettingsNew** | Workspace, integrations, members, backup | "Detailed Information" list rows | **Stack Panel** (nested settings), **Switch Button** (theme), **Particle Button** (backup / test integration), **Hold Button** (restore over data), **Scroll Index** | — | Grouped lists | Stack Panel full screen → Stack Panel in a card → section list + detail pane | ☐ Rows with a trailing action ☐ API keys masked, with copy ☐ Not shown in the concept | | |
| 13 | Auth → **AuthNew** | Sign in, register, reset | Not in the concept | **Particle Button** (sign in) | — | Centred card | Full-width card → centred card | ☐ Reuse the canvas glow and pill inputs | | Built (decisions 60–62) |
| 14 | Growth-style analytics (a section of **DashboardNew**) | Year-over-year travel stats | **Growth Reports** | **Metric Card**, **Spending Ring**, **Swipe Tabs** (3M/6M/12M) | Bklit stacked Bar, Line | Bento analytics | 1 column → 2 columns → Widget Grid | ☐ Distance by mode ☐ Trip sources ☐ Countries per year | | |

### 5.3 Per-page interaction checklist (copy for each page)

```
[ ] Built as <Name>New in views/new/, reached at its -new URL, original page untouched
[ ] Clean slate: designed without looking at the old page; features listed from the data and service layer; every included stat, chart or card justified on its own; dropped features recorded
[ ] Only rp-* tokens (§1.4): no sunset-*, glass or primary-* tokens
[ ] KokonutUI shortlist (§4.2) checked for every section; any vanilla component justified in the notes
[ ] Header: back circle (detail only) · two-line title · KPI triplet with NumberFlow
[ ] Toolbar: search pill · filter chips · view toggle · one dark primary pill
[ ] Entrance: staggered BlurFade (≤ 60ms step, ≤ 8 items animated)
[ ] Card anatomy: title · ··· · ↗ · hero number + muted qualifier · visual
[ ] Colour = status token only (no decorative fills)
[ ] Click card → shared-layout modal, or row → right sheet; both become a Smooth Drawer on mobile (Esc closes, focus trapped)
[ ] Reversible mutations use Undo Button / undo toast; permanent deletes use Hold Button
[ ] Empty state uses the shared empty component
[ ] 44px targets, aria-label on icon-only buttons, prefers-reduced-motion disables morphs
[ ] Icons per §1.5 (Hugeicons adapter only; rows, sections, tools, tabs) and logos wherever a carrier or brand appears
[ ] Gesture components have keyboard and plain-tap fallbacks
[ ] Responsive per §2.4: verified at 375, 768 portrait, 1024 landscape and 1440+, in light and dark
```

### 5.4 Migration notes per page

**TripsNew** (`views/new/TripsNew.tsx`, `/trips-new`; features from `PlannerView.tsx`)

- **Kept (features):** the three buckets (Planned, Confirmed, Past: a trip is Past by status or when its dates have passed); search over name, subtitle, description and destinations; year filter; archive and restore, with an Archived view; create a trip; edit a trip; delete a trip; open a trip's page (`onTripClick`); the totals.
- **Brought back:** the old creation wizard's three steps, **Trip basics, Transport and Stays**, are the New trip sheet (decision 33). Not brought: the wizard's draft recovery and Back-button handling, and its reconciliation of loose flights. Legs, stays and activities are also edited in the trip's edit sheet (decision 39); TripNew will have the full itinerary.
- **Dropped (decided):** the month and destination filters (search covers destinations; year stays); multi-select bulk archive (each card has Archive with Undo, and a drop zone does the same); collapsible buckets; the "All Expeditions" tab; the hero banner and the old statistics ribbon (replaced by three tiles that earn their place: trips coming, days away, places).
- **Changed on purpose:** trips with `hideInPlanner` (flight bundles) are hidden, as on the Calendar. The old Planner showed them.
- **Where the logic lives:** `hooks/useTripsData.ts` (data and writes) and `utils/tripsModel.ts` (buckets, timing, what a trip still needs). The original `PlannerView.tsx` keeps its own inline copy, untouched; when TripsNew replaces it, the old file is deleted, so nothing needs merging.
- **KokonutUI-first check:** Swipe Tabs (stage tabs on phones, Board/List toggle), Tool Dock (the tool bar), Hold Button (delete) and Particle Button (create and save) are used. A Throw Deck (`card-stack`) was tried for the trip details and dropped in favour of the video's deal modal (decision 31). Dragging has no KokonutUI equivalent (Throw Deck is a card pile, not a board), so `@dnd-kit` (already in the app) is used. Three small gaps are filled in `components/new/`: `UndoToast.tsx` (the ink Undo pill, §3.2), `trips/TripMenu.tsx` (a portal menu) and `fields.tsx` (form fields).
- **Keyboard and tap route for every drag:** the "···" menu has Move to…, Archive and Delete. Dragging is on for a mouse, and for a long press on touch, from 768px up; phones use the menu.

---

## 6. Rules for the New pages: what this document overrides and what still applies

**This document overrides** (for New pages only):

| Topic | Original rule | New pages |
| --- | --- | --- |
| Surfaces | `Design.md` §1, §3; `AGENTS.md` §9.1: glass everywhere (`GlassPanel`, `wg-glass-*`) | Solid `rp-surface` cards. Blur only behind modals and sheets. No `GlassPanel` |
| Palette | `primary-*`, glass tokens; Golden Hour `sunset-*` | **Only** the `rp-*` tokens (§1.4) |
| Near-black fills | `AGENTS.md` §11.1 forbids them | Allowed **only** through `rp-ink` (§1.4) |
| Typeface | System SF stack | Outfit (§1.2) |
| Page layout | "Planner Standard" (`Design.md` §2; `AGENTS.md` §9.2): icon + `font-black` title, gradient bucket banners | Two-line medium-weight title, KPI triplet, card anatomy (§2.2–§2.3) |
| Mobile header alignment | Title left, action right, controls centred | Same, except primary actions may move into the dock "+" (§2.4) |
| Inputs and selects | `INPUT_BASE_STYLE`, `GlassSelect` | Pill inputs in `rp-inset` with the same 44px height and focus ring. A New select component replaces `GlassSelect` on New pages; a raw `<select>` is still not allowed |
| Delete confirmation | `ConfirmHost` dialog | Hold Button (§4.2). Still always confirmed, as the Glossary requires |

**Still binding** (augmenting this document):

- **Formatting.** Dates and money only through `formatDate`, `formatDateRange` and `formatCurrency` (`utils/formatters.ts`). Never `toLocaleDateString`.
- **Z-index.** Only the named scale: `z-dropdown`, `z-sticky`, `z-modal-backdrop`, `z-modal`, `z-popover`, `z-toast`, `z-tooltip`. The dock uses `z-sticky`, sheets and modals use `z-modal-backdrop` / `z-modal`, menus use `z-popover`, and the undo toast uses `z-toast`. Rewrite KokonutUI's arbitrary `z-[…]` values on import.
- **Touch targets and labels.** At least 44×44px for every control, including chips, dock icons and close buttons. `aria-label` on every icon-only button.
- **Type floor.** 11px minimum, for chips and counters only. Informational text is 12px or larger. Pinch-zoom is never disabled.
- **Contrast.** Text meets WCAG AA (4.5:1, or 3:1 at 18px+). §1.4 is tuned for this. Check every new pairing.
- **Keyboard and motion.** Modals and sheets close on Escape, trap focus and return it to the trigger. Every drag, flick, swipe or hold has a keyboard and plain-tap equivalent. `prefers-reduced-motion` turns morphs into fades and settles physics instantly.
- **Empty states.** Use a shared empty-state component (a New version of `<EmptyState />` in `components/new/`).
- **Copy.** Radical simplicity (`Design.md` §4): no helper paragraphs, short sentence-case labels, action-oriented buttons. Use the Glossary terms (Trip, Road trip, Flight, Stay, Activity, Member, Archive / Restore, Delete, Sign in / Sign out).
- **Icons.** Hugeicons through `components/ui/hugeicons.tsx`, and the regular-weight `Plus` for add actions.
- **Modals.** Inline, non-floating footer. No nested elevated cards inside a modal: use `rp-inset` panels.
- **Mobile checklist.** `Design.md` §5: `px-1` gutters on mobile, horizontal scroll rows with `p-3 -m-3`, grids that stack, no hidden actions.
- **Feature work.** `CLAUDE.md` asks for new user-facing features behind a flag. The New pages are an **exception decided on 2026-10-18**: they are isolated on separate `-new` URLs that nothing links to, which serves the same purpose.
- **Verification.** Run `npx tsc --noEmit` and `npm run lint:tokens`. Check light and dark at 375, 768, 1024 and 1440px. Report a §11.3-style grep self-check, adapted to this document: no glass or `sunset-*` tokens, no arbitrary hex or z-index, no raw `<select>`.

---

## 7. Decisions log (2026-10-18)

| # | Question | Decision |
| --- | --- | --- |
| 1 | Typeface | **Outfit**, self-hosted |
| 2 | Dark mode | **Derived warm dark** theme (§1.4) |
| 3 | Colour meaning | Mustard = draft / planned, green = confirmed / upcoming, rust = action needed, ink = travelling now, white + ✓ = past |
| 4 | Glass versus this reference | **This reference wins** for New pages, augmented with every `Design.md` / `AGENTS.md` rule it doesn't override (§6) |
| 5 | Palette source | **Video colours only.** No Golden Hour or glass tokens |
| 6 | Desktop navigation | **Grouped top tabs**: Dashboard, Trips, Flights (+ Road trips), Calendar, Atlas, Map. Settings and members in the Account Menu |
| 7 | Mobile navigation | **Bottom tab bar** with a centre "+" for actions |
| 8 | Motion extras | **Card tilt while dragging: yes.** Click ripple: no. Chart draw-in: no |
| 9 | Permanent delete | **Hold Button everywhere** |
| 10 | Rollout | **Separate `-new` URLs**, no feature flag |
| 11 | Page names | User-facing `<Name>New` (DashboardNew, TripsNew, TripNew, FlightsNew, RoadTripsNew, CalendarNew, MapNew, AtlasNew, MemberNew, SettingsNew, AuthNew), ready to replace the originals once approved (§5.0) |
| 12 | Flight list | **Table / Board toggle.** Board is the Departure Board, restyled in the video's colours and type |
| 13 | Charts | **BklitUI** |
| 14 | Using the old pages | **Clean slate.** Map only features (data, actions, backend). Never port design, layout, hero cards, statistics or charts just because they existed (§5.0) |
| 15 | Chrome colour (MapNew review) | Nav, mobile tab bar and tool dock sit on `rp-surface`: light in light mode, dark in dark mode. Ink is kept for the selected state. The selected view pill takes its view's accent (All ink, Flights rust, Land & sea green, Scratch mustard) |
| 16 | Desktop menu bar (Atlas review) | The desktop/tablet menu bar (Split Nav) goes back to **ink pills**: dark in light mode, light in dark mode, with no shared backdrop or shadow behind the row. Supersedes decision 15 for that bar only; the mobile tab bar and the map tool dock stay on `rp-surface` |
| 17 | Map page layout (Atlas review) | The view selector (All, Flights, Land & sea, Scratch) sits at the bottom: bottom centre on tablet and desktop, above the tool dock on phones. The totals sit top-left, under the header. Search stays at the top |
| 18 | Map toolbar on phones (Atlas review 2) | On phones the map tool dock sits at the top, in the header row beside the theme toggle and avatar (the brand pill is hidden there); the view selector stays at the bottom, above the tab bar |
| 19 | Basemap labels (Atlas review 2) | Every vector basemap uses the Streets label density by zoom: countries to z9 (smaller from z2), states z5–8, cities z3+, towns z6+, villages z9+, other places z8+, no continent labels |
| 20 | Route colours on the New map | Default route colour is **Transport**: flights rust, rail ink (near-black on light basemaps, near-white on dark), road green, sea dashed in mustard (ochre on light basemaps). No legend. Gradient, Frequency and Status stay in Map settings. Stored as a New-map setting so the original map keeps its own choice |
| 21 | Atlas world map cities (Atlas review 3) | The world map can mark cities (those with coordinates) as rust dots, hover label, click opens the city; a Cities toggle in the map header shows or hides them (on by default, remembered). The country sheet shows what the log holds for the country (trips with dates that open the trip, flights landing there, road trips, last visit). Adding a city rejects text the geocoder can't place, with the error inside the popover |
| 22 | TripsNew page (Trips build) | One-line title "Trips", three tiles (Trips coming green, Days away ink, Places mustard), then the toolbar (Board / List toggle, search, New trip), year chips and an Archived chip. The board has three columns: **Planned** (mustard), **Confirmed** (green), **Past** (ink dot), each with its count and total days and a "+" that starts a trip in that status. Desktop shows all three, tablets scroll sideways, phones show one column at a time through Swipe Tabs whose selected pill takes the column's colour |
| 23 | Changing status | Drag a card to another column (mouse, or a long press on touch). The "···" menu offers Move to… for keyboard and phones. Every move shows the ink Undo toast. A trip whose dates have passed stays in Past until its dates are edited |
| 24 | Archive and delete | While a card is lifted, **Archive** and **Delete** drop zones rise at the bottom. Archive is undoable. Delete opens a sheet with a Hold button (decision 9). Bulk multi-select is dropped |
| 25 | Undo toast | The New pages' toast is an ink pill with a mustard Undo, about 6 seconds, at the bottom (above the tab bar on phones). It is `components/new/UndoToast.tsx`, meant to be shared by every New page |
| 26 | Trip cards | The whole card takes its status colour: **mustard** planned, **green** confirmed, white past. A trip under way is an **ink card** with a "Travelling now" chip. Confirmed trips starting within 90 days that have no flights or no stay show rust "Add flights" / "Add a stay" chips. The hero number is days to go, days left or days ago |
| 27 | Create and edit a trip | One sheet (right panel on desktop, bottom sheet on phones): status chips, name, destination, dates, members (when there is more than one) and notes. New trips have three steps (decision 33); editing is the basics only, and legs, stays and activities are edited on the trip page. On phones the "New trip" pill is hidden and the tab bar's "+" starts it. The shell's Trips tab and quick action now point to `/trips-new` |
| 28 | Tool bar (Trips and Atlas) | The Tool Dock is laid flat in the page header row: title on the left, dock on the right. **Trips:** Board, List · Search, New trip. **Atlas:** Grid, Rail (Countries and Cities tabs) · Search, Find in trips, Add. Search opens an inline field beside the dock that filters as you type (Escape clears it). Below 640px the dock wraps under the title. Shared as `components/new/PageToolbar.tsx`. Atlas "Add city" is now a small sheet |
| 29 | Past trips | A past trip's card shows the dates, not how many days ago it was |
| 30 | Status counts | Each status heading (column, list group, phone stage tab) has its icon (Planned clock, Confirmed suitcase, Past check) and a large count, with total days next to it |
| 31 | Trip details | Clicking a trip tile opens the **deal modal** of the reference video, not a card deck: a card in the trip's status colour (mustard planned, green confirmed, ink travelling, white past) that grows from the tile over a blurred page (a bottom sheet on phones). It has the dates and Edit / Close circles, the title and cities, the total cost as the hero number, a four-step stepper (Planned, Confirmed, Travelling, Done), a panel with Starts, Ends and Length, the members, a note, then **the first three** cities, transport legs, stays and activities, each with "+N more" that opens the trip page. Footer: an outlined **Open trip** and a dark primary **Move to Confirmed** / **Mark as done** (or Edit trip once done) that changes the status in place with Undo, and the colour follows. The tile's ↗ still goes straight to the trip page |
| 32 | Trip icon | The trip's icon is chosen with an **icon finder**: a search over the whole Hugeicons free set (about 6,700 icons), loaded on demand (`components/new/IconPicker.tsx`). It is stored in `Trip.hugeicon`; the older `icon` emoji is left alone because the original pages still show it. The icon appears on the trip's card and in its details |
| 33 | New trip steps | **1 Trip basics** (status, name, destination, dates, icon, members, notes), **2 Transport** and **3 Stays**. Steps 2 and 3 are optional and take any number of items, each with its logo, dates and cost. The step bar lets you go back to a step you have reached |
| 34 | Long lists | A status shows its first few trips (8 for Planned and Confirmed, 5 for Past), with a fade and **Show all N**. Expanded, **Past is grouped by year**: the newest years open until a screenful is covered, older years are collapsed rows ("2023 · 9 trips"), and **Show fewer** folds it back. A search or year filter lifts the cap so a match is never hidden. A trip dragged or moved into a capped status opens that status. Same in the List view (`components/new/trips/CappedTrips.tsx`) |
| 35 | Rows layout | A third view beside Columns and List: each status is a full-width **row** whose cards wrap onto as many lines as they need (about 2 to 4 across on desktop, 1 on phones), rows stacked down the page, with the same cap and "Show all" as decision 34. Drag and drop works between rows on tablets and desktop. The tool bar toggle is Columns, Rows, List |
| 36 | List view detail | On wide screens each list row is a table line with titles: **Trip** (name and destinations), **Dates**, **Length**, **When** (days to go or left), **Booked** (transport and stay counts, or a rust "No flights" / "No stay" / "Not booked"), **Cost** and **Who** (member initials), then ↗ and "···". On phones a row is the name, the destinations and one line of dates, length and cost. **Destinations are limited to two** wherever a trip is listed (cards and rows): "Kyoto · Osaka · +3" |
| 37 | Transport and stay accents | Transport icons are **rust** (as flights on the Map) and stay icons are **ochre**: on logo chips with no logo, in the list's Booked column and in the New trip lists. Not applied on status-filled cards, where they would clash with the fill (`components/new/trips/accents.ts`) |
| 38 | Column lanes | The lane behind the cards of a status is **darker than the page in light mode** (`rp-line`) and lighter than it in dark mode (`rp-inset`), so the cards always sit in a visible lane. `rp-inset` is nearly the page colour in light mode and must not be used for a lane there |
| 39 | Editing the itinerary | The edit sheet has four tabs: **Basics, Transport, Stays, Activities**. Each list shows what is already on the trip: tap a row to load it into the form below (heading "Edit …", **Save changes** / **Cancel**) or press X to remove it. The same form adds new ones, and activities can be added here (not in New trip). Everything is saved with the sheet's Save; existing items keep every field the form doesn't show |
| 40 | Destination lookup | Destination is a search field with suggestions (the app's place search, as on the Map). Picking a place fills "City, Country" and stores its map position, shown as a green tick; typing again clears the position. Free text still works and is geocoded on save |
| 41 | Leave and privacy | Basics has **Leave** (No leave, or one of the workspace's leave types; shown only when the workspace has leave types) and **Who can see it** (Private or Public). With two or more leave types, **Split across leave types** turns the chips into rows: a leave-type menu, a days field (halves allowed) and, for a trip that crosses a year, "Any year" or a year chip. **Add a type** adds a row with the days still unassigned, and a line shows "N of M days assigned" (rust when over; it is a hint, not a block, because weekends and holidays may not count). The first row is the trip's main leave type. Switching the split off keeps that type and drops the split |
| 42 | Cancelled trips | **Cancel trip** is in the trip menu (with Undo). Cancelled trips leave the board and appear under a **Cancelled** chip, listed with "Cancelled" in the When column; their menu offers **Restore as Planned**, Duplicate, Edit and Delete. The chip disappears when none are left |
| 43 | Sorting and duplicating | **Sort: Date** is a pill at the end of the filter row: Date (the board's own order), Name, Destination, Longest first, Most expensive. It applies to columns, rows, list, Archived and Cancelled, and is remembered. **Duplicate** (trip menu) makes a Planned copy named "… (copy)" with new ids for every leg, stay and activity, with Undo |
| 44 | Route colours, revised (MapNew review, 2026-10-21) | Supersedes 20. Flights take a **regional colour gradient** (origin region blending into the destination's) or **Frequency**; land and sea legs keep one colour each; past, upcoming and planning show in opacity, not colour. The "Transport" colour mode is gone |
| 45 | TripNew page (Trip build) | One trip at `/trip-new/:id`, opened from the Trips page. A header card in the trip's status colour (ink while travelling, mustard planned, green confirmed, white past) with icon, dates, name, first three cities, total cost or countdown, the four-step status bar, members and the primary "Move to …" action; then four count tiles (Days ink, Transport rust, Stays mustard, Activities green) and **Swipe Tabs** whose selected pill takes the section's accent: Itinerary mustard, Bookings rust, Costs green, Gear and Notes ink |
| 46 | TripNew sections | **Itinerary** is day by day (each leg on its departure and arrival day, each stay on check-in and check-out, activities by time) with logos and costs; **Bookings** lists every leg and stay with logos, references and an edit button; **Costs** shows the total, per person, per day and a transport / stays / activities breakdown with bars (no chart library yet); **Gear** is the packing list with progress and categories; **Notes** saves with a Particle Button. Every edit of legs, stays and activities opens the Trips edit sheet on the matching step |
| 47 | TripNew not yet carried over | AI guide, weather, route map, the old calendar and table sub-views, flight import and ICS export from the old trip page. The old page's "delete all stays" bug (it ignores which stay was chosen) is not repeated |
| 48 | TripNew Canvas | **Canvas** is a tab beside Itinerary: the whole plan on one grid, a row per day (two half-day slots each) with Transport, Stay and Activities side by side. A stay is one bar from its check-in afternoon to its check-out morning; unbooked nights show a dashed "No stay booked" bar (the arrival morning and departure afternoon don't count). Every chip and "Add" opens the trip sheet on its step. Phones stack one card per day. The tab pill is green; Costs, Gear and Notes are ink |
| 49 | From and To on transport | Both are **place search fields** with suggestions, tuned to the kind of transport: Flight searches airports first (the field keeps the IATA code, e.g. AMS), Train and Bus stations, Cruise and Ferry ports, Car rental and Own car cities. Suggestions show an icon for the kind of place, its region and the IATA code; the To field ranks places near the trip's destination first. A picked place saves its exact coordinates on the leg (a green tick shows it is on the map); typed free text still works and is looked up on save as before. Coordinates are kept for the same text, so a save no longer looks every leg up again |
| 50 | Transport mode accents | Each kind of transport has its own colour and icon, used for its icon, mode chip, logo fallback, IATA pill and map leg: **Flight rust, Train green, Bus ochre, Car rental ink, Own car plum, Cruise navy, Ferry sea**. Plum, navy and sea are new accent tokens (`rp-plum`, `rp-navy`, `rp-sea`), added because the original four accents cannot tell seven modes apart; use them only for modes and the Map tab. Ferry (ferry boat) and Cruise (ship) have different icons |
| 51 | Leg details and road-trip stops | The transport editor has a folded **More details** section: class, seat type, exit row, terminals and gates, aircraft registration (flights); vehicle, pick-up and drop-off (car rental); distance (worked out from the two places when empty), website, notes and custom fields. Car legs also take **stops along the way** (place search, kind, "Add to visited places"), which are added to the Atlas when saved, and only for legs whose stops changed. Removing a leg hands its price to another leg of the same booking |
| 52 | TripNew map | The trip on the New map engine (route-and-pins mode): legs as routes, airports, stays and stops as pins, framed to fit. Since decision 58 it is in the header card, and the tab beside it is the route planner (decision 56) |
| 53 | TripNew header stats and budget | Six tiles: Days, Nights booked (with "of N"), km travelled, Transport (with excursions), Stays, Activities. **Costs** has a target budget: type it once; a bar shows spent against it, green while under and rust with "$N over" when above |
| 54 | Canvas drag and drop | Activities, transport legs and stays can be dragged to another day (mouse, a long press on touch, or the keyboard). A leg or stay keeps its length and moves as a whole; each move saves at once and shows Undo. Stays that share nights sit side by side |
| 55 | TripNew in production | `/trip-new/:id` is served by the same app shell as the other New pages. Trips opened from the Trips, Map and Atlas pages go to TripNew (a flight with no trip still goes to Flights); the trip menu keeps **Open trip** for the original page. Nothing outside the New pages links to a `-new` URL |
| 56 | Route planner (TripNew, Route tab) | Replaces the earlier "route stops" list. The route is a **main journey** of legs (from, to, day, how: own car, rental, train, bus, ferry, cruise) that start where the last one ended, plus **day trips** from the places on the way. Under each stop: how many nights, its weather, and "Day trip from Amsterdam". A day trip (Amsterdam to Delft) has a day, a way of travelling and "Come back the same day", which adds the return leg. Each leg shows distance and time (estimated from the places: about 72 km, 54 min), and saving writes ordinary transports (tagged so the original trip page still reads them, day trips as excursions sharing one booking) and the trip's stops, so the whole journey shows on the map, the canvas and the itinerary. Flights stay under Bookings |
| 57 | Weather | A small pill with an icon and the temperature: the day's high and low when the day is within the next two weeks, otherwise how it is there now. Shown at every stop and day trip in the planner, on the route stops in the trip header, and on a place in the Map page. Open-Meteo, no key, cached for 30 minutes, silent when unavailable |
| 58 | Trip map in the header | The map sits in the trip's header card (beside the title on wide screens, below it on phones), on a **plain light or dark basemap** that follows the theme, with no overlays or animation; the person's own map settings stay on the Map page. Place names are in proper case everywhere (Paris, not PARIS; airport codes stay as codes) |
| 59 | Compact trip header and three tiles | The header is one tight card: dates and actions on the first line, name and total cost on the second, the stops with their weather, a thin status bar, then members and the main action, with the map beside it (about 15rem tall). The numbers are **three tiles**: Days (with nights booked), km (with legs and excursions), Stays (with activities). The tiles are filled with their accent (Days ink, km green, Stays mustard), with a tick on the nights line when every night has a bed. Supersedes the six tiles of decision 53 |
| 60 | AuthNew page (Auth build) | `/auth-new`, shown without the shell: a brand pill and the Switch Button theme toggle on the top row and one centred `rp-surface` card (full width with `px-1` gutters on phones, 28rem from 640px) on the canvas glow. Signed out it is the real sign-in page; signed in it is a **Preview** (mustard chip, close button) where submits send nothing and nobody is signed out. After a real sign-in it opens `/trips-new`. Listed in the dev-only links |
| 61 | AuthNew modes and fields | One card, four modes: **Sign in**, **Register** (Swipe Tabs as a segmented switch, shown only when public sign-up is open), **Set up WanderGrid** (first-run administrator, no tabs) and **Reset password** (behind `AUDIT_PASSWORD_RESET`, with Back to sign in). Pill inputs in `rp-inset` with a leading icon, a show/hide password eye and a confirm field when creating or resetting. Errors are an inset line with a rust icon, notices a green line. The server's 8-character rule is checked first on the client |
| 62 | Submit and demo | Submit is the **Particle Button** in controlled mode (pending, check with burst, shake on error) and the page leaves after the burst. **Auto-setup & demo run** is a second Particle Button under an "or" divider, shown on a fresh install or when sign-up is open. The demo seeding moved to `services/authDemo.ts` (`startDemo`), which the original Auth page now calls too |
| 63 | MemberNew page (Member build) | One member at `/member-new/:id`: a compact header (photo or initials, name, role chip, email, nationality, Edit circle), **three filled tiles** (Trips ink with coming and flights, Days away green with places, Days left mustard with "of N in year") and **Swipe Tabs**: Leave mustard, Trips ink, Places green, Documents rust, Settings ink (shown only to an admin or the member). On phones inactive tabs show icon and count only. The tab is remembered. Opened from the TripNew header's member names and from "My profile" in the Account Menu and the phone More sheet; back goes to the previous page |
| 64 | Leave on MemberNew | A plain-SVG **ring by leave type** (a stand-in for the Spending Ring port) with days left in the centre, year chips, and one row per type: used, planned and the policy allowance (or Unlimited). Figures come from `utils/leaveModel.ts`, which follows the calendar: the allowance and taken days are the member's own, a trip counts when it has a leave type or `allocations`, in the year it starts (split trips by `targetYear`), past trips as used and the rest as planned. **Left = allowance − taken − planned.** Days taken is the admin's record and is not added to past trips, so nothing counts twice. Types with no policy and no trips are not listed |
| 65 | Documents and Settings are Stack Panels | Both tabs use the ported **Stack Panel** (settings-style rows, nested pages, swipe or Back or Escape to return). Documents: Passport row with a coloured Valid / Expires soon / Expired chip, a nested page of the details with the number masked and an eye to reveal, and an edit row. Settings: Name, Email, Role, Weekend holidays (a nested page that saves on choosing), Leave allowance (admin), Password, Sign out (your own page) and **Remove member** (admin, not yourself). One edit sheet with a topic each: profile (photo, name, role), passport, password, leave allowance |
| 66 | Removing a member | A sheet with a **Hold button** and no Undo (decision 9). The server refuses removing yourself or the last admin; the page hides the row for yourself and shows the server's message otherwise. Trips keep the member's id in their participants |
| 67 | MemberNew not carried over | The old page's per-trip edit and delete buttons and "Add to Planner" for flight bundles (trips are edited on their own page), and the colour, emoji and photo choices the task mentioned: the app only stores a photo. Wheel Picker not used: dates use the same date fields as the trip sheets |
| 68 | Passport overview | **Overview** is the first tab and the default: a passport-style page (`components/new/member/PassportCard.tsx`). A navy cover strip with the expiry status and an edit button, then the identity page (photo, surname, given names, nationality, date of birth, issued by, issued, expires, number masked with an eye), then a **stamps** page: one tilted dashed stamp per **country** (never a city) from finished trips (first 6, then "+N more"). It is a summary, not a travel document; the Documents tab keeps the editable rows. Navy is a light blue in dark mode, so text on it flips to dark there |
| 69 | Documents layout | Documents is two cards from 1024px up (stacked below): the Stack Panel of passport rows on the left and a **validity tile** on the right, filled green, mustard (under six months) or rust (expired), with the expiry date, months or days left as a rolling figure, and a bar of the validity used between the issue and expiry dates. Without an expiry date the panel takes the full row |
| 70 | Settings layout | Settings is two Stack Panels side by side from 1024px up (stacked below): **Profile** (name, email, role, weekend holidays, leave allowance) and **Account** (password, then Sign out and Remove member in a separate group), so the page no longer leaves half the row empty |
| 71 | Places split | The Places tab has two groups, **Countries** (green icons) and **Cities** (ink icons), each with its count and last visit, the first 12 and "Show all". Cities are the visited places that are not country names. The green tile reads "N countries · M cities" |
| 72 | Flags and panel titles | Countries and cities on the Places tab carry the country's **flag** (a city takes its country's), and passport stamps show it too; codes come from the geocoded place, else the country's name (`utils/countryCodes.ts`, built from the browser's region names). The Stack Panel's centred title bar is hidden on its root page (`bare`), so Documents, Profile and Account match the other tabs; the bar and Back appear only on nested pages |
---

## 8. Review adjustments: what the user changed after MapNew, AtlasNew and TripsNew were built

These come from the user's review rounds on the first three New pages (2026-10-18 to 2026-10-21; PRs #17, #18, #19). Each item is a standing rule for the pages that follow (PlannerNew, TripNew, FlightsNew and the rest). Where an item changes something written earlier in this document, it says so. Items marked ◆ also have a row in the decisions log (§7).

### 8.1 Colour: use the accents, in moderation

- **The first build was too monotone.** Add accent colours from the palette, but not excessively: one accent per meaning, never decoration.
- **Fill the surface, not only the icon.** On the Trips board the Planned (mustard) and Confirmed (green) tiles are tinted with their accent. The Ongoing tile stays ink. A tinted icon alone read as too timid.
- **Selected pills take the accent of what they select.** Map view pills: All ink, Flights rust, Land & sea green, Scratch mustard. Atlas tabs fill with the accent of the list (Countries green and so on), as on the Map. The colour fades as the pill slides. ◆15
- **Inactive tab icons carry their accent colour** (Map: flights rust, land & sea green, scratch ochre; Atlas the same).
- **Stat tiles get accent icons in filled circles** (Atlas: Countries green, Cities ink, Wishlist mustard, Layovers rust).
- **Toggles turn green when on.**
- **Transport and accommodation icons use different accents:** transport rust, stays ochre.
- **Mustard is too faint for icons or lines on light surfaces.** Use `rp-ochre` there (3.8:1) and keep mustard on dark surfaces. Sea routes follow the same rule. ◆20
- **Contrast between canvas and containers must hold in both themes.** Trips lanes were distinct in dark mode but merged with the background in light mode; light mode needs its own lane fill. Check every container against the canvas in light *and* dark.

### 8.2 Chrome: nav, tab bar, tool dock

- **Light in light mode, dark in dark mode** for the mobile tab bar and the tool dock (they use `rp-surface`; ink was flipped). ◆15
- **The desktop/tablet menu bar is the exception:** ink pills, dark in light mode and light in dark mode, with no brighter backdrop or shadow behind the row. ◆16
- **The menu stays centred** between the brand and the right-hand buttons. A phone-only layout fix must not leak to larger screens (a stray auto margin once pushed it left).
- **No dark hairline borders on floating chrome.** The brand button, theme switch, avatar, view tabs, totals pill, tab bar and dock use a soft shadow instead of the dark-mode border that surfaces normally get.
- **Hover must not flash rectangles.** Hover only changes text colour. The pieces joining nav tabs stay constant, and tabs only separate on page change.
- **Page icons in the desktop menu bar** from 1024px up; text-only on tablets so it still fits.
- **The selected tool in the dock is a round ink plate**, matching the pill shape.
- **Mobile tab names:** icon and count on every tab; only the active tab shows its name.

### 8.3 Icons and logos

- **Icon-only is not enough where meaning is ambiguous.** Use clear, specific Hugeicons: Fit all `Maximize01`, full screen `ArrowExpand` / exit `ArrowShrink`, map settings `Settings04`, Map tab `MapsGlobal01`, airports only `Airport02`, runway detail `EditRoad`, group nearby airports `SquaresUnite`. For a page's modes reuse the icon the old page used (Land & sea: mountain).
- **Status chips carry icons everywhere a status appears** (chips, badges, pickers, legends): Visited check-circle, Live here house, Lived here history clock, Layover landing plane, Wishlist heart, Clear x-circle. Atlas and the scratch map share this one set. Planned, Confirmed, Ongoing and Past on Trips get icons too.
- **When no logo is known, show the mode's default icon** (for example the ferry icon for an unknown ferry or cruise operator; the same for stays). It applies to every use of `RpLogo`, including the Map's detail sheet.
- **Icons are searchable and customisable:** the Trips icon finder searches the whole Hugeicons set; use it for any user-chosen icon.

### 8.4 Layout and density

- **No wasted space in stat tiles.** When the stats sit above the content, each tile is a compact row (icon beside number). Beside a map they keep the larger stacked layout. Make key counts prominent.
- **Page titles are one line, each word capitalised** ("Travel Atlas").
- **Page toolbar.** Trips and Atlas have a toolbar that holds the view toggle, search and the "New" button. Do the same on later list pages.
- **Map:** view selector at the bottom, totals top left, search at the top; on phones the tool dock moves into the header row and the brand pill is hidden. ◆17 ◆18
- **Atlas:** the map takes half the width with the stats beside it (stats first on phones).
- **Cap long lists.** Past trips show the 5 most recent with a fade and "Show all N", then expand grouped by year (the current year open, older years collapsed). The cap lifts while a search or filter is active. Never give a lane its own scroll area.
- **Rows layouts wrap onto several lines**, they do not scroll horizontally.
- **Show the first 3 of anything long, then "+N"** (cities, transports, stays) in cards, modals and list rows. List rows show more detail than board cards but still limit destinations.
- **Don't show "N days ago" on past items.**
- **Forms with several concerns become steps.** New trip is a three-step flow: 1. Trip basics, 2. Transport, 3. Stays.
- **Detail modals follow the reference video, not a gimmick component.** The first trip detail used a KokonutUI card stack and was rejected; it was rebuilt as a clean modal showing transport and stays with logos, costs and dates.

### 8.5 Motion and numbers

- **Changing numbers roll.** When the selection changes (another route, another airport) the values animate with NumberFlow, like the totals pill; dates slide.
- **Route animation speed is constant** (2,200 km/s), so longer routes take longer to draw. All routes start together; the loop restarts after the longest.
- **Basemap labels** use Streets' density on every vector basemap. ◆19

### 8.6 Map-specific

- **Route colours by transport**, no legend. ◆20
- **Settings sheet:** each tab is only as tall as its content, Reset sits right below it and is reachable on mobile; sliders adjust without switching tab; rows are label-left, options-right on desktop and label-over-options on mobile.
- **Basemap picker:** previews fill the card with the name on a soft shade, grouped Auto / Light / Dark; picking a dark basemap switches the app to dark and a light one to light (one way only).
- **Relief shading follows the basemap lightness**, not the app theme. The globe glow matches the basemap (warm haze on light, blue glow and faint stars on dark). Flights on the globe are elevated arcs, hidden behind the horizon.

### 8.7 Feature parity on Trips (nothing the old page did is lost silently)

Editing legs, stays and activities; destination lookup with coordinates; leave entitlement, leave allocation (including a split across leave types) and Private/Public; cancelled trips (viewable and restorable); sort options; duplicate trip; Undo on archive; Hold Button on delete. The leave split is stored on the trip but does not yet change balances anywhere in the app.

### 8.8 How the user reviews

- Decisions are made in short numbered lists after looking at the running page. Expect 5–13 small changes per round, often with screenshots.
- The user asks for a commit after each round ("Commit these changes on feat/…").
- Every round is checked at 375, 768, 1024 and 1440 in light and dark, with `tsc`, `lint:tokens` and the §6 grep, and anything not seen on screen is stated.
