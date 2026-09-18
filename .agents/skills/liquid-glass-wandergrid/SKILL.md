---
name: liquid-glass-wandergrid
description: Standard Liquid Glass styling guidelines, configuration, and usage patterns for WanderGrid using @nkzw/liquid-glass and the GlassPanel wrapper.
---

# Skill: Implement Liquid Glass Styling in WanderGrid

## Purpose
Integrate Apple's Liquid Glass visual effect into the WanderGrid app
(https://github.com/samerberjawi/wandergrid) using the `@nkzw/liquid-glass`
React library (https://github.com/nkzw-tech/liquid-glass, a fork of
`liquid-glass-react`). This is the permanent reference for how Liquid Glass
should be configured and used across the app. Any future glass-styled UI
in WanderGrid must reuse the shared config/wrapper defined here rather than
inventing new prop values.

## Project context
- WanderGrid stack: React 19, TypeScript, Tailwind CSS, Vite.
- `@nkzw/liquid-glass` is a plain React component (not React-Native) —
  fully compatible with this stack, no native/Expo tooling required.
- Known limitation from the upstream library: Safari and Firefox only
  partially support the effect (the backdrop *displacement/refraction*
  will not render — blur/saturation/tint still work). Do not "fix" this;
  it's an upstream engine limitation, not a bug in this implementation.

## 1. Dependency
```bash
npm install @nkzw/liquid-glass
```

## 2. Standard WanderGrid Liquid Glass configuration
This is the locked-in visual spec for WanderGrid. Do not deviate from these
values unless explicitly told to.

| Setting               | Prop                  | Value  |
| ---------------------- | --------------------- | ------ |
| Displacement Scale      | `displacementScale`   | `200`  |
| Blur Amount             | `blurAmount`          | `0.3`  |
| Saturation               | `saturation`          | `200`  |
| Chromatic Aberration     | `aberrationIntensity` | `10`   |
| Elasticity                | `elasticity`          | `0.00` |
| Corner Radius             | `borderRadius`        | `32`   |

Notes on this config:
- `elasticity: 0.00` means the glass will **not** wobble/stretch toward the
  cursor — it behaves as a rigid pane. This is intentional; do not add
  elasticity unless asked.
- `displacementScale: 200` and `aberrationIntensity: 10` are both fairly
  strong — the effect will look pronounced (heavy refraction + visible
  color fringing at edges). It reads best over busy/colorful backgrounds
  (WanderGrid's globe view, gradient hero sections, map backgrounds) and
  can look noisy over flat single-color backgrounds. Keep this in mind
  when deciding which components to wrap.
- `saturation: 200` boosts the color intensity of whatever is behind the
  glass — pairs well with the globe/map visuals but can oversaturate a
  plain white/gray dashboard background. Test on both light and dark
  surfaces in WanderGrid's theme.

## 3. Shared wrapper component
Do not call `<LiquidGlass>` directly with inline props all over the app.
Create one shared wrapper so the config lives in exactly one place.

Component located at `components/glass/GlassPanel.tsx`:

```tsx
import LiquidGlass from '@nkzw/liquid-glass';
import type { ReactNode, CSSProperties, RefObject } from 'react';

// Locked WanderGrid Liquid Glass spec — see liquid-glass-wandergrid-SKILL.md
export const WANDERGRID_GLASS_CONFIG = {
  displacementScale: 200,
  blurAmount: 0.3,
  saturation: 200,
  aberrationIntensity: 10,
  elasticity: 0.0,
  borderRadius: 32,
} as const;

type GlassPanelProps = {
  children: ReactNode;
  className?: string;
  style?: CSSProperties;
  padding?: string;
  overLight?: boolean;
  onClick?: () => void;
  mouseContainer?: RefObject<HTMLElement | null> | null;
  /** Escape hatch for one-off overrides. Prefer not to use this. */
  overrides?: Partial<typeof WANDERGRID_GLASS_CONFIG>;
};

export default function GlassPanel({
  children,
  className,
  style,
  padding,
  overLight = false,
  onClick,
  mouseContainer,
  overrides,
}: GlassPanelProps) {
  const config = { ...WANDERGRID_GLASS_CONFIG, ...overrides };

  return (
    <LiquidGlass
      displacementScale={config.displacementScale}
      blurAmount={config.blurAmount}
      saturation={config.saturation}
      aberrationIntensity={config.aberrationIntensity}
      elasticity={config.elasticity}
      borderRadius={config.borderRadius}
      className={className}
      style={style}
      padding={padding}
      overLight={overLight}
      onClick={onClick}
      mouseContainer={mouseContainer}
    >
      {children}
    </LiquidGlass>
  );
}
```

## 4. Usage pattern
Replace/wrap existing card, modal, and nav surfaces with `GlassPanel`
instead of using `LiquidGlass` directly:

```tsx
import GlassPanel from '@/components/glass/GlassPanel';

<GlassPanel className="p-6" padding="24px">
  <h2 className="text-lg font-semibold">Upcoming Trip</h2>
  <p>Tokyo, Japan — 12 days</p>
</GlassPanel>
```

For surfaces that need to react to mouse movement over a larger container
(e.g. a glass nav bar that reacts to cursor position anywhere on the page),
pass `mouseContainer`:

```tsx
const containerRef = useRef<HTMLDivElement>(null);

<div ref={containerRef} className="relative min-h-screen">
  <GlassPanel
    mouseContainer={containerRef}
    style={{ position: 'fixed', top: 16, left: '50%', transform: 'translateX(-50%)' }}
  >
    <NavContent />
  </GlassPanel>
</div>
```

### Where to apply it in WanderGrid
Recommended first targets:
- Trip/flight cards on the dashboard and itinerary views
- The top navigation bar / app header
- Modal dialogs (flight entry, accommodation entry, settings)
- The passport stamps / gamification panel
- Floating controls over the 3D globe view (globe mode toggle, filters)

Avoid applying it to:
- Large full-page backgrounds (too expensive to render at scale)
- Dense data tables (blur reduces legibility of small text)

## 5. If a future change to the spec is requested
Update **only** `WANDERGRID_GLASS_CONFIG` in `GlassPanel.tsx` (and mirror
the change in Section 2 of this file) — never hardcode a different value
in an individual component.
