import React, { useState, useEffect } from 'react';
import { PageThemeConfig } from '../config/pageThemes';

interface AmbientBackgroundProps {
  theme: PageThemeConfig;
  darkMode: boolean;
}

/**
 * Builds mathematically seamless CSS radial gradient blooms.
 * Matches the exact positioning, Gaussian falloff curve, and rich vibrance
 * from had-homeassistantdashboard, eliminating rasterization tile clipping and box artifacts.
 */
function buildGradientString(theme: PageThemeConfig, darkMode: boolean): string {
  const primary = theme.glowGradients?.primary || theme.accentHex || '#0ea5e9';
  const secondary = theme.glowGradients?.secondary || '#6366f1';
  const tertiary = theme.glowGradients?.tertiary || primary;

  if (darkMode) {
    return [
      // Primary Top-Right Accent Bloom: 650px
      `radial-gradient(circle min(55vw, 650px) at 68% 10%, ${primary}48 0%, ${primary}3e 24%, ${primary}20 48%, ${primary}08 72%, transparent 100%)`,
      // Secondary Bottom-Left Accent Bloom: 550px
      `radial-gradient(circle min(48vw, 550px) at 22% 88%, ${secondary}3e 0%, ${secondary}32 24%, ${secondary}18 48%, ${secondary}06 72%, transparent 100%)`,
      // Tertiary Center Radiance: 450px
      `radial-gradient(circle min(38vw, 450px) at 40% 42%, ${tertiary}2c 0%, ${tertiary}20 24%, ${tertiary}0e 48%, ${tertiary}03 72%, transparent 100%)`
    ].join(', ');
  } else {
    return [
      // Primary Top-Right Accent Bloom: 650px
      `radial-gradient(circle min(55vw, 650px) at 68% 10%, ${primary}2a 0%, ${primary}22 24%, ${primary}12 48%, ${primary}05 72%, transparent 100%)`,
      // Secondary Bottom-Left Accent Bloom: 550px
      `radial-gradient(circle min(48vw, 550px) at 22% 88%, ${secondary}22 0%, ${secondary}1a 24%, ${secondary}0e 48%, ${secondary}03 72%, transparent 100%)`,
      // Tertiary Center Radiance: 450px
      `radial-gradient(circle min(38vw, 450px) at 40% 42%, ${tertiary}18 0%, ${tertiary}12 24%, ${tertiary}08 48%, ${tertiary}02 72%, transparent 100%)`
    ].join(', ');
  }
}

export const AmbientBackground: React.FC<AmbientBackgroundProps> = ({ theme, darkMode }) => {
  const currentGradient = buildGradientString(theme, darkMode);
  const [layers, setLayers] = useState<{ id: string; gradient: string }[]>([
    { id: `${theme.id}-${darkMode ? 'd' : 'l'}`, gradient: currentGradient }
  ]);

  useEffect(() => {
    const newId = `${theme.id}-${darkMode ? 'd' : 'l'}`;
    setLayers(prev => {
      const last = prev[prev.length - 1];
      if (last && last.id === newId) return prev;
      return [
        { ...last },
        { id: newId, gradient: currentGradient }
      ];
    });

    const timer = setTimeout(() => {
      setLayers([{ id: newId, gradient: currentGradient }]);
    }, 750);

    return () => clearTimeout(timer);
  }, [theme.id, darkMode, currentGradient]);

  return (
    <div className="fixed inset-0 pointer-events-none z-0 overflow-hidden">
      {layers.map((layer, index) => {
        const isTop = index === layers.length - 1;
        return (
          <div
            key={layer.id}
            className={`absolute inset-0 transform-gpu will-change-[opacity] transition-opacity duration-700 ease-in-out ${
              isTop ? 'opacity-100' : 'opacity-0'
            }`}
            style={{
              backgroundImage: layer.gradient,
            }}
          />
        );
      })}
    </div>
  );
};

export default AmbientBackground;
