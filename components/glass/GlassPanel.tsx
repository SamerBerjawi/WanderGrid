import LiquidGlass from '@nkzw/liquid-glass';
import React, { forwardRef, type ReactNode, type CSSProperties, type RefObject } from 'react';

export interface WanderGridGlassConfig {
  displacementScale: number;
  blurAmount: number;
  saturation: number;
  aberrationIntensity: number;
  elasticity: number;
  borderRadius: number;
}

// Locked WanderGrid Liquid Glass spec — see liquid-glass-wandergrid-SKILL.md
export const WANDERGRID_GLASS_CONFIG: WanderGridGlassConfig = {
  displacementScale: 200,
  blurAmount: 0.3,
  saturation: 200,
  aberrationIntensity: 10,
  elasticity: 0.0,
  borderRadius: 32,
};

export type GlassPanelProps = {
  children: ReactNode;
  className?: string;
  id?: string;
  style?: CSSProperties;
  padding?: string;
  overLight?: boolean;
  onClick?: (e?: React.MouseEvent<HTMLDivElement>) => void;
  mouseContainer?: RefObject<HTMLElement | null> | null;
  /** Escape hatch for one-off overrides. Prefer not to use this. */
  overrides?: Partial<WanderGridGlassConfig>;
};

export const GlassPanel = forwardRef<HTMLDivElement, GlassPanelProps>(({
  children,
  className = '',
  id,
  style,
  padding,
  overLight = false,
  onClick,
  mouseContainer,
  overrides,
}, ref) => {
  const config = { ...WANDERGRID_GLASS_CONFIG, ...overrides };

  const isCard = className.includes('wg-glass-card');
  const isPill = className.includes('wg-glass-pill');
  const variantClass = isCard ? 'wg-glass-card' : (isPill ? 'wg-glass-pill' : '');

  // Master defaults per WanderGrid design spec:
  // - Pills are capsules (radius 9999) with compact 4px 6px padding
  // - Cards are rounded-28 with 0px default padding so inner content controls layout
  const resolvedBorderRadius = overrides?.borderRadius ?? (isPill ? 9999 : (isCard ? 28 : config.borderRadius));
  const resolvedPadding = padding ?? (isPill ? '4px 6px' : '0px');

  // Token classification:
  // 1. Container visual decorations (borders, shadows, backgrounds, rounded) are stripped to prevent double-container shells.
  // 2. Inner layout/padding tokens (p-*, flex, gap-*, space-*) are passed to the inner content container.
  // 3. Outer flow/positioning tokens (w-*, h-*, relative, shrink-0, etc.) are passed to the outer wrapper.
  const rawTokens = className.split(/\s+/).filter(Boolean);
  const outerTokens: string[] = [];
  const innerTokens: string[] = [];

  for (const token of rawTokens) {
    if (token === 'wg-glass-card' || token === 'wg-glass-pill') {
      continue;
    }
    if (token.startsWith('wg-glass-pill-')) {
      outerTokens.push(token);
      continue;
    }
    // Eliminate rectangular background/rounded/generic border utilities that cause double shells
    if (/^(?:[\w-]+:)*(?:border$|border-[0-9]|border-black|border-white|rounded|bg-|backdrop-blur)[^\s]*/.test(token)) {
      continue;
    }
    // Inner layout & padding tokens
    if (
      /^(?:[\w-]+:)*(?:p-|px-|py-|pt-|pb-|pl-|pr-|space-y-|space-x-|gap-|items-|justify-|content-|text-|leading-|tracking-)[^\s]*/.test(token) ||
      token === 'flex' || token === 'inline-flex' || token === 'flex-col' || token === 'flex-row' || token === 'flex-wrap'
    ) {
      innerTokens.push(token);
      continue;
    }
    // Outer positioning, sizing, and flow tokens
    outerTokens.push(token);
  }

  const outerClassName = outerTokens.join(' ');
  const innerClassName = innerTokens.join(' ');
  const hasExplicitHeight = /(?:^|\s)(?:h-\[|h-\d+|min-h-\[|min-h-\d+|h-screen)/.test(className) || /(?:^|\s)(?:h-\[|h-\d+|min-h-\[|min-h-\d+|h-screen)/.test(outerClassName);
  const isFullHeight = className.includes('h-full') || outerClassName.includes('h-full') || hasExplicitHeight;
  const isFullWidth = isCard || className.includes('w-full') || outerClassName.includes('w-full');

  return (
    <div
      ref={ref}
      id={id}
      className={`wg-glass-wrapper ${variantClass} ${outerClassName}`.trim()}
      style={{
        borderRadius: resolvedBorderRadius,
        ...style,
      }}
      onClick={onClick}
    >
      <LiquidGlass
        displacementScale={overrides?.displacementScale ?? (isPill ? 80 : config.displacementScale)}
        blurAmount={config.blurAmount}
        saturation={config.saturation}
        aberrationIntensity={overrides?.aberrationIntensity ?? (isPill ? 2 : config.aberrationIntensity)}
        elasticity={config.elasticity}
        borderRadius={resolvedBorderRadius}
        className={`wg-glass-panel ${variantClass} ${isFullHeight ? 'h-full' : ''} ${isFullWidth ? 'w-full' : ''}`.trim()}
        padding={resolvedPadding}
        overLight={overLight}
        mouseContainer={mouseContainer}
      >
        {innerClassName ? (
          <div className={`w-full ${isFullHeight ? 'h-full flex-1' : ''} ${innerClassName}`.trim()}>
            {children}
          </div>
        ) : isFullHeight ? (
          <div className="w-full h-full flex-1 flex flex-col">
            {children}
          </div>
        ) : (
          children
        )}
      </LiquidGlass>
    </div>
  );
});

GlassPanel.displayName = 'GlassPanel';
export default GlassPanel;
