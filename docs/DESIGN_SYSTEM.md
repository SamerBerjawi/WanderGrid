# Design system (index)

> Status: first draft from the 2026-11-12 audit. This file is a map, not a second spec. The authority for the
> current interface is **[UI_UX_DESIGN_REFERENCE.md](../UI_UX_DESIGN_REFERENCE.md)**.

## Which document governs what

| Document | Governs | Current? |
| --- | --- | --- |
| `UI_UX_DESIGN_REFERENCE.md` | Tokens, type, surfaces, shell, overlays, motion, component mapping (KokonutUI first), per-page decisions (§7 decision log) | **Yes — authority** |
| `components/new/new.css` + `tailwind.config.js` | The `rp-*` tokens and Tailwind scale actually shipped | Yes (source of truth for values) |
| `scripts/check-tokens.mjs` | z-index scale, no arbitrary hex, valid shades (CI) | Yes |
| `docs/archive/Design.md` | Glass/`GlassPanel`/`PlannerView` system of the removed interface | **No** — describes deleted code |
| `AGENTS.md` §7–§11 | Modal, glass and layout rules of the removed interface | **No** — superseded |

Until `docs/archive/Design.md` and `AGENTS.md` §7–11 are archived or rewritten (DECISIONS D-05), follow this table.

## Primitives to reach for first

| Need | Use | File |
| --- | --- | --- |
| Dialog / sheet | `RpDialog` | `components/new/RpDialog.tsx` |
| Confirm a destructive action | `ConfirmDialog` / `ConfirmHost` | `components/new/ConfirmDialog.tsx`, `components/ConfirmHost.tsx` |
| Undo after delete | `UndoToast` | `components/new/UndoToast.tsx` |
| Buttons, pills, cards, segmented controls | `ui.tsx` exports | `components/new/ui.tsx` |
| Form fields, place search | `fields.tsx`, `PlaceField` | `components/new/` |
| Error with retry | `ErrorPanel` | `components/new/ErrorPanel.tsx` |
| Page header actions | `PageToolbar` | `components/new/PageToolbar.tsx` |
| Icons | Hugeicons adapter; user-picked icons via `RpHugeicon` | `components/ui/hugeicons.tsx`, `components/new/RpHugeicon.tsx` |
| Charts | `components/bklit/*` | — |
| Dates and money | `formatDate`, `formatDateRange`, `formatCurrency` | `utils/formatters.ts` |

## Non-negotiables (enforced or checked)

- No arbitrary `z-[…]`, no arbitrary hex, valid palette shades (`npm run lint:tokens`, CI).
- 44 px touch targets; `aria-label` on icon-only buttons; 11 px minimum text.
- Every async surface has loading, empty, error-with-retry and success states.
- Light and dark verified at desktop, tablet and mobile widths before a UI change is called done.

## Known gaps (from the audit)

- Form labels are not always tied to inputs (the sign-in email field is announced by its placeholder).
- `RpHugeicon` loads the full Hugeicons set (~6 MB chunk) the first time any trip with a chosen icon renders.
- Vendored KokonutUI files are large (up to ~1.5k lines) and partly unused; each needs an owner or removal.
