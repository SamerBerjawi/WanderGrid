import LiquidGlass from '@nkzw/liquid-glass';
import type { ReactNode, CSSProperties, RefObject } from 'react';

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

type GlassPanelProps = {
  children: ReactNode;
  className?: string;
  style?: CSSProperties;
  padding?: string;
  overLight?: boolean;
  onClick?: () => void;
  mouseContainer?: RefObject<HTMLElement | null> | null;
  /** Escape hatch for one-off overrides. Prefer not to use this. */
  overrides?: Partial<WanderGridGlassConfig>;
};

export default function GlassPanel({
  children,
  className = '',
  style,
  padding,
  overLight = false,
  onClick,
  mouseContainer,
  overrides,
}: GlassPanelProps) {
  const config = { ...WANDERGRID_GLASS_CONFIG, ...overrides };

  const isCard = className.includes('wg-glass-card');
  const isPill = className.includes('wg-glass-pill');
  const variantClass = isCard ? 'wg-glass-card' : (isPill ? 'wg-glass-pill' : '');

  // Strip rectangular CSS border and rounded classes to ensure only the Liquid Glass specular highlight ring renders
  const cleanClassName = className
    .replace(/(?:[\w-]+:)*(?:border|rounded)[^\s]*/g, '')
    .replace(/\s+/g, ' ')
    .trim();

  const isFullWidth = cleanClassName.includes('w-full');
  const isFullHeight = cleanClassName.includes('h-full');

  return (
    <div
      className={`wg-glass-wrapper ${variantClass} ${cleanClassName}`.trim()}
      style={{
        borderRadius: config.borderRadius,
        ...style,
      }}
      onClick={onClick}
    >
      <LiquidGlass
        displacementScale={config.displacementScale}
        blurAmount={config.blurAmount}
        saturation={config.saturation}
        aberrationIntensity={config.aberrationIntensity}
        elasticity={config.elasticity}
        borderRadius={config.borderRadius}
        className={`wg-glass-panel ${variantClass} ${isFullHeight ? 'h-full' : ''} ${isFullWidth ? 'w-full' : ''}`.trim()}
        padding={padding}
        overLight={overLight}
        mouseContainer={mouseContainer}
      >
        {children}
      </LiquidGlass>
    </div>
  );
}
