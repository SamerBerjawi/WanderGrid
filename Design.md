# WanderGrid Design System & Architectural UI Specification (`design.md`)

This document establishes the official design system, component standards, visual tokens, and responsive layout guidelines for WanderGrid. **All existing, newly created, and redesigned pages, dialogs, drawers, and UI components across the application MUST strictly adhere to this specification.**

---

## 1. Core Principles & Aesthetic Foundation

WanderGrid's design language is built on three immutable pillars:
1. **Liquid Glass Everywhere**: Every card, floating pill, modal, dropdown, and button leverages Apple-inspired Liquid Glass (`@nkzw/liquid-glass` via the standardized `<GlassPanel />` and `<GlassButton />` wrappers).
2. **The Planner Standard**: The page layout, typography, icon treatment, action buttons, tab switcher, and multi-column grid established in `PlannerView.tsx` serves as the universal template for all views across WanderGrid.
3. **Radical Simplicity (Zero Text Clutter)**: The interface must remain clean, direct, and uncluttered. Obvious explanatory text, wordy helper paragraphs, and generic informational clutter are strictly prohibited. Every string must be purposeful and straight to the point.
4. **Fluid Mobile Responsiveness**: Every screen adapts seamlessly to mobile devices—compact horizontal gutters, centered hero headers, 44px Apple HIG touch targets, and natural column stacking.

---

## 2. Universal Page Layout Template (The "Planner Standard")

Every primary view in WanderGrid (Planner, Settings, Dashboard, Flights, Travel Atlas, Vacation Calendar, etc.) must implement the structural blueprint of `PlannerView.tsx`.

### 2.1 Page Shell & Gutters
```tsx
<div className="w-full max-w-[1680px] mx-auto pt-2 sm:pt-4 px-1 sm:px-4 md:px-6 lg:px-8 flex flex-col gap-5 sm:gap-6 animate-fadeIn pb-16">
  {/* 1. Hero Header */}
  {/* 2. Floating Tab Selector & Filter Bar */}
  {/* 3. Multi-Column Glass Bucket Grid */}
</div>
```
- **Mobile Gutters**: `px-1` (minimizes wasted screen space on small viewports).
- **Desktop Gutters**: `sm:px-4 md:px-6 lg:px-8`.
- **Max Width**: `max-w-[1680px] mx-auto`.

---

### 2.2 Hero Header (Title Left, Button Right on Mobile & Desktop)
The hero header must be clean, horizontal, and unboxed—no heavy rectangular banner containers.

```tsx
<div className="flex flex-row items-center justify-between gap-2.5 sm:gap-4 w-full pt-1 pb-1 text-left">
  {/* Left: Pure Icon + Responsive Scaled Title (Aligned Left) */}
  <div className="flex items-center justify-start gap-2 sm:gap-3 md:gap-4 min-w-0">
    <Compass 
      className="w-6 h-6 sm:w-9 sm:h-9 md:w-12 md:h-12 text-primary-500 shrink-0" 
      weight="duotone" 
    />
    <h1 className="text-xl sm:text-3xl md:text-5xl font-black text-light-text dark:text-dark-text tracking-tight leading-tight sm:leading-none truncate sm:overflow-visible">
      Expedition Planner
    </h1>
  </div>

  {/* Right: Primary Action Button (Aligned Right on Mobile & Desktop) */}
  <div className="flex items-center justify-end shrink-0">
    <Button 
      variant="primary" 
      className="shrink-0"
      onClick={handlePrimaryAction}
      icon={<Plus className="w-4 h-4" />} // Standard Phosphor Plus, NEVER duotone
    >
      New Trip
    </Button>
  </div>
</div>
```

- **Icon**: Pure Phosphor duotone icon (`weight="duotone"`), colored with semantic accent (`text-primary-500`, `text-emerald-500`, etc.), scaling from `w-6 h-6` on mobile to `w-12 h-12` on desktop.
- **Title**: `text-xl sm:text-3xl md:text-5xl font-black tracking-tight`. Always aligned to the **left** on both mobile and desktop.
- **Header Button**: Always aligned to the **right** on both mobile and desktop.
- **Everything Else Center**: All intermediate controls below the hero header (such as the floating tab switcher, filter bars, search controls, and segmented pickers) must be **centered** on mobile viewports.

---

### 2.3 Floating Liquid-Glass Tab Selector
The tab selector must use a floating `GlassPanel` (`wg-glass-pill`) with physics-based spring transitions.

```tsx
<div className="flex items-center justify-center sm:justify-start overflow-x-auto sm:overflow-visible no-scrollbar p-3 -m-3 shrink-0 w-full sm:w-auto">
  <GlassPanel
    className="wg-glass-pill shadow-lg shadow-black/5 dark:shadow-black/25 shrink-0"
    padding="4px 6px"
    overrides={{ borderRadius: 9999 }}
  >
    <div className="flex gap-1 relative items-center">
      {TABS.map((tab) => {
        const isSelected = activeTab === tab.id;
        const IconComponent = tab.icon;
        
        return (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`relative rounded-full text-xs font-bold transition-all duration-200 flex items-center justify-center cursor-pointer select-none active:scale-95 ${
              isSelected
                ? `${tab.activeText} px-4 sm:px-5 py-2.5`
                : 'text-light-text-secondary dark:text-dark-text-secondary hover:text-light-text dark:hover:text-dark-text px-3 sm:px-5 py-2.5'
            }`}
          >
            {isSelected && (
              <motion.div
                layoutId="activeTabIndicator"
                className={`absolute inset-0 rounded-full ${tab.activeBg} backdrop-blur-md border ${tab.activeBorder} ${tab.activeShadow} z-0`}
                style={{ WebkitBackdropFilter: 'blur(12px)' }}
                transition={{ type: "spring", stiffness: 450, damping: 32 }}
              />
            )}
            <span className="relative z-10 flex items-center gap-2 sm:gap-2.5">
              <IconComponent className="w-5 h-5 shrink-0" weight="duotone" />
              <span className={`tracking-tight ${isSelected ? 'inline' : 'hidden sm:inline'}`}>
                {tab.label}
              </span>
              {tab.count !== undefined && (
                <span className="text-2xs font-mono px-2 py-0.5 rounded-full font-bold border">
                  {tab.count}
                </span>
              )}
            </span>
          </button>
        );
      })}
    </div>
  </GlassPanel>
</div>
```

- **Unclipped Container**: Wrapper uses `p-3 -m-3` so shadow effects are not clipped on mobile or horizontally scrolled containers.
- **Spring Pill**: Motion indicator with `transition={{ type: "spring", stiffness: 450, damping: 32 }}`.
- **Responsive Labels**: On mobile, inactive tabs display icons and badges; active tab displays label.

---

### 2.4 Multi-Column Bucket Grid & Card Containers
All dashboard buckets, sub-sections, and content cards must be encased in `rounded-[28px] overflow-hidden` with `GlassPanel` (`wg-glass-card`).

```tsx
<div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
  {/* Column Bucket */}
  <div className="flex flex-col overflow-hidden rounded-[28px] lg:col-span-4">
    <GlassPanel
      className="wg-glass-card shadow-glass-card flex flex-col h-full overflow-hidden border border-black/5 dark:border-white/10"
      overrides={{ borderRadius: 28 }}
      padding="0px"
    >
      <div className="flex flex-col h-full w-full overflow-hidden rounded-[28px]">
        {/* Semantic Gradient Header Banner */}
        <div className="p-5 border-b border-black/5 dark:border-white/5 flex items-center justify-between bg-gradient-to-r from-primary-500/10 via-primary-500/5 to-transparent shrink-0">
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-10 h-10 rounded-2xl bg-gradient-to-br from-primary-500 to-indigo-600 text-white shadow-md shadow-primary-500/20 flex items-center justify-center shrink-0">
              <Compass className="w-5 h-5" weight="duotone" />
            </div>
            <div>
              <h2 className="text-base font-bold text-light-text dark:text-dark-text tracking-tight">
                Section Title
              </h2>
              <p className="text-2xs text-light-text-secondary dark:text-dark-text-secondary font-medium truncate mt-0.5">
                Concise subtitle description
              </p>
            </div>
          </div>
          {/* Header Action Button (optional) */}
        </div>

        {/* Card Body */}
        <div className="p-5 sm:p-6 space-y-4">
          {/* Content */}
        </div>
      </div>
    </GlassPanel>
  </div>
</div>
```

- **No Light Bleed**: Every container has `rounded-[28px] overflow-hidden` on both the outer wrapper and the inner content wrapper.
- **Semantic Gradient Banners**: `bg-gradient-to-r from-{color}-500/10 via-{color}-500/5 to-transparent` with matching duotone icon gradient.
- **Collapsible Buckets**: When columns hold dynamic lists, provide expand/collapse triggers with smooth height transitions.

---

## 3. UI Component Standards (Automatic Liquid Glass)

To guarantee that Liquid Glass is automatically applied to all UI elements without manual boilerplate, components must use the central design tokens and wrappers:

### 3.1 Buttons (`Button` / `GlassButton`)
- All buttons imported via `import { Button } from './components/ui'` automatically route through `GlassButton`, wrapping them in `GlassPanel` (`wg-glass-pill`).
- **Variants**:
  - `variant="primary"`: Vibrant primary tint (`bg-primary-500/25 border border-primary-500/30 text-primary-600 dark:text-primary-400 font-bold`).
  - `variant="secondary"`: Neutral frosted glass (`bg-black/5 dark:bg-white/5 hover:bg-black/10 dark:hover:bg-white/10`).
  - `variant="danger"`: Rose warning glass (`bg-rose-500/20 border border-rose-500/30 text-rose-600 dark:text-rose-400`).
  - `variant="outline"`: Minimal hairline border with glass refraction.
- **Plus Icon Rule**: Whenever a `+` icon is used on a button or trigger, it MUST be the **standard Phosphor `Plus` icon (NOT duotone)**:
  ```tsx
  <Button icon={<Plus className="w-4 h-4" />}>Add Item</Button>
  ```
- **Touch Target**: Always enforce minimum 44px touch height (`min-h-[44px]`).

---

### 3.2 Text Fields & Inputs (`Input`, `INPUT_BASE_STYLE`)
All single-line inputs, numeric controls, date pickers, and textareas must use `INPUT_BASE_STYLE`:

```tsx
export const INPUT_BASE_STYLE = 
  'w-full px-4 py-2.5 min-h-[44px] rounded-xl bg-white/70 dark:bg-dark-card/70 backdrop-blur-md border border-black/10 dark:border-white/10 text-light-text dark:text-dark-text placeholder-light-text-secondary/50 dark:placeholder-dark-text-secondary/50 focus:outline-none focus:ring-2 focus:ring-primary-500/30 focus:border-primary-500 transition-all duration-150 text-sm';
```

- **Height**: Strictly `min-h-[44px]` (Apple HIG).
- **Surface**: Frosted `bg-white/70 dark:bg-dark-card/70 backdrop-blur-md` with hairline border `border-black/10 dark:border-white/10`.
- **Focus**: Subtle colored ring (`focus:ring-2 focus:ring-primary-500/30 focus:border-primary-500`).

---

### 3.3 Dropdown Selectors (`LiquidGlassSelect`, `Select`)
- **Single-select / Filters**: Use `LiquidGlassSelect` from `../components/LiquidGlassSelect.tsx`.
- Trigger uses a floating glass pill (`wg-glass-pill`) with duotone icon and chevron.
- Portal menu renders in a floating glass card with custom scrollbars and search filtering.
- On mobile devices, uses responsive label shorthands (`mobilePlaceholder`) and center/full-width alignment.

---

### 3.4 Cards (`Card`)
- `<Card>` in `components/ui.tsx` automatically renders with `GlassPanel` (`wg-glass-card`, `overrides={{ borderRadius: 28 }}`).
- Never write plain `<div className="bg-white border ...">` for elevated content cards. Always consume `<Card>` or wrap explicitly in `<GlassPanel className="wg-glass-card">`.

---

### 3.5 Segmented Controls & Tabs (`Tabs`)
- `<Tabs>` in `components/ui.tsx` automatically renders inside `GlassPanel` (`wg-glass-pill`) with spring indicator animations.

---

### 3.6 Modals & Drawers (`Modal`, `StandardDrawer`)
- **Backdrop**: `bg-gray-900/50 dark:bg-black/80 backdrop-blur-md` (`-webkit-backdrop-filter: blur(12px)`).
- **Container**: `GlassPanel` (`wg-glass-card`, `overrides={{ borderRadius: 28 }}`).
- **Footer**: Sticky frosted glass footer (`bg-white/80 dark:bg-dark-card/80 backdrop-blur-md`).
- **Touch Target**: Close button strictly `min-w-[44px] min-h-[44px]`.

---

## 4. Radical Simplicity: Zero Unnecessary Text

WanderGrid is an elite travel command platform; it is not a novice tutorial. Cluttering views with obvious informational text harms readability and degrades aesthetic quality.

### Strictly Enforced Copy Rules:
1. **No Obvious Helper Text**: Do NOT include sentences like *"Enter your destination in the box below to begin searching for trips"* or *"This section contains your preferences"*.
2. **Concise Subtitles Only**: Subtitles under titles should be a single brief phrase (e.g., *"Workspace identity & regional settings"*, not a multi-line paragraph).
3. **Use Semantic Status Pills**: Instead of paragraphs explaining state, use concise badges:
   - Active / Confirmed: `sky` or `emerald` pill (`px-2 py-0.5 rounded-full text-2xs font-bold uppercase tracking-wider`).
   - Planned / Draft: `amber` pill.
   - Danger / Revoked: `rose` pill.
4. **Action-Oriented Microcopy**: Button text must be active and specific: *"New Trip"*, *"Save Settings"*, *"Download JSON"*, *"Restore File"*.

---

## 5. Mobile Adaptability Checklist

Every component and view must pass this mobile checklist:
- [ ] **Edge-to-Edge Margins**: Top container has `px-1 sm:px-4 md:px-6 lg:px-8`.
- [ ] **Centered Headers**: Page title and primary action are centered on mobile viewports.
- [ ] **No Hidden Action Buttons**: Action buttons must never overflow or hide behind fixed footers. They take full width on mobile (`w-full sm:w-auto`).
- [ ] **Horizontal Scroll Breathing Room**: Horizontally scrollable pill bars (tabs, filters) use `p-3 -m-3` to prevent clipping shadows.
- [ ] **44px Minimum Touch Targets**: Every button, input, tab item, and modal close trigger has at least `min-h-[44px]` and `min-w-[44px]`.
- [ ] **Stacked Column Grids**: Multi-column grids (`grid-cols-1 lg:grid-cols-12`) collapse cleanly to single-column on mobile.
- [ ] **Keyboard Resilient**: Modals and drawers dismiss cleanly on Escape key and have scrollable internal bodies (`custom-scrollbar`).

---

## 6. Token & Color Scale Quick Reference

| Token | Light Mode | Dark Mode | Purpose |
| :--- | :--- | :--- | :--- |
| **Glass Card** | `bg-white/90 backdrop-blur-sm` | `bg-dark-card/90 backdrop-blur-sm` | All primary cards & dialogs |
| **Glass Pill** | `bg-white/80 backdrop-blur-md` | `bg-dark-card/80 backdrop-blur-md` | Tabs, filters, buttons |
| **Hairline Border** | `border-black/5` | `border-white/10` | Inner dividers & card shells |
| **Primary Accent** | `primary-500` / `indigo-600` | `primary-400` / `indigo-500` | Active tabs, primary buttons |
| **Confirmed / Sky** | `sky-500` / `sky-600` | `sky-400` / `sky-300` | Confirmed trips, flights |
| **Past / Emerald** | `emerald-500` / `teal-600` | `emerald-400` / `teal-400` | Past trips, log history |
| **Planned / Amber** | `amber-500` / `orange-600` | `amber-400` / `amber-300` | Draft / upcoming plans |
| **Danger / Rose** | `rose-500` / `red-600` | `rose-400` / `rose-300` | Destructive actions, warnings |

---

*This specification is active and binding for all development on WanderGrid.*
