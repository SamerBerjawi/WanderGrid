---
version: 2.0
name: Crystal Design System & UI/UX Specification (WanderGrid)
description: Apple HIG + Frosted Glassmorphism (iOS / macOS Sequoia aesthetic) visual identity
colors:
  primary: "#fa9a1d"
  primary-50: "#fef8f0"
  primary-100: "#fdeed9"
  primary-200: "#fbddb1"
  primary-300: "#faca89"
  primary-400: "#fcb045"
  primary-500: "#fa9a1d"
  primary-600: "#e78310"
  primary-700: "#c1670e"
  primary-800: "#995111"
  primary-900: "#7d4312"
  semantic-red: "#FF3B30"
  semantic-green: "#34C759"
  semantic-yellow: "#FFCC00"
  semantic-blue: "#007AFF"
  light-bg: "#FAFAFA"
  light-card: "rgba(255, 255, 255, 0.75)"
  light-text: "#181D27"
  light-text-secondary: "#414651"
  light-separator: "rgba(0, 0, 0, 0.08)"
  light-fill: "#F8FAFC"
  dark-bg: "#050505"
  dark-card: "rgba(23, 23, 23, 0.75)"
  dark-text: "#FFFFFF"
  dark-text-secondary: "#CECFD2"
  dark-separator: "rgba(255, 255, 255, 0.1)"
  dark-fill: "rgba(30, 34, 48, 0.5)"
typography:
  sans:
    fontFamily: "'Plus Jakarta Sans', Inter, -apple-system, BlinkMacSystemFont, 'SF Pro Text', system-ui, sans-serif"
    fontFeatureSettings: "cv02, cv03, cv04, cv11"
rounded:
  xl: 12px
  2xl: 16px
  3xl: 24px
spacing:
  touch-min: 44px
  card-padding: 16px 24px
  gap-micro: 6px 8px
---

# 💎 Crystal Design System & UI/UX Specification

## 1. Core Visual Identity & Philosophy
- **Style Archetype:** Apple Human Interface Guidelines (HIG) + Frosted Glassmorphism (iOS / macOS Sequoia aesthetic).
- **Core Mood:** Clean, sleek, high-contrast, data-dense yet breathable, tactile, and responsive.
- **Key Characteristics:** Multi-level backdrop blurs, subtle border hairlines (`rgba(255,255,255,0.1)`), translucent content layers, inner top-edge highlights (reflection/refraction), and smooth micro-interactions.

---

## 2. Color Palette & Theming Tokens

### **Primary Accent (Warm Amber / Gold)**
The signature brand accent is energetic warm amber/gold:
- **`primary-500` (Main Accent):** `#FA9A1D`
- **`primary-50`:** `#FEF8F0`
- **`primary-100`:** `#FDEED9`
- **`primary-200`:** `#FBDDB1`
- **`primary-300`:** `#FACA89`
- **`primary-400`:** `#FCB045`
- **`primary-600`:** `#E78310`
- **`primary-700`:** `#C1670E`
- **`primary-800`:** `#995111`
- **`primary-900`:** `#7D4312`

### **Canvas & Surfaces**

#### **Light Mode:**
- **Canvas Base:** `#FAFAFA`
- **Primary Text:** `#181D27` / `#2D2D2D`
- **Secondary Text:** `#414651` / `#404040`
- **Tertiary Text:** `#535862`
- **Muted / Quaternary Text:** `#717680`
- **Borders & Separators:** `rgba(0, 0, 0, 0.08)` or `#E5E7EB`
- **Card Background:** `rgba(255, 255, 255, 0.6)` to `rgba(255, 255, 255, 0.85)`

#### **Dark Mode:**
- **Canvas Base (Deep OLED/Charcoal):** `#050505`
- **Card Surface (`dark-card`):** `rgba(23, 23, 23, 0.6)` to `rgba(23, 23, 23, 0.85)`
- **Elevated Modals / Popovers:** `rgba(28, 28, 31, 0.9)`
- **Primary Text:** `#FFFFFF`
- **Secondary Text:** `#CECFD2` / `#D1D5DB`
- **Tertiary Text:** `#94969C`
- **Muted / Quaternary Text:** `#85888E`
- **Borders & Hairlines:** `rgba(255, 255, 255, 0.1)` to `rgba(255, 255, 255, 0.15)`

### **Semantic Indicators**
- **Success / Positive:** `#34C759` (Apple Green)
- **Danger / Negative:** `#FF3B30` (Apple Red)
- **Warning / Alert:** `#FFCC00` (Apple Yellow) / `#F59E0B`
- **Information / Neutral Action:** `#007AFF` (Apple Blue)

---

## 3. Frosted Glassmorphism & Blur System

The depth hierarchy is built using 3 primary glass layers and specific backdrop filters:

| Component Level | Tailwind Classes / CSS Rules |
| :--- | :--- |
| **Glass Navbars & Toolbars** | `bg-white/75 dark:bg-dark-card/85 backdrop-blur-xl border-b border-black/5 dark:border-white/10` |
| **Standard Glass Cards** | `bg-white/60 dark:bg-dark-card/60 backdrop-blur-md dark:backdrop-blur-xl border border-black/5 dark:border-white/10 shadow-card` |
| **Elevated Surfaces / Modals** | `bg-white/90 dark:bg-dark-card/90 backdrop-blur-2xl border border-black/10 dark:border-white/15 shadow-modal` |
| **Modal Backdrops** | `bg-gray-900/50 dark:bg-black/80 backdrop-blur-md` |

### **The Signature "Edge Light Reflex" (Dark Mode Glass Edge)**
To make cards feel like physically refractive glass panes, apply an inset top hairline highlight:
```css
box-shadow: inset 0 1px 0 0 rgba(255, 255, 255, 0.1);
```
*(Combined with subtle drop shadow: `box-shadow: 0 8px 30px -4px rgba(0, 0, 0, 0.3), inset 0 1px 0 0 rgba(255, 255, 255, 0.1);`)*

---

## 4. Typography Hierarchy (Apple HIG Scale)

- **Primary Font Family:** `Plus Jakarta Sans`, `Inter`, `-apple-system, BlinkMacSystemFont, "SF Pro Text", system-ui, sans-serif`
- **Font Feature Settings:** `cv02`, `cv03`, `cv04`, `cv11` (clean tabular numbers & crisp glyphs).

### **Scale:**
1. **Large Title (H1 / Page Title):**  
   `text-2xl md:text-4xl font-bold tracking-tight leading-tight text-primary`
2. **Title 2 (H2 / Section Title & Modal Headings):**  
   `text-xl md:text-2xl font-semibold tracking-tight leading-snug text-primary`
3. **Title 3 (H3 / Card & Widget Titles):**  
   `text-lg font-semibold leading-snug text-primary`
4. **Headline / Sub-card Heading (H4):**  
   `text-base font-semibold leading-snug text-primary`
5. **Subhead / Description:**  
   `text-sm md:text-base font-normal leading-normal text-secondary`
6. **Body:**  
   `text-base font-normal leading-relaxed text-primary`
7. **Body Compact / Data Values:**  
   `text-sm font-normal leading-normal text-secondary`
8. **Footnote / Metadata / Date:**  
   `text-xs font-medium text-tertiary`
9. **Kicker / Eyebrow (Category Chips):**  
   `text-xs font-semibold uppercase tracking-wider text-tertiary`

---

## 5. Geometry & Corner Radii Scale

Follow an 8pt / 4pt spatial rhythm with organic, modern rounded corners:
- **Micro-Badges & Indicators (`rounded-md` / `rounded-lg`):** `6px` – `8px`
- **Interactive Controls (`rounded-xl`):** `12px` (Buttons, inputs, selects, dropdowns, search triggers).
- **Cards & Primary Containers (`rounded-2xl` / `rounded-3xl`):** `16px` – `24px` (Dashboard cards, charts, bottom sheets `rounded-t-[28px] md:rounded-3xl`).
- **Capsules & Chips (`rounded-full`):** Filter pills, status badges, avatar chips, floating action capsules.

---

## 6. Spacing, Rhythm & Layout Grid

- **Micro Spacing:** `gap-1.5` to `gap-2` (6px–8px) between icon and text.
- **Form / Input Controls:** `px-4 py-2.5`, minimum `44x44px` (`min-h-[44px]`) touch target area on mobile.
- **Card Padding:** `p-4 sm:p-6` (16px on mobile, 24px on desktop).
- **Section Spacing:** `space-y-6 sm:space-y-8` (24px to 32px vertical rhythm).
- **Grid Layouts:** Fluid auto-fitting grids (`grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4 sm:gap-6`).

---

## 7. Interactive States & Micro-UX

1. **Buttons & Action Items:**
   - **Primary Action:** `bg-[#FA9A1D] hover:bg-[#E78310] text-white font-medium shadow-sm transition-all duration-150 active:scale-[0.98]`
   - **Secondary Glass Action:** `bg-white/10 hover:bg-white/20 dark:bg-white/5 dark:hover:bg-white/10 border border-black/5 dark:border-white/10 text-primary transition-all`
   - **Danger Action:** `bg-semantic-red hover:bg-semantic-red/90 text-white font-medium shadow-sm transition-all duration-150 active:scale-[0.98]`
   - **Ghost Action:** `hover:bg-black/5 dark:hover:bg-white/5 text-secondary hover:text-primary transition-colors`
   - **Close Button Standard:** `w-11 h-11 min-w-[44px] min-h-[44px] rounded-xl flex items-center justify-center text-light-text-secondary dark:text-dark-text-secondary hover:bg-black/5 dark:hover:bg-white/5 transition-colors cursor-pointer`
2. **Hover Elevate:** Cards and interactive list rows gently brighten or shift: `transition-all duration-200 hover:border-black/15 dark:hover:border-white/20`.
3. **Smooth Transitions:** Use `transition-all duration-150 ease-out` for snappy, native-like iOS responsiveness.
4. **Scrollbars:** Ultra-thin, translucent scrollbars that blend into the canvas background (`scrollbar-thin scrollbar-thumb-white/20`).

---

## 8. Layer Stacking & Z-Index Scale

All surfaces and overlays strictly follow the standardized z-index scale defined in `tailwind.config.js`:

| Layer Name | Tailwind Token | Numeric Value | Use Case |
| :--- | :--- | :--- | :--- |
| **Dropdown** | `z-dropdown` | `30` | Autocomplete menus, select dropdowns, context flyouts |
| **Sticky Header** | `z-sticky` | `40` | Sticky navigation headers, topbars, floating sub-navs |
| **Modal Backdrop** | `z-modal-backdrop` | `50` | Frosted backdrop overlay (`bg-gray-900/50 dark:bg-black/80 backdrop-blur-md`) |
| **Modal / Dialog** | `z-modal` | `60` | Slide-out drawers, modal shells, fullscreen dialogs |
| **Popover** | `z-popover` | `70` | Floating tooltips, overlay controls, modal-level close buttons |
| **Toast / Alert** | `z-toast` | `80` | Notification toasts, floating banner alerts |
| **Tooltip** | `z-tooltip` | `90` | Hover tooltips, chronometer tooltips, debug overlays |

*Direct, arbitrary z-index classes like `z-[9000]`, `z-[9999]`, or `z-[60]` are strictly forbidden.*

---

## 9. Temporal & Currency Formatting Engine

All date, time range, and monetary calculations must be routed through the central `utils/formatters.ts` engine. Direct `Date.toLocaleDateString()` and string concatenations are prohibited.

- **Workspace Preference Synchronization:** `formatDate` and `formatDateRange` dynamically resolve the user's `WorkspaceSettings.dateFormat` (`MM/DD/YYYY`, `DD/MM/YYYY`, `YYYY-MM-DD`).
- **Available Date Styles:**
  - `numeric`: `10/24/2026` or `24/10/2026`
  - `short`: `Oct 24` or `24 Oct`
  - `short-with-year`: `Oct 24, 2026` or `24 Oct 2026`
  - `medium`: `Oct 24, 2026`
  - `long`: `October 24, 2026`
  - `weekday-short`: `Sat, Oct 24`
  - `weekday-long`: `Saturday, October 24, 2026`
  - `month-year`: `Oct 2026`
- **Range Formatting:** `formatDateRange(start, end)` smartly compresses same-month and same-year intervals (e.g., `Oct 12 – 18, 2026` or `12 – 18 Oct 2026`).
- **Monetary Formatting:** `formatCurrency(amount, currency)` uses `Intl.NumberFormat` respecting the active workspace currency code (`USD`, `EUR`, `GBP`, `AUD`).

---

## 10. Empty State Guidelines

Whenever a dataset, collection, or search query produces zero results, render the shared `<EmptyState />` primitive (`components/EmptyState.tsx`) rather than ad-hoc cards:

- **Icon Container:** Centered `w-16 h-16` rounded-2xl container with primary accent or thematic icon.
- **Heading:** High-contrast `text-lg font-bold text-light-text dark:text-dark-text tracking-tight`.
- **Description:** Concise, actionable explanation in `text-xs text-light-text-secondary dark:text-dark-text-secondary max-w-sm`.
- **Action Buttons:** Minimum 44px height primary action button (`BTN_PRIMARY_STYLE h-11`) and optional secondary ghost/outlined button.

---

## 11. Loading States & Feedback Conventions

1. **Initial / Container Load:** Use animated skeleton cards (`bg-black/5 dark:bg-white/5 animate-pulse rounded-2xl`) matching the layout geometry to avoid cumulative layout shifts (CLS).
2. **Inline / Action State:** Use button `isLoading` property with a subtle spinner (`w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin`) and disabled pointer events.
3. **Background Sync:** Subtle header status pill with spinning sync icon.

---

## 12. Accessibility & Touch Target Standards

- **Touch Targets:** All interactive controls (buttons, tabs, inputs, selects, close triggers) must have a minimum clickable hit box of **44×44px** on touch surfaces.
- **Icon Buttons:** Any button displaying solely an icon must provide an unambiguous `aria-label` attribute (e.g. `aria-label="Close modal"`).
- **Interactive Elements:** Always use semantic `<button>` elements with keyboard focus states (`focus-visible:ring-2 focus-visible:ring-primary-500`) rather than clickable `<div>` wrappers.

