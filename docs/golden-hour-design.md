# Golden Hour design spec (flag `UI_GOLDEN_HOUR`)

Golden Hour is a full redesign, not a recolour. It replaces the glass system (Design.md) when the flag is ON.
Flag OFF must stay byte-for-byte the current app: never edit the original views for this work.

## Mechanics
- Each page has a redesigned variant at `views/golden/Golden<Name>.tsx`, registered in `views/golden/registry.ts`
  and picked in `App.tsx` when the flag is ON. Stubs pass through to the original page until replaced.
- Rewrite the page's JSX and layout from scratch in that file. Reuse the original's data loading, state and
  handlers (copy the logic you need; move shared logic into `hooks/` or `utils/` rather than editing the original).
- Build from `components/golden/Gh.tsx` (GhPage, GhCard, GhButton, GhChip, GhTabs, GhStat, GhEmpty).
  Add new shared pieces to `components/golden/` as new files, never by changing Gh.tsx semantics.
- Only touch your own page file(s) and new files under `components/golden/`. Do not edit `styles.css`,
  `tailwind.config.js`, `App.tsx`, the registry, the original views, or commit. The orchestrator commits.
- Existing `Modal`, `StandardDrawer`, configurators and maps may be reused as they are; restyling them is a later pass.

## Principles
1. Postcard, not dashboard: big photographic or illustrated hero moments (flat sunset shapes: sun circle, hills, waves), one per page at most.
2. Flat colour blocks: solid `sunset-coral|orange|sun|teal|lilac` tiles with `sunset-ink` text. No gradients on surfaces, no blur, no glass, no hairline borders.
3. Soft shapes: cards `rounded-3xl`, pills `rounded-full`, generous padding, big type (titles `font-black`, numbers `text-3xl+`).
4. Canvas: cream `sunset-cream` (light) / `sunset-night` (dark). Cards: white / `sunset-plum`. Muted fills: `sunset-sand` / `sunset-dusk`.
5. One coral primary action per view (`GhButton`), everything else `soft` or `ghost`.
6. Warm, human copy in sentence case ("Where next?"), short. No explanatory paragraphs.
7. Colour carries meaning: teal = distance/go, sun = time/cities, lilac = places/people, coral = action/next.
8. Mobile first: 44px targets, `aria-label` on icon-only buttons, controls centred under the header on mobile, grids stack.
9. Departure Board (`components/DepartureBoard.tsx`) is the pattern for any list of journeys (flights, trains, buses, ferries).

## Rules still binding from AGENTS.md
Date and currency via `utils/formatters.ts`; no arbitrary `z-[..]`; no raw `<select>` (use `GlassSelect` until a golden select exists);
`<EmptyState/>` equivalent is `GhEmpty`; no arbitrary hex in classes (use tokens in `tailwind.config.js`); run `npx tsc --noEmit` and `npm run lint:tokens`.

## Verifying
Set `VITE_FF_UI_GOLDEN_HOUR=true` in `.env.development.local` (already present), run the `dev` preview, check dark and light, mobile (375) and desktop.
Demo data: Auto-Setup on the first screen.
