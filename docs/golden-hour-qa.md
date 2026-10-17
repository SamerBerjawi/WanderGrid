# Golden Hour and Departure Board QA checklist

Themes: `golden` and `board` (user picks in Settings, config/uiTheme.ts). Set via localStorage in the dev preview:
`localStorage.setItem('wandergrid_ui_theme','golden'|'board')`, then reload. Light/dark: `localStorage.setItem('wandergrid_theme_preference','light'|'dark')`, reload.
Check every page at 375px (mobile), 768px (tablet) and 1280px (desktop) in all four combinations: golden light, golden dark, board light, board dark.
Wait ~5s after load before judging: pages fade in and screenshots taken earlier look dim. Restart the dev server if tailwind.config.js changed.

For each page, and for every modal, drawer, menu and form it opens:
1. **Correct**: nothing clipped, overlapping, overflowing or unreadable; no raw unstyled (classic glass, blue, amber) leftovers; text contrast is readable (esp. text on sunset-sun / teal / lilac tiles, board paper vs night); icons present and aligned; empty, loading and error states exist.
2. **Responsive**: no horizontal page scroll at 375px; 44px touch targets; controls wrap or scroll sensibly; tables/boards collapse to cards; bottom nav does not cover content; headers and titles wrap rather than truncate.
3. **Light and dark**: both look intentional. No white-on-white or dark-on-dark. Board is dark first, light uses paper.
4. **On/off states**: every toggle, switch, checkbox, segmented control, tab, filter chip, view-mode button, pill and selectable card must show a clearly different ON state (filled coral/amber background or ring, contrasting text) versus OFF, in all four combinations, and expose it semantically (`aria-pressed`, `aria-checked`, `aria-selected` or `aria-current`). Also check hover, keyboard focus ring, pressed and disabled.
5. **Interactions work**: click each primary control, open each modal, submit or cancel forms, switch tabs and views; check the browser console for errors.

Fix problems in your own page files and new files under components/golden/. For shared pieces (components/golden/Gh.tsx, GhControls, styles.css, tailwind.config.js, App.tsx, components/glass/*, components/ui.tsx) use small targeted Edit calls and mention each in your report. Do not commit.
Run `npx tsc --noEmit` and `npm run lint:tokens` before reporting. Report what you fixed, what you could not verify, and any remaining issue.
