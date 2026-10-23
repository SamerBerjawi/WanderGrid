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

Each is ported for the New pages (rp-* tokens, Hugeicons adapter, real props, no `next/*` or `lucide-react`). Use these before porting anything again.

| Component | File | Used by |
| --- | --- | --- |
| Command Palette | `command-palette.tsx` | Shell |
| Flick Card (`card-flip`) | `card-flip.tsx` | FlightsNew boarding pass (the demo ticket is removed; `front` and `back` are required; a `backFaceClassName` lets the front take the journey's status colour while the back stays paper) |
| Hold Button | `hold-button.tsx` | Every permanent delete |
| **Metric Card** (`metric-card`, 2.0.0) | `metric-card.tsx` | DashboardNew: distance, nights and spend over time |
| Momentum Rail | `momentum-rail.tsx` | Rails (Atlas, DashboardNew on phones) |
| Morph Popover | `morph-popover.tsx` | Quick add |
| Particle Button | `particle-button.tsx` | Save, import, track |
| Scroll Index | `scroll-index.tsx` | Long pages |
| Smooth Drawer | `smooth-drawer.tsx` | Phone form of sheets (journey sheet) |
| **Spending Ring** (`spending-ring`, 1.0.0) | `spending-ring.tsx` | DashboardNew: leave by type |
| Split Nav | `split-nav.tsx` | Desktop menu bar |
| Stack Panel (`stack-panel`, 1.0.0) | `stack-panel.tsx` | MemberNew documents and settings rows |
| Swipe Tabs | `swipe-tabs.tsx` | Stage and section tabs |
| Switch Button | `switch-button.tsx` | Theme toggle |
| Throw Deck | `throw-deck.tsx` | Atlas wishlist, DashboardNew "Where next?" |
| Tool Dock | `tool-dock.tsx` | Page toolbar |
| Undo Button | `undo-button.tsx` | Inline undo |
| **Widget Grid** (`bento-grid`, 3.0.0) | `bento-grid.tsx` | DashboardNew |

Notes on the three new ports (registry sources were read from `kokonutui.com/r/<slug>.json`):

- **Widget Grid** keeps the engine (spring bodies, FLIP reorder, long-press and grip lift, resize, keyboard) and drops the demo widgets. Added: per-item `rows` (a number or a function of the span) and `narrowRows`, `tone` (accent fill), `onOpen` (the card's up-right arrow), `interactive` (only the grip lifts a widget that has its own gestures) and `flush` (body runs edge to edge), and a `rows` height in the layout so **width and height resize independently** (the corner handle moves on both axes; the arrow keys change the width with Left and Right and the height with Up and Down; on one column only the height changes). One column below 640px of container width (the span stays in the saved layout). Container queries are not in this app's Tailwind, so the column count comes from the measured width. It no longer dims the other widgets on hover.
- **Spending Ring** takes `categories` with an accent name (`green`, `rust`, `mustard`, `ink`, `sea`, `navy`, `plum`, `muted`) instead of Tailwind classes, a `format` for any unit and a `caption`. The month-over-month line and the card chrome are gone.
- **Metric Card** takes `periods` (`{ days, label }`), `valueFormat` and `suffix` for the rolling number (NumberFlow replaces the hand-made digit wheels), `formatValue` for text, dates through `formatDate`, an `accent`, `headerStart` (a slot for a metric switch), `breakdownColumns` and `smoothing` (a moving average for the drawn line, since travel is sparse; totals and day reads stay exact).

Charts are in `components/bklit/`: the choropleth (Atlas; DashboardNew adds a `ChoroplethRoutes` layer of great-circle arcs) and a reduced bar chart (`bar-chart.tsx`, FlightsNew, decision 84).

---

## 5. Application Feature Inventory Mapping Template

### 5.0 New pages: naming, URLs and migration

> **Status (2026-10-23): the cutover happened (decisions 200–213).** The New pages now own the clean URLs (`/`, `/dashboard`, `/planner`, `/trips`, `/trip/:id`, `/flights`, `/roadtrips`, `/map`, `/atlas`, `/calendar`, `/user/:id`, `/settings`) and ShellNew is the only shell there. Every `-new` URL in the table below still works and is replaced (`history.replaceState`) by its canonical path, query string kept. **Nothing was deleted:** the original pages, their shell (Sidebar, GoldenSidebar), the golden views, AmbientBackground and the old Auth live on under **`/classic`** (`/classic`, `/classic/planner`, `/classic/trip/:id`, `/classic/flights` ...). `/classic` has two deliberate entry points (the trip menu's **Open in classic view** in TripNew, and the **Classic interface** link at the foot of Settings) because the old pages still have features the New ones lack (§5.5); no other New link points there. Routing lives in `utils/routes.ts` (pure, unit-tested in `tests/unit/routes.test.ts`); `App.tsx` only holds the current route. The rest of this section is the history of the build-then-migrate plan: its "URL (proposed)" column is the old `-new` address, and migration steps 1–2 are done, 3–6 (delete the old pages, drop `New` from names, fold into `Design.md`) wait for the user's go-ahead.

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
| 2 | Dashboard → **DashboardNew** | Travel stats, stamps, live flight, charts | **Overview**: KPI triplet, hero chart, "Hot deals" cards, quota ring, stage mix | **Widget Grid**, **Metric Card**, **Spending Ring**, **Momentum Rail**, **Throw Deck** ("Where next?") | Blur Fade, NumberFlow, Bklit Bar for the stage mix | User-arranged widget bento | 1 column + rails → mixed ⅓/⅔ → 6-column Widget Grid (drag and resize on desktop only) | ☐ Upcoming trips as a Momentum Rail in status colours ☐ Leave balance as a Spending Ring ☐ Distance and spend as Metric Cards with trips pinned as events ☐ `↗` on each widget links to its page | | Built (see §5.4) |
| 3 | Planner → **TripsNew** | Trip buckets (draft, confirmed, past), filters | **Deal Pipeline** kanban with column totals and Won/Lost drop zones | **Swipe Tabs** (mobile stages, Board/List), **Undo Button**, **Hold Button** (delete), **Particle Button** (New trip) | `@dnd-kit` (existing), Avatar Circles | Kanban board ⇄ list | Swipe Tabs, one stage per screen with long-press "Move to…" → scrolling columns → every column visible with fixed drop zones | ☐ Columns = trip status ☐ Drag changes status with undo ☐ Drop zones Archive (undo) / Delete (Hold confirm) ☐ Column header count and total days or cost (built: count and total days) | | Built (see §5.4) |
| 4 | Trip detail → **TripNew** | Itinerary, stays, activities, packing, AI | **Customer Information**: profile + detail list + history rail + tasks schedule | **Swipe Tabs** (sections), **Scroll Index** (day-by-day), **Momentum Rail** (stays and flights), **Morph Popover** (quick note or activity), **Spending Ring** (budget), **Wheel Picker** (times) | `motion` layoutId; Bklit charts (optional) | Detail page: hero + list + rails | Stacked sections in Swipe Tabs → ½ + ½ → 3 columns with Scroll Index on the side | ☐ The trip card morphs into the hero ☐ Detail rows with trailing actions (edit, copy, open map) ☐ Rail of stays and flights coloured by type ☐ Activity schedule like "Tasks Schedule" | | |
| 5 | Trip quick view (`TripModal.tsx`, `NewTripDrawer.tsx`) → inside **TripsNew** / **TripNew** | Create and edit trips | **Deal modal**: stage-coloured, stepper, "Move to …" | **Smooth Drawer** (mobile), **Flick Card** (front: summary, back: booking refs), **Particle Button** (save), **Wheel Picker** (dates on mobile) | `motion` layoutId dialog | Morphing modal / bottom sheet | Bottom sheet with snap points → centred modal about 540px → centred modal about 600px | ☐ Stepper = Draft → Booked → Travelling → Done ☐ The primary action advances status in place and the colour follows ☐ Inline footer (Design.md §3.6) | | |
| 6 | Flights → **FlightsNew** | Flight log, import, tracker, stats | **Invoices table** + **Invoice sheet** + Finance KPIs | **Flick Card** (boarding pass, flip for PNR / seat / gate), **Smooth Drawer** (mobile detail), **Metric Card** (distance, hours), **Particle Button** (import / track), **Hold Button** (delete flight), **Wheel Picker** (times) | Progressive Blur mask; Bklit Bar / Line | Table + right sheet | Card list + bottom sheet → table + floating sheet → table + docked split sheet | ☐ **Table / Board view toggle** (decided): Table follows the video; Board is the Departure Board restyled in the `rp-*` palette and Outfit ☐ Row click opens a boarding-pass sheet ☐ Status pills: Scheduled / Landed / Cancelled ☐ "Show all" fade mask | | Built (see §5.4) |
| 7 | Road trips → **RoadTripsNew** | Land and sea journeys | Same as Flights | Same as Flights (Flick Card as the ticket) | Same as Flights | Table + sheet | Same as Flights | ☐ Shares the journey sheet ☐ Mode icon column | | Built (see §5.4) |
| 8 | Vacation calendar → **CalendarNew** | Leave days, holidays | "Tasks Schedule" month card (partly seen) + **Schedule** page (not shown) | **Spending Ring** (leave by type), **Wheel Picker** (day counts, dates on mobile), **Smooth Drawer** (day detail on mobile), **Undo Button** (cancel leave) | Bklit Heatmap (year view) | Calendar + side sheet | Agenda list + bottom sheet → month grid → month grid + side panel, or a year heatmap | ☐ The concept gives little guidance here ☐ Leave balance ring ☐ Click a day to open a sheet | | Built (see §5.4) |
| 9 | Map → **MapNew** | Full-screen route map | **Not in the concept** | **Tool Dock** (map controls), **Swipe Tabs** (layers), **Smooth Drawer** (route detail on mobile) | Existing `MapDock.tsx`, Magic UI Dock | Full-bleed map + floating dock | Bottom toolbar + bottom sheet → side dock → side dock + side panel | ☐ Only adopt the chrome ☐ Keep the map performance rules (AGENTS.md) | | |
| 10 | Travel atlas → **AtlasNew** | Visited countries and cities | **Customer Directory** grid + Growth charts | **Throw Deck** (wishlist triage), **Momentum Rail** (recently visited), **Flick Card** (passport stamp, flip for dates), **Scroll Index** (regions), **Morph Popover** ("Add city") | Bklit Choropleth | Card grid + choropleth | 1-column cards → 2 columns → 3–4 columns + map | ☐ Country cards like customer cards (flag, visits, last visit, progress) ☐ Region filter chips ☐ Grid/Table toggle | | |
| 11 | Member detail → **MemberNew** | Leave entitlement, documents | **Customer Information** profile | **Spending Ring** (leave used by type), **Stack Panel** (documents), **Wheel Picker** (dates), **Hold Button** (remove member) | Animated Circular Progress | Profile + list | Stacked → ½ + ½ → 3 columns | ☐ Rows: passport, DOB, entitlement with trailing edit | | |
| 12 | Settings → **SettingsNew** | Workspace, integrations, members, backup | "Detailed Information" list rows | **Stack Panel** (nested settings), **Switch Button** (theme), **Particle Button** (backup / test integration), **Hold Button** (restore over data), **Scroll Index** | — | Grouped lists | Stack Panel full screen → Stack Panel in a card → section list + detail pane | ☐ Rows with a trailing action ☐ API keys masked, with copy ☐ Not shown in the concept | | Built (see §5.4) |
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

**DashboardNew** (`views/new/DashboardNew.tsx`, `/dashboard-new`; features from `Dashboard.tsx`, `GoldenDashboard.tsx` and the data layer; rows 2 and 14)

- **Kept (features):** travel totals (distance, flights, nights away, trips, countries, cities); the stamp collection and the landmark-sticker progress, with the rank; the live flight today and the next or current trip (open a trip from anywhere); upcoming and recent trips; leave by type for the signed-in member or another one, with the trips that use it and a way into the member's page; trips, distance, nights and spend over time against the previous period (3M / 6M / 12M) and per year (the Growth section); the Atlas wishlist as "Where next?" (mark as visited from the deck).
- **Moved:** Track flight stays on the Flights page until FlightsNew's track panel is routed (the Up next card links there); stamp search and region filter, stickers grid and country detail live on the Atlas; the world map is the Map page.
- **Dropped (decided):** the Expedition Map card's layers and its 2D/3D toggle (replaced by the simplified World widget; the Map page is one tap away), the welcome strip with the live clock, the achievement milestones, the cabin-class donut, the top airports and airlines lists, the longest and shortest flight cards, the earth-orbits hero and the old flight trend chart (replaced by the Metric Card).
- **Not carried over:** countries per year (visit dates are too sparse to chart).
- **Where the logic lives:** `hooks/useDashboardData.ts` (loads trips, flights, road trips, visited places, members and leave types; refreshes on `wandergrid_db_updated`) and `utils/dashboardModel.ts` (legs and distance, nights, daily series, yearly rows, what is next, leave by type). The original `Dashboard.tsx` keeps its own inline copy, untouched. In real mode the page reads the same endpoints as the old one (`/trips`, `/flights`, `/roadtrips`, `/visited`, `/users`, `/entitlements`) and writes only `PUT /visited/:id` ("Been there").
- **KokonutUI-first check:** Widget Grid (the page), Metric Card, Spending Ring, Momentum Rail (phones) and Throw Deck are used. Bklit Bar is the by-year chart. Tiles for upcoming trips on wider screens and the passport stamps are plain components in `components/new/dashboard/`: no KokonutUI component covers a row of status tiles or a stamp list.
- **Keyboard and tap route for every gesture:** each widget's grip lifts it with Space, the arrow keys move it and Space drops it (Escape cancels); the resize handle takes the arrow keys; the ring turns with the arrow keys and a tap on a legend row; the chart reads days with the arrow keys; the deck has previous and next buttons.

**FlightsNew** (`views/new/FlightsNew.tsx`, `/flights-new`; features from `Flights.tsx`, `useFlightLog`, `DepartureBoard`, `FlightImportWizard`, the flight importer and tracker)

- **Kept (features):** the flight log with search, time (all, upcoming, past), year, class and status filters, a "No trip" filter and sorting; add, edit and delete a flight; trip assignment (move to a trip, take off a trip, several at once with Select); file import (CSV, Excel, JSON) with duplicate detection, and the old column-mapping wizard behind "Map columns"; export (CSV, Excel, JSON, AirTrail JSON) of what is shown; live status for a flight (flight tracker engines, with "Save to this flight"); look up a flight by number; totals (flights, distance, hours, airports, airlines, countries); airline logos; place search for airports; show a flight on the map.
- **Dropped (decided):** the hero bento; per-column filter popups (replaced by the filter row); the new-flight draft kept in `localStorage`; the original import wizard's backup restore and its merge/overwrite choices for duplicates (the import sheet skips duplicates). Brought back in the second round: journeys with a timeline and the seat map, grouping by year, column mapping on import, live tracking, and charts with a routes map (decisions 80–84).
- **Where the logic lives:** `hooks/useFlightLog.ts` (loading, filters, and the whole-record writes `saveJourney`, `assignJourneys`, `deleteJourneys`, which keep every field of a flight, unlike its form-based `saveFlight`) and `utils/journeysModel.ts` (status, distance, length, sort and totals; mode-aware). The table, board, sheet, editor and import live in `components/new/journeys/` and take a `JourneyRecord` (`{ flight: Transport, trip }`), so **RoadTripsNew reuses them**: give it its own data hook, `modes` for the editor, and its own noun.
- **KokonutUI-first check:** Flick Card (boarding pass; ported for this page), Smooth Drawer (phone sheet), Hold Button (delete), Particle Button (save, import, track, look up) and Tool Dock (toolbar) are used. Metric Card was not ported: three filled tiles are cleaner. The leg form is the trip sheets' transport form, extracted as `components/new/trips/LegForm.tsx`, not copied.
- **Not verified:** a successful live-status result (no flight data keys or network in the sandbox: the clock-based progress, the "Now" card and the error path were seen, but not a transponder position or gate data), and the real-mode API (read from `server.js` and `dataService`, but not run against Postgres). The original `FlightImportWizard` is no longer used by this page.

**RoadTripsNew** (`views/new/RoadTripsNew.tsx`, `/roadtrips-new`; features from `RoadTrips.tsx`, `dataService.getRoadTrips`, the route-segment import)

- **Kept (features):** trains, buses, car rentals, your own car, cruises and ferries; search; time (all, upcoming, past), year, **mode**, operator and status filters, "No trip"; sort (date, operator, route, longest, furthest, priciest); add, edit and delete (Hold Button, with the delete sheet); trip assignment with Undo, several at once with Select; **create a trip from journeys**; **stops along the way** (synced to visited places); distance and time from the places (road route for car, bus and rental, an estimate at each mode's average speed otherwise); stats; import from CSV, Excel and JSON; export (CSV, Excel, JSON); **From a trip's route** (the old "detect route segments" import: one journey between each pair of stops of a trip's route planner, trimmed before saving).
- **Same components as Flights, mode-aware:** the table, the hero, the detail sheet, the editor, the timeline, the import wizard and the routes map are the Flights ones. Land and sea use **place names, not codes** (`placeCode(value, mode)`), hide the flight-number lookup, live tracking, seat map and airline filter, and use the operator logo with the mode icon as fallback. The hero (`kind="land"`) counts journeys, kilometres, hours travelling and spend, and breaks down operators, places and **mode**.
- **Added later:** Length (under 1 h, 1 to 4, 4 to 12, over 12) and Cost (none, under 50, 50 to 200, 200 and over) filters; stops can be dragged by a grip (mouse, long press on touch, keyboard) as well as moved with the up and down buttons.
- **Footprint:** the old CO2 chart is replaced by a **Carbon footprint strip** in the hero of both Flights and Road trips (decision 111). **Dropped (decided):** the hub's map/chart tabs (the hero has the map); the old page's own filter popups.
- **Data:** `hooks/useRoadTripLog.ts` reads non-flight records from trips and the independent ones in the flights collection, **merging the copies the old page wrote twice** (same id in both) and removing the stale one on the next write.
- **Trip sync (both ways):** a journey added to a trip anywhere (the trip's own page or sheets) appears in Road trips because the page reads every non-flight leg of every trip; **Create trip** (row menu, sheet, timeline, Select) and **Add to trip / take off a trip** (with Undo) move journeys between a trip and "no trip" in one transaction. "Log a road trip" is in the quick actions.
- **Not verified:** the real-mode API was run against the real server on an in-memory database (load, create trip, records moving out of the independent list), but not against PostgreSQL. Seen in light and dark at 1440, 1024, 768 and 375 (not every pair, all four widths and both themes between them); import (CSV with a Mode column), export (CSV, Excel, JSON), From a trip's route, create trip and add to trip were run in the browser.


**SettingsNew** (`views/new/SettingsNew.tsx`, `/settings-new`; features from `Settings.tsx`, `CarriersTab.tsx`, `GearSettingsTab.tsx`, `dataService` and the settings, backup, jobs and integrations routes; row 12)

- **Kept (features):** see decision 137. Every old tab is a section; nothing the old page could change is lost except what that decision lists as dropped.
- **Where the logic lives:** `hooks/useSettingsData.ts` (settings, members, holiday calendars and their writes; refreshes on `wandergrid_db_updated`), `utils/settingsModel.ts` (which keys are set and where they come from), `utils/backupModel.ts` (what a backup holds, counting and parsing a file), `services/integrationTest.ts` (tests) and, in `services/mockDb.ts`, `runServerJob`, `testApiKey` and a progress callback on `waitForJob` and `exportFullState`. The panes are `components/new/settings/*Pane.tsx`; `SettingsParts.tsx` has the shared header, tiles, chips, a text sheet and a Hold sheet. The original `Settings.tsx` is untouched.
- **Server additions (additive):** `GET /api/settings` also returns `keySources`; `POST /api/integrations/test-key/:service` (admin only) in `backend_files/keyTester.js`. Tests: `test/keyTester.test.js`, two cases in `test/api/secrets.test.js`, and `tests/unit/backupModel.test.ts` and `settingsModel.test.ts`.
- **KokonutUI-first check:** Stack Panel (every section), Swipe Tabs (phones and tablets), Switch Button (theme), Particle Button (save, test, back up, merge, refresh, fill from flights, add), Hold Button (restore over data, remove a key, reset, remove a member, reset the calendar link) and the Map settings basemap cards are used. Wheel Picker was not needed (no day or number setting asked for one on phones). A Stack Panel row cannot hold a field or a button, so fields and actions live in sheets (`RpSheet`, the Smooth Drawer form on phones).
- **Keyboard and tap route:** every row is a button; the Stack Panel's own Back, swipe and Escape apply; sheets close on Escape.
- **Not verified:** a key test against a real provider and a successful dataset refresh (the sandbox has no outside network: the server route, the progress polling and the error path were seen, and the unit tests stub the provider), the real-mode API against PostgreSQL (it was run against the in-memory server: key save and mask, key test, backup job with progress, merge restore, refresh job error), Replace restore and Reset (their Hold buttons were rendered but not completed, to keep the data), and e2e.

**CalendarNew** (`views/new/CalendarNew.tsx`, `/calendar-new`; features from `VacationCalendar.tsx`, `GoldenCalendar.tsx`, `dataService` (trips, members, leave types, saved holiday calendars, events), `utils/leaveModel.ts`, `services/calendarExport.ts` and the calendar feed routes; row 8)

- **Kept (features):** a month and a year calendar of leave, trips, public holidays, events and weekends; a member filter (several at once); a schedule list; leave balances by type (total, used, planned, remaining, carry-over, per year); creating, changing and removing leave on a trip or as time off, with allocations across types and years, half days (`durationMode`, `startPortion`, `endPortion`) and days worked anyway (`excludedDates`); following a holiday calendar per member and switching holidays on or off; the weekend-holiday rule; opening a trip (its New page) and a member; the private calendar feed link and an .ics download; a week-start choice.
- **Dropped (decided):** the Gantt timeline, the leave optimizer, the custom-event filter and the leave-type colour table (decision 163). **Added:** carry-over, counting by working days with half days, Over-by warnings, Undo on edits.
- **Where the logic lives:** `utils/calendarModel.ts` (grids, week lanes, holiday days with the weekend rule, `countedDays`, `leaveUse`, `balancesFor`, `carryOverInto`, `summarise`; unit tests in `tests/unit/calendarModel.test.ts`) and `hooks/useCalendarData.ts` (loads and refreshes everything; `saveLeave`, `createLeave`, `deleteLeave`, `setHolidayIncluded`, `setMemberCalendar`). The original `VacationCalendar.tsx` keeps its own inline copy, untouched. In real mode the page reads `/trips`, `/users`, `/entitlements`, `/configs`, `/events`, `/settings` and writes `PUT /trips/:id`, `POST /trips`, `DELETE /trips/:id`, `PUT /users/:id`, `PUT /configs/:id` (admin) and `/calendar/token`.
- **KokonutUI-first check:** Swipe Tabs (view tabs), Spending Ring (leave by type), Smooth Drawer (day on phones), Hold Button (remove leave, new feed link), Particle Button (save), Tool Dock (toolbar) and the Undo toast are used. Wheel Picker was checked and skipped (dates use date fields). A calendar grid has no KokonutUI, Magic UI or Bklit equivalent, so the month and year grids are plain components in `components/new/calendar/`, with the Trips sheet's Leave section reused (not copied).
- **Keyboard and tap route for every gesture:** the grid is one roving tab stop (arrows, Home, End, Page Up and Down, Enter); the ring turns with the arrow keys; every action is a button (Add leave, Edit leave, Open trip); the Hold button has the usual hold.
- **Not verified:** a real PostgreSQL server (checked against the real server on the in-memory database: load, create time off, edit with versions, the feed link and its .ics); Nager.Date (there is none); a member who is not an admin (the server rules were read, not exercised); the Smooth Drawer day sheet on a real touch device; browser notifications are not part of this page.

### 5.5 Cutover feature-parity audit (2026-10-23)

What the original pages offer that the New pages do not, and where to find it. **Classic path** is reachable by URL (`/classic/...`); "Entry" says whether a New page links there. **Lost** would mean not reachable anywhere; nothing is lost while `/classic` exists, and everything here disappears if the old pages are deleted, so this list is the checklist for that decision. Sources: decisions 47, 67, 137, 163, the §5.4 "Dropped (decided)" and "Not carried over" notes, and a read of the old views against the New ones. Items marked *(checked)* were confirmed in the code on the day; the rest are as recorded by the page's build.

| Page | Only on the original page | Classic path | Entry from New |
| --- | --- | --- | --- |
| **Trip** (`TripDetail`) | **AI guide** (NomadGuide chat) and **AI flight analysis**; **flight import** on the trip (JSON/CSV with candidate preview and the import wizard); **ICS export of the trip** (brought back: trip menu > Add to calendar, decision 217); **full-screen cinematic map** ("Cinematic View"); route map, weather sync and the calendar and table sub-views (TripNew has a route planner with per-stop weather, a Canvas and a hero map instead) *(checked)* | `/classic/trip/:id` | TripNew menu: **Open in classic view** |
| **Trips** (`PlannerView`) | Month and destination filters, multi-select bulk archive, collapsible buckets, "All Expeditions" tab, the hero and statistics ribbon, the wizard's draft recovery, Back-button handling and loose-flight reconciliation; flight bundles (`hideInPlanner`) are shown | `/classic/planner` | Settings: Classic interface (then Planner) |
| **Dashboard** | Welcome strip with live clock, achievement milestones, cabin-class donut, top airports and airlines, longest and shortest flight, earth-orbits hero, flight trend chart, the map card's layers and 2D/3D toggle, stamp search and region filter on the page itself (stamps, stickers and country detail moved to the Atlas) | `/classic` | Settings: Classic interface |
| **Flights** | Hero bento, the Departure Board view, per-column filter popups, the new-flight draft kept in `localStorage`, the original import wizard's backup restore and its merge/overwrite choice for duplicates (New skips duplicates). Live tracking, import columns, journeys, export and the calendar file **are** on FlightsNew | `/classic/flights` | Settings: Classic interface |
| **Road trips** | The hub's map and chart tabs, the old CO2 chart (replaced by the footprint strip), filter popups | `/classic/roadtrips` | Settings: Classic interface |
| **Calendar** | Per-traveller Gantt timeline only. The leave optimizer, event add/remove and the layer filter, the leave-type colours and adding a country holiday calendar were brought back (decisions 212–216) | `/classic/calendar` | Settings: Classic interface |
| **Map** | The old controls modal and dock (MapNew has its own settings sheet, layers, globe, fullscreen and radar); not audited control by control | `/classic/map` | Settings: Classic interface |
| **Atlas** | The old page's own layout; residence statuses (past home, home), scan of travel history and wishlist **are** on AtlasNew *(checked)*. No feature of the old Atlas was recorded as dropped | `/classic/atlas` | Settings: Classic interface |
| **Member** (`UserDetail`) | Per-trip edit and delete buttons and "Add to Planner" for flight bundles; the colour and emoji choices (the app only stores a photo) | `/classic/user/:id` | Settings: Classic interface |
| **Settings** | The **Golden Hour and Departure Board interface picker** (`ThemePicker`), the page-wide Save button, the OpenFreeMap card, the Core / Travel / Cartography chips, the old flight wizard launcher, per-member taken days and weekend policy in Add member (both stay on the member's page) | `/classic/settings` | Settings: Classic interface |
| **Sign in** (`Auth`) | The original sign-in screen (same features as AuthNew; `startDemo` is shared) | any `/classic/...` URL while signed out | none |
| **Shell** | Sidebar, GoldenSidebar, AmbientBackground and the per-page ambient themes (`config/pageThemes.ts`) | all of `/classic` | none (the old shell has a **New interface** link back) |

Not rebuilt in this step, by decision: every item above. What is still worth a follow-up before the old pages go: the trip's **AI guide / flight analysis**, **flight import on a trip** (decision 47) and the per-traveller **Gantt timeline**. The trip ICS export and the Calendar's leave optimizer, event layer, leave-type colours and country calendars were rebuilt after the cutover (decisions 212–217).

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
| 73 | FlightsNew page (Flights build) | One-line title "Flights", three tiles filled with their accent that follow the filters (**Flights** ink with upcoming and airlines, **Kilometres** green with airports and "N× the Earth", **Hours** mustard with countries), then the toolbar and the filter row (the tiles later moved into the hero card, decision 84). The Tool Dock holds Search, Import, New flight. The filter row holds All / Upcoming / Past, year chips, No trip, then Class, Status, Sort, Export and Select menus. It wraps on tablets and up and scrolls on phones. `/flights-new` is in the shell's Flights tab and the phone tab bar; the "+" quick action starts a new flight |
| 74 | Flights table | The invoices table of the video: **Airline** (logo, name, number), **Route** (codes and cities), **Date** (date, times, +1), **Length** (time, km), **Trip** and **Status**, with sortable headers and a "···" menu (Details, Edit, Show on map, Delete). Tablets drop Length and Trip; phones show each flight as a small card. The first 10 rows show with a fade and "Show all N"; a search or filter lifts the cap. Row separators are hairlines, no zebra |
| 75 | Flights board (removed) | The Departure Board view was built and then removed as redundant with the table. Decision 12's Table / Board toggle no longer applies to Flights: the page is the table, with the "Now" card for the flight that is close |
| 76 | Journey status | Derived from the times: **Scheduled** green, **In the air** ink, **Landed** white with a green check, **Cancelled** rust. A rust "+35 min" chip shows when the actual arrival was later (green "−N min" when earlier) and nothing within five minutes. Other modes say "On the way" and "Arrived" |
| 77 | Journey sheet | A flight opens in a right sheet (440px) or, on phones, a **Smooth Drawer** open to its details. It holds a **Flick Card boarding pass** in the colour of the flight's status (front: carrier, route, date, times, length; flip it by drag, tap or Enter for the booking: confirmation, seat, class, terminals and gates, aircraft, cost), the **Trip** (add, change or take off, with Undo), **Live status** for flights (Track flight, then Save to this flight writes the actual times, gates and aircraft) and Edit, Map, Delete. Delete turns the sheet into a Hold-to-delete confirmation. All of it takes a `JourneyRecord` so Road trips can reuse it |
| 78 | Editing a flight | One sheet to add or change a flight. Its fields are the trip sheets' transport form (From and To place search for airports, dates, airline with logo and suggestions, number, confirmation, seat, cost, More details), plus **Fill from flight number** (flight tracker), **As flown** (actual times, aircraft) and the **Trip**. Saving keeps every field the form doesn't show, finds the map position of a place that has none, works out the length, and moves the flight between a trip and "no trip" in one transaction |
| 79 | Import, export and select | **Import** is a sheet: choose a CSV, Excel or JSON file, see the new flights (first three, then "+N more") and how many are already in the log (skipped), then Import. **Map columns** opens the original wizard for files with their own column names (not yet restyled). **Export** writes what is shown as CSV, Excel, JSON or AirTrail JSON. **Select** adds tick boxes and an ink bar with Add to trip (with Undo) and Delete (Hold) for several flights at once |
| 80 | Grouping the table | A **Group** menu in the filter row: No grouping, **By year** (a heading per year with its count and km; the two newest years open, older ones folded; a search or filter opens them all) and **Journeys** (remembered). Table only |
| 81 | Journeys and timeline | Flights that belong together (the flights of one trip, or independent flights saved on one booking) form a **journey** when there are two or more. In Journeys grouping a journey is a header row (route chain "JFK → CDG → AMS → NRT", dates, flights, time, km, status) that opens its legs, with a path button for its **timeline sheet**: totals, the way out and the way back (split at the longest stay), every leg with times and status, "Layover 2h 10m in FRA" between connections and "5 days in Tokyo" for a stay, and the trip. Tapping a leg opens the flight. This replaces the old bundles: Add to trip keeps flights on real trips |
| 82 | Seat map | A flight with a seat shows a small plan of the rows around it (3-3, or 3-4-3 when the letter is past F) with the seat in green, its number and window, middle or aisle. It is a guide, not the airline's layout |
| 83 | Live tracking | Within three hours of departure and until an hour after arrival a flight is **followed**: the sheet's Live section and a **Now** ink card on the page (shown only when a flight is that close) refresh once a minute while the page is visible. They show a progress bar by the clock ("Lands in 3h 20m"), the status, terminal and gate, and, when the engine has a transponder, altitude, speed and a small still map with the aircraft. Outside that window "Track flight" asks once. Save to this flight still writes actual times, gates and aircraft |
| 84 | One hero card with every number | Supersedes the separate tiles row and the Stats view (and decision 73's tiles): one **hero card** under the "Now" card, in both Table and Board views, holds all the statistics. Top: three totals filled with their accent (**Flights** ink with upcoming and airlines, **Kilometres** green with airports and "N× the Earth", **Hours in the air** mustard with countries). They are also the chart's switch: the selected one has a ring and is charted per year. Below: a still **routes map** (land, one great-circle arc per route, thicker the more it was flown, a dot per airport, framed to the arcs; no pan, zoom or hover) on the left, and BklitUI bars per year (flights, kilometres or hours, with the busiest year; no draw-in) on the right. On phones the chart sits under the map. Everything follows the filters. The bars are `components/bklit/bar-chart.tsx`, BklitUI conventions reduced to bars, grid and axes, because the full Bklit bar chart pulls in eight registry packages the page doesn't use |
| 85 | Import columns | A spreadsheet's columns are matched to flight fields by name (From, To, Date, times or a combined date-time, airline, number, confirmation, seat, class, cost, aircraft) and shown under **Columns** with a menu per field to change a match; date order (month first or day first) is worked out from the dates, with a switch when it can't be. JSON files need no mapping. The original wizard is no longer reachable from this page |
| 86 | Finding a flight by number | Type a flight number and a departure date (ME215, KL 641 or the callsign MEA215) and the app **finds the flight by itself** after a short pause: a card shows the airline, airports, times, aircraft and status and the form is filled in (From, To, times, airline, terminals and gates, aircraft, length). Several legs that day are listed to choose from. Where only the route is known (no free schedule that far out) it fills the route and asks for the times; where nothing is found it says why in one sentence. Existing flights get a "Check flight data" button instead of auto-fill. Sources, asked at once and merged (`backend_files/flightLookup.js`, `GET /api/flights/lookup`): **FlightStats** (keyless, about three days either side of today, with gates, delays, aircraft, tail number and the live position), **AeroDataBox** and **AviationStack** (workspace keys, any date), **ADSBdb** (keyless, the route a number flies). Each has a timeout, caching and a circuit breaker. The Live panel and the "Now" card use the same lookup. FlightStats is an undocumented endpoint behind flightstats.com, with no contract: it can change or block, so it can be switched off with `FLIGHT_LOOKUP_FLIGHTSTATS=off` |
| 87 | Flights and Trips work together | **From a flight to a trip:** the "···" menu of a flight that is on no trip has **Create trip**, the sheet's trip menu has **New trip from this flight**, and Select has **New trip from these**. The trip is named "Trip to <city>" (the first place reached that isn't where it started), spans the flights' dates, is Planned (Past when the dates have gone), holds the flights, and shows an Undo toast; the flights leave the independent list. **From a trip to the flights:** flights on a trip (made in the trip sheets or on the trip page) already show on the Flights page, with the trip's name. **Suggesting flights for a trip:** once a trip has dates, the New trip and Edit trip sheets (the Basics step under the dates, and the Transport step) offer the flights in the log that are on no trip and depart within a day of those dates, with **Add** and **Add all**. Adding puts the flight on the trip and, when the trip is saved, removes it from the independent list so it never shows twice |
| 88 | Flights on phones | Below 768px the page has two tabs (Swipe Tabs): **Flights** (the filters and the table, with a count) and **Stats** (the hero card). The "Now" card stays above both |
| 89 | Trip header map is the still map | Supersedes the interactive map of decisions 52 and 58: the trip's header card shows the same **still map** as the Flights page (land, one arc per leg whatever its mode, a dot at each end, an ochre dot for each stay, place and stop), framed to fit, with no pan, zoom or hover. It fits a route across oceans as well as one across a country (the interactive map cropped long routes and repeated the world), needs no map engine on the trip page, and a "Focus" tap in the route planner just scrolls to it |
| 90 | Icons for flight details | Wherever a flight's booking details appear (the boarding pass back, the Live panel, the "Now" card, the flight editor and its More details) each has its own icon: **seat** `Seat` (AirplaneSeatIcon), **baggage claim** `BaggageClaim` (BriefcaseConveyorBeltIcon), **terminal** `Airport` (Airport02Icon), **confirmation number** `BookingTicket` (TicketsPlaneIcon), **gate** `DoorOpen` (DoorOpenIcon). Terminal and gate show as two icon-and-value pairs rather than "T1 · Gate 5". `RpField` takes an `icon` for its label. The icons are yellow (`text-rp-ochre`, which is mustard in dark mode; `text-rp-mustard` on the ink "Now" card in light mode) so they stand out |
| 91 | Spend and breakdowns | The hero card gets a fourth total, **Spend** (rust, the sum of the logged costs and the average per flight), which also charts spend per year; the totals are 2×2 on phones and four across from 640px. Under the map and chart sit three **breakdowns**: **Airlines**, **Airports** (visits) and **Cabin class**, each the top three with a bar and "+N more" |
| 92 | Filters | The filter row adds **Airline** and **Airport** menus (built from the log, most flown first, up to 40). They combine with the time, year, class, status, trip and search filters; "Clear filters" resets all of them |
| 93 | When the lookup has no schedule | Free schedules only cover about three days either side of today, so when none is found the editor falls back, in order: **"You logged KL641 before"** (the same flight number's times from the log, with a button to use them), **the route** from ADSBdb, and **Estimate arrival time** (30 minutes plus the distance at 800 km/h, converted with each airport's own time zone), with a message that an AeroDataBox key in Settings covers any date |
| 94 | Adding flights faster | A flight's "···" menu has **Duplicate** (a copy to edit, on the same trip) and **Add return flight** (places swapped, a week later, airline and confirmation kept). A new flight has **Save and add next leg**, which saves it and opens the next one starting where it landed, on the same trip |
| 95 | Editing from the timeline | The journey timeline can **rename the trip** (pencil, Enter to save) and **take a flight off the trip** (it stays in the log, with Undo) |
| 96 | Large logs | After "Show all" rows render 60 at a time and more load as you scroll; rows use `content-visibility: auto`; distances are remembered, so a log of thousands stays quick |
| 97 | Import wizard | A new three-step wizard replaces the one-sheet import and the original wizard: **1 File** (CSV, TSV or Excel; a worksheet picker; "first row has the column names"; a four-row preview), **2 Columns** (each flight field with its detected column and a sample value, required fields marked, "Detect again", month-first or day-first), **3 Review** (every flight with a tick box, duplicates skipped or imported, an optional trip to add them to). CSV cells are read as text so \"05/03/2026\" is never turned into a date the wrong way round. JSON exports skip to Review |
| 98 | Journeys are found automatically | Journeys are now the **default grouping**. Beyond trips and shared bookings (same confirmation code or itinerary), the app finds journeys by matching flights that are on no trip: the next leg is the first later flight leaving from where the last one landed. **Within 24 hours it is a connection** ("1 stop · 2h 10m layover"); **within three weeks it is a stay**, and the chain is kept only if it gets back to where it began, as a **round trip** (one place stayed) or **multi-city** (two or more). A chain that never gets home keeps only its connections. The header row names the kind, the layovers and where it came from (trip, one booking, found by matching); opened, the legs have a **layover chip** between connections ("Layover 2h 10m in FRA") or a stay ("5 days in Rome"), and the return legs are included. **Layover chips are coloured by length:** green under 3 hours, yellow from 3 to 5, rust over 5 (a stay of a day or more is neutral). The timeline sheet has **Create trip** for a journey on no trip. Matching is a guess from airports and dates, so a flight can be taken out by giving it its own trip |
| 99 | Live progress from real data | The progress bar and "Lands in…" now use the real data when there is any: the plane sits where the aircraft is along the route (its position against the two airports), "Lands in…" counts to the live estimated or actual arrival, and a rust or green chip says how late or early it is ("+35 min"); a small "live position" note shows the source. Without live data the bar follows the schedule's clock as before (`liveProgress` in `utils/journeysModel.ts`) |
| 100 | Flight alerts | Flights leaving within 12 hours or in the air (up to six) are checked every 3 minutes while the page is open and compared with the last look (kept in the browser, so a reload keeps it). An alert row appears under the "Now" card for a new **delay** (15 minutes or more, and again when it grows by 10), **back on time**, **gate** or **terminal change**, **baggage belt**, **cancellation or diversion**, and a **connection at risk** (less than 60 minutes between the live arrival and the next leg's departure, rust under 30, "You may miss…" when negative). Rust is bad, mustard needs a look, green is good news; each has a dismiss. A **Notify me of changes** button asks for browser notification permission and sends the same alerts as notifications. It can only watch while the app is open: nothing pushes to a closed browser (that needs a server and a push service). Logic is in `utils/flightAlerts.ts`, the watching in `hooks/useFlightAlerts.ts` |
| 101 | Next flight on a trip, and on the Now card | A trip's page shows a slim **Next flight** card under the header when the trip has a flight still to come (or in the air): a countdown disc (days, or "Now"), "Next flight in 6 days", the route and time, the status, and in the last 24 hours the live terminal and gate; tapping it opens the Flights page. The same `NextFlight` component (`components/new/journeys/NextFlight.tsx`, with a `showTrip` prop for the trip's name) is meant for the Dashboard's next flight when DashboardNew is built. The Flights page's **Now** card names the trip the flight is on, with its dates |
| 102 | Calendar export and share | Flights leave the app three ways: Export › Calendar (.ics) for the whole filtered log, and a Share menu on a flight sheet and on each journey with Add to calendar, Copy itinerary and Share… (only where the device has a share sheet). Each flight is one event at its real UTC time with the booking details and a reminder 3 hours before. A read-only share *link* would need a new backend route and is not built. |
| 103 | Richer stats | The hero card gets a row of three facts above the breakdowns: this year against the year before (follows the chart's metric), the most flown route (a pair counts both ways), and estimated CO₂ with a per-flight and per-year figure. CO₂ is a rule of thumb (0.15 kg per km in economy, scaled by cabin: 1.5 premium, 2.9 business, 4 first), labelled as an estimate, never a measured figure. |
| 104 | Who flew | When a flight's trip has two or more members, the editor shows a "Who flew" chip group (everyone ticked by default; untick whoever stayed behind). The choice is saved on the flight as `passengers`; no list means everyone on the trip, so older flights keep working. The hero card adds a "Who flew" breakdown (flights per person) only when two or more people appear. Per-person filtering and per-person distance are not built. |
| 105 | Fixing a wrong guess | Automatic journeys can be overridden by hand, saved on each flight as `journeyKey`. In Select mode, Group › Join as one journey (flights sharing a `j:` key form a journey, whatever their trip or booking), Show separately (`alone`: never grouped) or Group automatically (clears it). A journey's sheet has "Not one journey" and, for joined ones, "Group automatically". Each change has an Undo toast. A joined group with a single flight left falls back to automatic. |
| 106 | Smarter estimate and the route actually flown | "Estimate arrival time" uses an average speed that rises with distance (500 km/h over 100 km up to 830 km/h from about 2,700 km, plus 30 min on the ground) and, over 3,000 km, the jet stream by heading (up to 7% longer westbound, shorter eastbound); within about 10% of real schedules on the routes checked. The route actually flown comes from OpenSky's keyless track (through `/api/proxy/opensky/track`, the aircraft found by callsign via adsb.lol): the flight's Live section draws it as a solid line over the planned arc while the flight is up, and "Save to this flight" keeps it (`track`, about 80 points). OpenSky refuses historical tracks without an account, so a flight whose live window was missed has no route to show; the planned great-circle arc stays. |
| 107 | Road trips is a sibling page of Flights | **/roadtrips-new** opens inside the same shell and keeps **Flights** highlighted in the menu. A small **Flights \| Road trips** switch sits at the top of both pages. The journey log is one idea (flights, trains, buses, cars, cruises, ferries); two pages keep each one's totals and breakdowns honest |
| 108 | Shared journey components are mode-aware, not forked | Additive changes only, so FlightsNew behaves as before: `placeCode(value, mode)` gives a place name for anything but a flight; `JourneyHero` takes `kind="land"`; the editor works out distance and time for land and sea (**Calculate route** for car, bus and rental; an estimate at an average speed otherwise); the import wizard and export take the modes (a Mode column picks per row) |
| 109 | Land and sea read as places | Rows, the ticket and the timeline show **Lyon → Marseille**, not codes. Operator replaces airline; "On the way" and "Arrived" replace "In the air" and "Landed"; the by-mode breakdown replaces cabin class. Stops along the way stay in the details, and the footprint chart was dropped |
| 110 | From a trip's route | The old page's route-segment import is a tool-dock sheet: pick a trip with a route and a mode, untick the pairs you do not want, add. Pairs already linked by a journey are left out, and no invented operator, price or booking code is added (the old import made them up) |
| 111 | One footprint calculation, and an error page in the New look | `utils/footprint.ts` is the single source for flights and land: grams per traveller-km by mode (train 35, bus 27, car 105 for 1.6 people, ferry 115, cruise 250), flights by length (246 g under 500 km, 151 to 3,700, 148 beyond) with an 8% routing uplift and cabin multipliers (premium 1.6, business 1.5 short or 2.9 long, first 1.5 or 4), radiative forcing left out and said so. It replaces the old flight figure (125 kg for every hour, layovers included) and the old road figures (cruise 150 or 120 and ferry 90 or 120 depending on where you looked). The hero strip shows the total, the biggest parts (mode for land, cabin for flights) and, for land, what flying the same distance would have added. Both error boundaries use one `ErrorPanel`: plain words, Try again and Dashboard, technical details folded with Copy; a missing script (a new version, or a restarted dev server) says to reload |
| 112 | Distance and time between places | `services/journeyEstimate.ts`, best source first: **road** (routing engine; a coach gets the car time x 1.25), **rail** (OpenRailRouting line length), **sea** (searoute lane), else the **straight line stretched by how winding the mode is** (rail 1.2, road 1.3, ferry 1.15, cruise 1.25) at the mode's average speed (train 120, bus 70, car 90 to 95, cruise 30, ferry 40 km/h). An answer shorter than the straight line, or over three times longer, is rejected as a bad snap (it caught a London to Edinburgh rail result of 283 km). The old way used the bare straight line, which understates a road by a quarter or more. Rows with no stored distance use the stretched line too, so totals and the footprint stop undercounting. A distance left over from other places is dropped when From or To is edited. "From a trip's route" uses the same engine instead of the gap between dates. **Time zones:** the zone of each place is found once from its position (`services/timezone.ts`, Open-Meteo, kept in the browser), so London 09:00 to Paris 12:20 is 2 h 20, not 3 h 20; the editor's arrival and the saved duration both use it, and a place whose zone can't be found is treated as on the same clock. **Ferry lines:** a ferry or cruise is drawn on the routes map along its **mapped ferry line**, read from OpenStreetMap `route=ferry` relations by the server (`backend_files/ferryLines.js`, run through the route store as mode `sea`, stored in `cached_routes`, a missing line remembered as none, an Overpass outage never stored; set `OVERPASS_URLS` to use your own Overpass server, since the main public one is often full). Stockholm to Helsinki comes out as the Viking or Silja line through Mariehamn (82 points, not an arc). The **Map page** (both the New map and the old one) draws sea legs the same way: it asks the server for the line, retries while the server is still looking it up, and keeps the shipping lane or arc only when no ferry is mapped. Without one (or in local mode) it falls back to the shipping lane (`searoute-js`) and then an arc; short crossings often have no lane in that network. **Stops along the way** are offered for every journey but a flight, and a route through them (Stockholm, Mariehamn, Helsinki) is drawn through each stop, not straight across; routes with different stops are different routes, and short land and sea routes zoom in further than flights. **Limits:** average speeds are estimates, and the toast names the source |
| 113 | DashboardNew page (Dashboard build) | One-line title "Dashboard", a tool bar (New trip, Reset layout), three filled tiles (Distance green, Nights away ink, Countries mustard, each with one line of detail), then a **Widget Grid** of eight widgets. The shell's Dashboard tab, the brand button and the mobile Dashboard tab now point to `/dashboard-new` |
| 114 | Widgets | **Up next** (the trip under way in an ink card, otherwise the next one in its status colour: days to go or left, dates, a flight today, Open trip), **Upcoming trips** (status-coloured tiles in one row, as many as fit, then Show all; a Momentum Rail on phones), **Passport** (country count, rank, stamps, landmark-sticker bar, Show all in a sheet), **Travel over time** (Metric Card: Distance, Nights or Spend with Distance / Nights / Spend chips, 3M / 6M / 12M against the previous period, trips pinned as events), **Leave** (Spending Ring by leave type with what is left, member switch, the trips that use it), **By year** (Bklit bars: trips, distance or nights, at least five years), **Where next?** (Throw Deck from the Atlas wishlist; "Been there" marks it visited), **Recent trips** (capped list with a fade and Show all) |
| 115 | Arranging | Lift a widget by its grip (or a long press), drag it, resize it from its corner (2 to 6 of 6 columns); every widget has a keyboard route. The order and spans are saved per user in `localStorage` (`wandergrid_dashboard_new_layout_v1:<user>`, in a try/catch) and **Reset layout** restores the default. Defaults differ for tablets (wider spans). Widgets with their own gestures (chart, ring, deck, rail) lift by the grip only. Hovering a widget does not dim the others; only a lift or a resize does |
| 116 | Phones | One column in the same order (Up next, Upcoming, Passport, Travel over time, Leave, By year, Where next?, Recent trips). Dragging and resizing are not offered as a layout editor on touch: the grip still lifts a widget, and resize is hidden. The tool bar drops New trip (the tab bar's "+" starts one) |
| 117 | First-time user | With no trips, flights or places, the page shows the tiles and a "Start your first trip" card (Plan a trip, Add places, Log a flight) instead of eight empty widgets. As soon as there is any data every widget shows, each with its own empty state and action |
| 118 | Metric Card for sparse data | Travel is a handful of dated events, so the drawn line is a smoothed (moving average) version of the daily values while the number, the day reads and the breakdown keep the exact values. The segments are modes (distance), trip length (nights) and transport / stays / activities (spend). The metric switch sits in the card's own header row |
| 119 | Leave ring | Slices are the leave types the member has booked this year (a trip's allocations, else its single type), each in its type's colour, plus a "Left" slice when the allowance is not used up. A member's logged "taken" days count when no trip backs them |
| 120 | Members on the Dashboard | The Leave widget's arrow and the member chips open `/member-new/:id` (MemberNew), and a trip's members do the same from TripNew. The `MEMBER_NEW_READY` placeholder is gone |
| 121 | World widget | A simplified world: countries you have been to scratched in green, every route as a thin great-circle arc (flights rust, rail green, road ink, sea dashed; upcoming and planned routes fainter), a count of countries and routes, and Open map. The Travel over time line is drawn through a near-Gaussian smoothing with round joins and caps, so hills are round, never pointed. Static, no zoom and no tooltips (the Map and Atlas pages have those). It is a Bklit choropleth with a new `ChoroplethRoutes` layer |
| 122 | Editing on phones and by tap | **Edit widgets** in the tool bar turns every widget header into Move up, Move down and Hide, so the whole layout can be arranged with taps (phones, or anyone who prefers buttons to dragging). Hidden widgets show as "+ Name" chips above the grid; **Reset widgets** restores the order, sizes and hidden ones. Hidden ones are saved per user beside the layout and keep their place. This supersedes the "no layout editor on touch" half of decision 116 |
| 123 | Dashboard tweaks after review | Upcoming trips show as many tiles as fit in one row with Show all under them (no fade over a tile); the three tiles stack number over unit on phones so they align; the map sits after Passport, full width |
| 124 | Resizing and the World widget | Every widget resizes **independently in width and height**: drag the corner (width in columns, height in rows, 2 to 8 rows) or use the arrow keys on the handle. The height is saved with the layout (`rows`); a widget without one keeps its own default height. On phones the corner changes the height. The World widget **fits everything**: the Mercator view is fitted to every route (and the arcs between ends), trip pin and visited country, centred, never zoomed in past about 40° or panned past the edge of the world, so whatever its size or shape it shows all trips and routes and never empty bands. Trips with a map position get a small pin. Supersedes the earlier "covers its box" crop |
| 125 | SettingsNew page (Settings build) | `/settings-new`: a one-line title "Settings", three filled tiles (**Members** ink with admins, **Keys** green with how many of the six services have one or come from the host, **Gear** mustard with carriers), then the sections. The Account Menu and the phone More sheet open it from inside the New shell (they used to open the old page). Listed in the dev-only links |
| 126 | Sections | **Workspace, Members, Integrations, Gear, Carriers, Data** (the old six tabs, each kept). From 1024px a sticky list on the left (the selected row takes its accent: Workspace ink, Members green, Integrations rust, Gear mustard, Carriers navy, Data ink); below that Swipe Tabs, with names on the selected tab only on phones. The section is remembered. Each section is a **Stack Panel** of settings rows (decision 65); anything that needs a field opens a sheet (a bottom sheet on phones) |
| 127 | Saving | There is no page-wide Save button. Choosing a value saves that one field at once (a PATCH of only that field, so two admins or the theme toggle cannot overwrite each other); text and keys have a sheet with a Particle Button; a failed save is an error toast and the row keeps its old value. Reversible removals (a gear item, a carrier) save at once and show the Undo toast |
| 128 | Who sees what | The server's rules are unchanged: settings, members, backups, jobs and key tests are admin-only; everyone may read settings and the roster. The page mirrors them. **Admins** see all six sections. **Everyone else** sees Workspace (their own theme and calendar link are editable; the workspace values show without a way in, with "Only admins change these.") and Members (read-only, a tap opens the member's page) |
| 129 | Theme | The **Switch Button** in the Workspace header toggles light and dark; Workspace › Appearance › Theme offers **Light, Dark, Match device**. The old Golden Hour and Departure Board interface themes are not offered here and the stored legacy value is left alone. The choice is personal (this device); for an admin it also writes the workspace theme, as the shell's toggle already does |
| 130 | Default basemaps | One row ("Streets · Night lights") opens a sheet with the Map settings **basemap cards**, a Light theme group (Streets, Bright, Light grey, Satellite, 3D) and a Dark theme group (Dark, Dark blue, Night lights, Satellite, Ocean). Choosing saves; older stored names (snow, ofm_liberty, onyx and so on) show as the card they became. `BASEMAPS` and `BasemapCard` are now exported from the Map settings sheet |
| 131 | Integrations and keys | **API keys** (Gemini, AviationStack, AeroDataBox, OpenAIP, Brandfetch, CARTO) show a status on each row; a row opens the key sheet: where the key comes from (saved on the server, from the host, or none), a field that replaces it, the AeroDataBox gateway (RapidAPI or direct), a docs link, a **Test key** Particle Button and Remove key. A key is never shown in full: paid keys stay on the server and only come back as a mask; Brandfetch and CARTO ids show their last four characters. The server now says where each held key comes from (`keySources`: workspace, env, none) so a host-provided key reads "From the host". **Test key** saves a newly typed key first, then asks the server to try the stored key with its provider (`POST /api/integrations/test-key/:service`, admin only, never returns the key). **Free services** (ADSBdb, FOSSGIS OSRM, Open-Meteo, OpenFreeMap, NASA GIBS) are rows you tap to test, with the latency; **Test all** runs them and every saved key |
| 132 | Removing a key | **Remove key** is in the key sheet, only for a key saved in the workspace (not one from the host), and asks for a Hold (decision 9): the key cannot be read back, so it cannot be undone |
| 133 | Gear | The master packing list as a Stack Panel: a row per category (Clothing, Toiletries, Electronics, Documents, Health, Misc) with its count, opening that category's items. The first 8 items show, then **Show all N**; each item has an X that removes it with Undo; **Add gear** (header, or the row at the end of a category) is a sheet with a name and category chips. An empty list shows the shared empty state |
| 134 | Carriers | A list with the real logo (the same chain as everywhere), name, code and website; search appears with more than 8; the first 8, then **Show all N**. **Add carrier** and each row's pencil open a sheet (name, code, website, and one-tap starting points for twelve airlines); **Remove carrier** is in that sheet with Undo. **Fill from flights** (a Particle Button) adds the airlines found in the flight log that are not listed yet |
| 135 | Members | A row per member (photo or initials, name, role chip, "You", "Needs a password", email), admins first. A tap opens the member's page (MemberNew), which holds editing a profile, passport, password, leave allowance and removal. Admins also get three icon buttons per row: **holiday calendars** (a sheet of switches for the saved country calendars, the old edit dialog's list), **password reset code** (when the reset flow is on) and **remove** (the Hold sheet of decision 66, never for yourself). **Add member** is a sheet with name, email, password (8 or more), role and yearly leave days. The first six show, then **Show all N** |
| 136 | Data | **Back up** is a sheet of the six groups with counts and a **Run backup** Particle Button; with the server the tables are read by the background job (`POST /api/jobs/backup`, polled, with a progress bar) and the file is built in the browser as before. **Restore from file** reads the file in the browser, shows what is in it, and offers **Merge** (a Particle Button) or **Replace** (a **Hold button**), per group; your own sign-in and the workspace's keys are kept. **Refresh airports and carriers** runs the global data job (`POST /api/jobs/refresh`) with progress and the server's message or error. **Import flights** goes to the Flights page, which has the import wizard (decision 97). **Reset workspace** is a Hold sheet; it replaces typing DELETE |
| 137 | Settings carried over, dropped and moved | **Carried:** workspace name, currency (27), date format, public sign-up, working days, default cabin class, starting airport and land transport, default basemaps, API keys with tests, master gear list, carriers, members (add, open, remove, holiday calendars, reset code), backup, restore, global data refresh, calendar file and subscription link (copy, reset), reset. **Moved:** the calendar link and file went from Data to Workspace › Calendar sync, because they are per person, not admin tools; the old Gemini "Active" banner is the key's status row. **Dropped:** the Golden Hour and Departure Board picker (decision 129), the old page's Save button and its per-card Save buttons, the OpenFreeMap "no key needed" card (it is a Free services row), the "Core / Travel / Cartography" chips, the old flight wizard launcher, per-member "taken days" and weekend policy in Add member (both stay on the member's page) |
| 150 | CalendarNew page (Calendar build) | `/calendar-new`, in the shell's Calendar tab. One-line title "Calendar", the Tool Dock (Today, Search, Add leave · Holidays, Options; all actions, so no plate marks one as selected), **three filled tiles** (**Days taken** ink with planned days, **Days left** green with "of N in 2026", **Next leave** mustard with the countdown or "Now" while on leave), a member row, then one **month card** with **Swipe Tabs** Month (ink), Year (green) and Schedule (mustard) and, beside it from 1024px, a column with the **Leave** card (year chips, Spending Ring by leave type, a row per type) and a **Public holidays** card (next three, Manage). From 1024px the card's tabs and its previous / next / Today row sit on two lines (the card is about 640px there); the Year tab takes the full width and puts the side cards under it |
| 151 | Month grid | A seven-column grid with hairline gaps. Wide screens show the **first three items** of a day as bars that **keep their lane across the days they cover** (the name on the first day of each row), then "+N more"; phones show up to three dots (round for trips, square for holidays and events) and "+N", and an **agenda list for the month under the grid**. Mustard planned, green confirmed, ink travelling now, a quiet fill for past, ochre holidays, navy events; every chip has an icon (suitcase trip, sun leave, flag holiday, star event) and the cell's accessible name lists its items and their states. A legend sits under the grid. Weekends take the inset fill, today an ink disc |
| 152 | Keyboard | The grid is one tab stop with a roving tabindex: arrows move a day or a week, Home and End go to the ends of the week, Page Up and Page Down change month, Enter or Space opens the day. Moving past the first or last day changes the month and keeps the focus on the new day |
| 153 | Counting leave days | A trip's leave days are **counted by date**, not as its calendar length: weekends (the workspace's working days), public holidays that are switched on, and **days the member works anyway** (`excludedDates`) count 0; `durationMode` / `startPortion` / `endPortion` make half days (mornings only, afternoons only, a half day, or the first day from the afternoon and the last day until lunch). A trip with `allocations` uses those days (in their target year, else the year it starts); a trip across New Year splits by date. `utils/calendarModel.ts` (`countedDays`, `leaveUse`). **MemberNew and the Dashboard still count a trip's calendar length** (decision 64), so their figures can differ from the calendar's for trips that cross weekends or holidays; moving them to `countedDays` is a follow-up |
| 154 | Balances and carry-over | Per leave type, member and year: the policy's allowance (monthly accrual runs twelve times), **carry-over** from the year before (a policy with carry-over on gives what was left, up to its limit, to its target type, itself unless another is chosen; the expiry date is not applied), **used** (days before today), **planned** (today on), and what remains. A type over its total shows a rust **"Over by N days"** chip (action needed, with the words), a type with no policy but leave on it lists as "No allowance", an unlimited type says Unlimited. The tiles take their figures from the same model; a member with no policies falls back to the yearly allowance minus the days recorded as taken (or used on trips, whichever is more) and planned |
| 155 | Time off without a trip | "Add leave" makes **Time off** for a member: a hidden trip (`hideInPlanner`, id `leave-…`) with the member as its only participant (the save puts the signed-in user on every new trip, so it is taken off again when someone else's leave is made). It counts in every balance, shows on the calendar and in Schedule, and stays out of the Trips board and the Member trips tab. Leave can also be put on an existing trip ("On a trip"); the leave belongs to the whole trip, as before |
| 156 | Leave sheet | One sheet (right panel; bottom sheet on phones) for new and existing leave. It reuses the **Trips sheet's own Leave section** (now exported from `TripSheets.tsx`: one type or a split across types and years, with the assigned-days hint measured against the days that really count), then **Day length** (a single day: full, morning, afternoon; several days: full days, mornings only, afternoons only, or half the first or last day), **Days you work anyway** (a chip per working day, up to 62), and a live line "N days count as leave · left out: 2 weekend, 1 holiday". Wheel Picker not used: dates use the same date fields as the trip sheets |
| 157 | Saving, undoing, removing | Save is the Particle Button. Saving or adding leave and switching a holiday on or off or following a calendar show the ink **Undo** toast and are put back by it. **Removing leave is a Hold button** (permanent for time off, which is deleted; on a trip it clears the leave fields) with no Undo, as for members (decision 66). The sheet's hold is shown only when there is leave to remove |
| 158 | Day detail | A day opens a **right sheet** on tablets and desktop and a **Smooth Drawer** on phones: its holidays (with the calendar, "Observed instead of …" and Manage), events, and every trip or leave on it with its status, members, the leave type and **what this day counts for** ("Counts as half a day", "Weekend: not counted"), Edit leave or Add leave and Open trip (the trip's New page). Empty days offer Add leave |
| 159 | Members and filters | A row of chips: **Everyone** and each member (several can be on), and **Leave only**; Search (Tool Dock) filters trips and holidays by name. The tiles, ring and rows show **one member**: the single member in view, else you. The balance year follows the year being looked at (chips override). Members who are not admins can change only their own leave; the server decides, the page hides what it would refuse |
| 160 | Holidays | The sheet lists the saved country calendars by year; **Follow for <member>** links one to the member (`holidayConfigIds`; an admin or the member) and each holiday has a **day off** switch (`isIncluded`, admin only). The calendar shows the calendars its members follow, else every saved calendar. Under the member's weekend rule "Move to Monday" a weekend holiday is shown and taken on the next working day. A holiday that is switched off stays visible, dashed, "Not a day off", and counts nothing. **Adding a country calendar** was not built at first (the repo had no holiday fetch); it is now (decisions 215, 216) |
| 161 | Options | The first day of the week (Monday, Sunday, Saturday; kept on the device, the locale's first day to begin with); **Add to a calendar app** (the private feed `/api/calendar/<token>/feed.ics` from `GET /api/calendar/token`, copy, and **Hold to make a new link** with `POST /api/calendar/token/rotate`); and a one-off **.ics download** of the trips in view. In local mode the link says it needs the server. The feed lists only trips whose status is Upcoming or Past, so Planned time off is not in it |
| 162 | Year and Schedule | **Year** is twelve small months with 44px days: a day is filled with its status colour, a holiday is ringed in ochre, an event is underlined, and a month's name opens it. No Bklit heatmap is used (none is ported; a heatmap would drop the weekdays that leave planning needs). **Schedule** lists everything from today in months with the same rows as the phone agenda, the first 12 and "Show all" |
| 163 | Not carried over (Calendar) | The old page's per-traveller Gantt timeline, the **leave optimizer** (bridge days around Tuesday to Thursday holidays), its custom-event filter (events still show; adding or removing them is not on this page), and the six-lane colour table by leave type (the calendar colours by status; the leave type is in the sheet, the rows and the ring). The optimizer, event add/remove, the filter and leave-type colours were rebuilt later (decisions 212–214); only the Gantt timeline is still classic-only |
| 175 | One toast host | `components/Toaster.tsx` is the only toast host: an `rp-ink` pill at the bottom centre (above the tab bar on phones, `md:bottom-6` from tablet), about 6 s (8 s for errors), paused while hovered or focused, at most three transient toasts, errors announced assertively and the rest politely. `useUndoToast()` (`components/new/UndoToast.tsx`) now only feeds it (`toast.undo`), so a plain toast and an Undo toast are one stack and one look. Each toast carries its own `rp-root`, so it renders the same above an old page |
| 176 | Confirm dialog | `confirmDialog()` keeps its options and return value. The host draws an `RpDialog` (`components/new/RpDialog.tsx`): a centred 22px-radius card on a blurred page from 768px, a Smooth Drawer on phones. A `danger` confirm asks for the **Hold Button** (decision 9; label "Hold to <confirm label>") and focuses Cancel first; an ordinary confirm is a plain Cancel / Confirm pill pair with the confirm focused. Additive option `hold` overrides the Hold Button. With no host mounted (sign-in screens) it answers `false`; there is no native `confirm()` left. The dialog code, Vaul and the Hold Button load with the first confirmation |
| 177 | Standing notices are sticky toasts | Offline ("You're offline"), a new version ready (Reload) and the install prompt (Install, ✕ hides it for 7 days) are sticky toasts (`toast.info(..., { key, sticky: true })`) on the shared host, so they can never overlap another message. Back online shows a short confirmation. The iOS "Add to Home Screen" steps open in an `RpDialog`. `PWAInstallBanner` is now mounted by the New shell as well as the old one |
| 178 | Skeletons | `ViewSkeleton` and `InlineSkeleton` are `rp-surface` cards with pulsing `rp-line` bones (no shimmer, no glass), with their own `rp-root`, shaped like the page that loads (dashboard, map and atlas, lists). The New shell and its pages use them as Suspense fallbacks (`fullScreen` while the shell itself loads) |
| 179 | Error screens | Both boundaries keep their props. `ErrorPanel` shows a message only (never a stack), on one line, with web addresses reduced to their host, file paths dropped and a 300-character cap, plus **Copy details** (message, page path, version, time). Focus moves to the heading when it appears. `components/new/new.css` is imported by every shared host, so the tokens exist even when the root boundary renders before any lazy chunk |
| 180 | Toasts yield to bottom sheets | While a bottom sheet is open on a phone, `<html data-rp-sheet>` is set (`useSheetFlag`, called by Smooth Drawer and `RpSheet`) and the toast stack moves to the top, so a toast never covers a sheet's buttons |
| 181 | Scrim for phone sheets | Smooth Drawer's overlay was portalled outside `rp-root` and drew nothing. It now carries `rp-root` and the same light blur as the dialog (`bg-rp-canvas/50 backdrop-blur-xl`, §3.1: blur with a light veil, no dark dimming) |
| 182 | Shell sheets are modal | `RpSheet` takes `modal` (phones only, default off so a map stays explorable behind its settings). The shell's More and Quick actions sheets turn it on: focus trap, scroll lock, blur, focus moves in on open and returns to the tab bar button on close |
| 183 | Account menu | Follows the menu-button contract like the trip menu: focus moves to the first item, ↑ ↓ move between items, Escape closes and returns focus to the button, Tab or a click outside closes it |
| 184 | The toast list lives in the service | `services/toast.ts` holds the list, so a toast survives the host being remounted when the app swaps between the New shell, an old page and the sign-in screen. A lost session (401) now says "Your session ended. Sign in again to continue." on the sign-in screen, which mounts the host |
| 185 | Golden Hour variants retired for feedback | The Golden Hour toast and confirm variants are gone; the New hosts replace them for every theme |
| 186 | Local mode badge | The old shell's amber badge is the New mustard chip, at `z-sticky` so a blurred overlay covers it |
| 187 | Chart tooltips | `TooltipContent` is an `rp-surface` card with an `rp-shadow-float` shadow and its own `rp-root` (old pages still use it) |
| 188 | Overlay basics in one hook | `hooks/useOverlayA11y.ts`: Escape (captured, so only the top overlay closes), Tab trap, scroll lock, focus in on open and back on close. Used by `RpDialog` on tablet and up; Vaul covers the same on phones |
| 200 | Cutover: New pages are the default, the original interface is kept under `/classic` | The user approved making the New pages the default and retiring the old shell, **keeping every old file** until deletion is approved separately. The New pages take the clean paths; the old pages, Sidebar, GoldenSidebar, golden views, AmbientBackground and the old Auth work unchanged under `/classic`. `/classic` has exactly two entry points from the New UI: the trip menu's **Open in classic view** (TripNew; it was "Open trip" and went to the original trip page) and a **Classic interface** link under the Settings sections (it also says what is missing in the New pages). The old shell has a **New interface** button (sidebar and the phone More sheet) back to `/` |
| 201 | Interface themes never touch New pages | The Golden Hour and Departure Board skins are `theme-golden` and `theme-board` classes on `<html>`; they are now set **only** while a `/classic` page is open (App.tsx theme effect depends on the shell), so a stored `wandergrid_ui_theme` or `VITE_FF_UI_GOLDEN_HOUR` cannot restyle a New page. The stored value is never written or cleared by the New UI, and SettingsNew still offers Light, Dark and Match device only (decision 129). Golden views and `getPageTheme` are only reachable in `/classic` |
| 202 | One route table, tested | `utils/routes.ts`: `resolveRoute(pathname, search)` returns the shell (`new` or `classic`), the page (or the old `ViewState` and ids) and `redirectTo`; `PATHS` has the canonical paths and builders (`PATHS.trip(id)`, `PATHS.member(id)`); `navPathFor` gives the shell tab; `classicPathFor` builds `/classic` paths. `App.tsx` keeps one `route` state, re-read on `popstate` and after every in-app navigation (`navigateTo`). `tests/unit/routes.test.ts` covers canonical, alias, `-new` redirect and `/classic` |
| 203 | Canonical paths, aliases and redirects | New pages: `/` and `/dashboard`, `/planner` and `/trips` (both kept), `/trip/:id`, `/flights`, `/roadtrips`, `/map`, `/atlas` (+ `/travel-atlas`), `/calendar` (+ `/vacation-calendar`), `/user/:id` (+ `/member/:id`), `/settings`. The retired `-2` aliases and `/gamification` keep resolving with no redirect. **Every `-new` URL** (including `/trip-new/:id`, `/member-new/:id`, `/auth-new`) is replaced with `history.replaceState` by its canonical path, keeping the query (`?new=1`, `?route=JFK-CDG`) and hash, so bookmarks and dev links keep working. Old `/?view=settings` style links open the page and are replaced too. A trailing slash is ignored |
| 204 | Unknown paths | A path nothing handles shows **Page not found** inside the shell (`components/new/NotFoundNew.tsx`, `RpEmpty` with "Back to dashboard"), not the Dashboard as before. Under `/classic` an unknown path still opens the old Dashboard |
| 205 | Signed-out deep links | Signed out, **AuthNew** renders in place on any URL, so `/trip/abc` stays in the address bar and the page opens after sign-in (no more redirect to `/trips-new`). `/auth` and `/auth-new` are not pages: they are replaced by `/`. AuthNew's signed-in "Preview" mode is no longer reachable (the prop stays). A signed-out visitor on a `/classic` URL gets the old sign-in. A lost session keeps the URL as before |
| 206 | Where New links go | Every link inside the New pages and shell uses the canonical paths (`PATHS` or the literal path). `openNewPage` (devLinks) became `openPage` in `utils/appNavigation.ts` (push the path, fire `popstate`). Links that used to open an original page because no New page existed yet (Dashboard's "Log a flight", Calendar) now reach the New page. `MAP_PATH` is `/map` (`mapLink()` unchanged for callers) |
| 207 | Dev-only "New page" links removed | `components/new/devLinks.ts` is deleted; the dev link blocks in Sidebar, GoldenSidebar (desktop and phone More sheet) are replaced by the single **New interface** button. The old shell gets it through an `onOpenNew` prop, so old code still imports nothing from `components/new/` |
| 208 | Navigation inside `/classic` stays there | The old shell's own navigation, a trip opened from an old page, Back from the old trip page and an explicit sign-out (to `/classic`) all stay under `/classic`. Browser Back and Forward cross between New and classic pages because both are history entries of one app; the New UI never links to `/classic` otherwise (decision 200) |
| 209 | Shell state comes from the route | ShellNew's current tab is `navPathFor(page)` (Trip under Trips, Road trips under Flights; Settings, a member and not found have no tab), not `window.location.pathname`. The brand button goes to `/`; the mobile quick actions ask the route (not the URL text) whether the page is already open before dispatching `rp:new-trip`, `rp:new-flight`, `rp:new-roadtrip` |
| 210 | PWA, service worker, server | `public/manifest.json` shortcuts were already `/planner`, `/flights`, `/atlas`, `/calendar`, `/map` (they now open the New pages; `start_url` is `/`). The service worker's `navigateFallback` (`/index.html`, only `/api/` denied) and the Express `*` fallback already serve every path, `/classic/...` included, so neither changed; the server sends no redirects and renders no links (the share and calendar feed URLs are `/api/...`). The Content-Security-Policy is unaffected |
| 211 | e2e suite | The Playwright specs were written for the original pages. The `page` fixture now sends `page.goto('/x')` to `/classic/x` (`classicUrl` in `tests/e2e/support/fixtures.ts`), and the shell navigation and session specs expect `/classic/...` URLs; they keep testing the old UI. `tests/e2e/auth/routes.spec.ts` (new) covers the canonical routes, the `-new` redirects, not found, the Settings entry to `/classic` and a signed-out deep link. **Not run** (the suite runs only on tags and by hand, about 45 minutes); there are no New-page specs for flights, trips, calendar, settings or members yet |
| 212 | Leave optimizer | `utils/leaveOptimizer.ts` (`suggestBreaks`, pure, `tests/unit/leaveOptimizer.test.ts`), opened from the Tool Dock's **Leave optimizer** (sparkle). It replaces the old page's hard-coded Thursday, Tuesday and Wednesday rules: it takes **days off** as the workspace's non-working days plus the member's counted public holidays (with their weekend rule), groups them into runs, and for every run holding a holiday on a working day offers a **free long weekend** (three days or more, no leave), the **best value** (most days off per leave day) and the **longest break** (up to 5 leave days, 1.6 days off per leave day or better) by joining the run to the one before and/or after it. Working days already booked as leave are not asked for again. Look-ahead is 3, 6 or 12 months. Each card shows the break, the days to take, days off per leave day and whether the member's days left cover it; **Plan this leave** opens the leave sheet with those dates (the counting rules drop the weekend and the holiday inside) |
| 213 | Events: add, remove and a layer filter | The Tool Dock's **Add an event** (star, admins only because the server only lets admins write events) opens a sheet with a name, a day and "A working day"; the day sheet gets **Remove** on an event (admins). Both show the Undo toast. The chip row has **Trips, Holidays, Events** layer chips beside Leave only (what is shown, kept on this device); this replaces the old page's entitlement / holiday / event filter |
| 214 | Colour leave by type | Calendar options > **Colour leave by**: Status (the default, decision 151) or Leave type. By type a trip that uses leave takes its first leave type's colour (`EntitlementType.color`) as a tinted fill with a solid left edge (white text on the dark-mode accents would fail contrast, a tint reads on both themes), on month chips, phone dots, the year grid, the schedule and the day sheet; trips without leave keep their status colour, and the legend lists each type. The ten stored colours fold into the app's accents (blue and indigo are navy, teal and cyan sea, red and pink rust), so two types can share one: the legend and the chip's label name the type. Kept on this device |
| 215 | Country holiday calendars | **Add a country calendar** at the top of the Holidays sheet (admins): search a country by name or code, pick last year to two years ahead, add. The server proxies `GET /api/proxy/holidays/countries` and `/api/proxy/holidays/:year/:countryCode` (`backend_files/holidays.js`): **Nager.Date** first, **OpenHolidays** as the fallback when Nager is down or has nothing, normalised to one shape, **nationwide public holidays only** (regional days and bank, school and observance days are left out and counted in the toast), cached for a day with serve-stale (`fetchUpstream`), country codes and years validated before any request. In local mode (no server) the browser asks Nager.Date directly. A calendar is a `SavedConfig` with id `<CC>-<year>`; adding one that exists refreshes it and keeps the day-off switches; a member who already follows calendars follows the new one. An admin can remove one with a Hold button (members following it simply stop seeing it) |
| 216 | Why Nager.Date plus OpenHolidays | Nager.Date needs no key, covers about 100 countries and answers a year in one call; it was the planned source (decision 160). OpenHolidays is also keyless and carries more European detail, so it covers a Nager outage or a gap without a second code path on the client. Both are behind the backend proxy (AGENTS: all external calls go through `/api/proxy`), so the browser never depends on a third party's availability or CORS, and one upstream call per country and year is shared by every user |
| 217 | Trip ICS export | **Add to calendar** is in every trip menu (the Trips board, list and TripNew), writing `<trip-name>.ics` (`utils/tripIcs.ts`, `calendarService.downloadTrip`): the trip itself (all days), each transport at its real UTC time with the 3 hour reminder (the same event writer as the flight export, `transportEvent`), each stay as an all-day event from check-in to check-out with its confirmation, and each activity (a one-hour floating local time, or all day without a time). UIDs are stable (`<id>@wandergrid.app`) so importing it again updates the events; text is escaped and lines folded to 75 octets; records with no usable date are skipped instead of breaking the file |
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

---

## 9. Shared feedback and overlay components (decisions 175–188)

These are mounted by `App.tsx` and render the same above the New shell and above an old page, because each carries its own `rp-root` (the tokens only exist under that class) and imports `components/new/new.css`. Public APIs did not change; additions are marked *new*.

| Old component | API | Replaced by (New) |
| --- | --- | --- |
| `components/Toaster.tsx` + `services/toast.ts` | `toast.success/error/info(message, opts?)`, `errorMessage(err)`. *New:* `opts` = `{ duration, key, sticky, action, onDismiss }`; `toast.undo(message, onUndo, opts?)`; `toast.dismiss(idOrKey)`; calls return the toast id | `Toaster` (ink pill, `rp-root`). `useUndoToast()` is a front for the same list |
| `components/ConfirmHost.tsx` + `services/confirm.ts` | `confirmDialog(string \| { title?, message, confirmLabel?, cancelLabel?, danger? })` → `Promise<boolean>`. *New:* `hold?: boolean` (Hold Button; default on when `danger`) | `ConfirmHost` → `components/new/ConfirmDialog.tsx` → `RpDialog` (centred dialog, Smooth Drawer on phones) |
| `components/ErrorBoundary.tsx`, `components/AppErrorBoundary.tsx` | `children`; `routeKey`, `onResetToDashboard` | Unchanged props; both render `components/new/ErrorPanel.tsx` (decisions 111, 179) |
| `components/PWAInstallBanner.tsx` (+ `hooks/usePWA.ts`) | no props | Sticky toasts and `components/new/IosInstallHelp.tsx` (decision 177) |
| `components/skeletons/ViewSkeleton.tsx`, `InlineSkeleton.tsx` | `view`, new `fullScreen`; `className`, `rounded` | Same files, New look (decision 178) |
| `components/TooltipContent.tsx` | `title`, `rows`, `children` | Same file, `rp-surface` card (decision 187) |
| `components/new/ui.tsx` `RpSheet` | *New:* `modal` | Used modal by the shell's More and Quick actions sheets |
| `components/kokonutui/smooth-drawer.tsx` | A drawer with no `children` is one snap point as tall as its peek | Used by `RpDialog` on phones |

Not converted, because no New page renders them (the cutover retires them with their old pages): `FlightTrackerModal` (Dashboard, GoldenDashboard, GoldenFlights), `MapAppearanceModal` (ExpeditionMapView, DeckFlightMap, GoldenMap), `StandardDrawer` (`components/ui.tsx`, CarriersTab), `Modal` and the Golden dialogs in `components/ui.tsx` and `components/golden/`, `DataCreditsPopover` (imported nowhere). A grep of imports from `views/new`, `components/new`, `components/kokonutui`, `hooks` and `App.tsx` finds no old overlay component; the only old components `App.tsx` imports are the hosts above, `AmbientBackground` and the Golden registry.
