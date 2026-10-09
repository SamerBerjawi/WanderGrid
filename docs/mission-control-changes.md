# Mission Control Reorganisation (MC-01 to MC-10)

This document tracks all changes made to reorganize WanderGrid's "Mission Control" (Map Appearance Settings) panel into a cleaner, plain-language, Liquid Glass interface adhering to the GEV architecture and `design.md` specifications.

---

## Legacy Removal
- The legacy 1,463-line modal and the `MC_NEW_PANEL` feature flag have been removed.
- `components/MapAppearanceModal.tsx` is a thin alias of `MapSettingsPanel`, kept so existing imports keep working.

---

## Implementation Ledger

### MC-01: Shared Glass Controls
- **Files**:
  - `components/glass/GlassToggle.tsx`: Liquid glass switch with accessible ARIA tokens, 44px hit target, accent token support.
  - `components/glass/GlassSegmented.tsx`: Single- and multi-select segmented control with icon and check support, wrapping cleanly.
  - `components/glass/GlassSlider.tsx`: Styled slider with live indicator and touch targets.
  - `components/glass/SettingRow.tsx`: Standard setting item row `[label + helper] ↔ [control]` with expandable child content.
  - `components/glass/SettingsSection.tsx`: Liquid glass sub-card container for grouping settings.

### MC-02: New Structure (Map / Layers / Trips / Filter)
- **Files**:
  - `components/mapSettings/MapSettingsPanel.tsx`
  - `components/mapSettings/tabs/MapTab.tsx`
  - `components/mapSettings/tabs/LayersTab.tsx`
  - `components/mapSettings/tabs/TripsTab.tsx`
  - `components/mapSettings/tabs/FilterTab.tsx`
- **Tabs**: Fixed order (Map, Layers, Trips, Filter), equal widths, never truncating at 360px viewport.
- **Default**: Opens on `Map` tab.

### MC-03: Plain-Language Labels & Centralized Strings
- **Files**:
  - `components/mapSettings/labels.ts`: Central repository of all user-facing copy.
  - `components/DeckFlightMap.tsx`: Updated entry pill to use `labels.panelTitle`.
- **Changes**: Removed marketing fluff ("FREE" badges, "Zero Key Required", "14-Band Penumbra", etc.).

### MC-04: Basemap Picker
- **Files**:
  - `components/mapSettings/tabs/MapTab.tsx`
- **Changes**: Unified basemap cards visible in both light & dark themes, grouped into Auto, Streets, Dark, Imagery, and Special. Memoized card rendering.

### MC-05: Header & Footer Actions
- **Files**:
  - `components/mapSettings/MapSettingsPanel.tsx`
- **Changes**: Removed unlabelled refresh icon in header. Added sticky footer with explicit "Reset settings" (with confirmation dialog), optional "Recenter map" (calling `onResetCamera`), and "Done" button. Added `onResetAll` support for parent reset handlers.

### MC-06: Context-Sensitive Controls (No No-Ops)
- **Changes**: Controls render only when their corresponding parent handler is provided. Removed internal fallback state (`internalFlightsOnly`, `internalLandSea`, `internalCometFlow`, `internalCluster`).
- **Context Matrix**:
  1. **ExpeditionMapView**: Passes all handlers. Shows View Preset (All, Flights, Land & sea, Scratch map); Flight routes & Land/sea routes; Airports group (size, size by traffic, runway detail, solo mode); Routes group (color, thickness, animate, cluster, follow roads/rails); when in Scratch view, shows Scratch map group (city pins, lived in, layovers, wishlist) and hides routes/airports; Filter tab present.
  2. **Dashboard**: Embedded via `DeckFlightMap` without parent handlers. Map Tab: View, Basemaps, Stars & Atmosphere, Day & Night. Layers Tab: Rain Radar, Relief Shading, Rail Lines, Aviation Charts (if key present). Trips Tab: Airports (size, size by traffic, runway detail, solo focus) and Routes (color, thickness, follow roads & rails). No no-op view mode, flight route switches, animate, cluster, scratch groups, or filter tab.
  3. **TripDetail**: Same as Dashboard (DeckFlightMap without parent dynamics).
  4. **RoadTrips**: Same as Dashboard (DeckFlightMap without parent dynamics).

### MC-07: Filter Tab Polish
- **Files**:
  - `views/ExpeditionMapView.tsx`
  - `components/mapSettings/tabs/FilterTab.tsx`
- **Changes**: Restyled status selector to `GlassSegmented`, dates to `GlassDatePicker`, and multi-select dropdowns. Added active-filter count badge on Filter tab and top "Clear filters" button.

### MC-08: Mobile Bottom Sheet
- **Files**:
  - `components/mapSettings/MapSettingsPanel.tsx`
- **Changes**: Below 640px, renders as a bottom sheet with drag handle allowing the map to stay visible above it.

### MC-09: Performance & Dead Settings Cleanup
- **Changes**: Debounced slider persistence (200ms delay, flushed on pointer up/close). Removed unreferenced `flightInterpolation` setting. Memoized basemap list.

### MC-10: Icons Instead of Emoji
- **Changes**: Replaced all emoji characters with Phosphor icons and legend dots matching map layers:
  - Swatches: `Sparkle` (Auto/Night lights), `MapTrifold` (Streets), `Sun` (Bright), `Compass` (Light), `Moon` (Dark), `Mountains` (Dark blue), `Planet` (Satellite), `Buildings` (3D), `Waves` (Ocean).
  - Territory highlights:
    - Lived in: `House` icon with emerald theme (`[16, 185, 129]`)
    - Layovers only: `AirplaneLanding` with amber theme (`[245, 158, 11]`)
    - Wishlist: `Star` with rose theme (`[244, 63, 94]`)
- **Verification**: Verified zero emoji characters in `components/mapSettings/` and `components/glass/`.
