import React from 'react';
import { getUiTheme, setUiTheme, UiTheme } from '../config/uiTheme';

const OPTIONS: { id: UiTheme; name: string; hint: string; swatches: string[]; canvas: string }[] = [
  { id: 'classic', name: 'Classic', hint: 'Frosted glass', swatches: ['#FA9A1D', '#3B82F6', '#10B981'], canvas: '#FAFAFA' },
  { id: 'golden', name: 'Golden Hour', hint: 'Sunset and playful', swatches: ['#FF6B4A', '#FFC857', '#2EC4B6'], canvas: '#FFF4E6' },
  { id: 'board', name: 'Departure Board', hint: 'Airport board', swatches: ['#F5C518', '#4ADE80', '#D9480F'], canvas: '#14161A' },
];

/** Interface theme switcher. Works in every theme, so keep its styling theme-neutral. Applies by reloading the page. */
export const ThemePicker: React.FC = () => {
  const current = getUiTheme();
  return (
    <div role="radiogroup" aria-label="Interface style" className="grid grid-cols-1 sm:grid-cols-3 gap-3">
      {OPTIONS.map(o => {
        const active = o.id === current;
        return (
          <button
            key={o.id}
            type="button"
            role="radio"
            aria-checked={active}
            onClick={() => !active && setUiTheme(o.id)}
            className={`min-h-[44px] rounded-2xl p-3 text-left cursor-pointer transition-all border-2 ${active ? 'border-primary-500' : 'border-black/10 dark:border-white/15 hover:border-primary-500/50'}`}
          >
            <div className="h-14 rounded-xl flex items-end gap-1.5 p-2" style={{ background: o.canvas }}>
              {o.swatches.map(c => <span key={c} className="w-6 h-6 rounded-md" style={{ background: c }} />)}
            </div>
            <div className="mt-2 text-sm font-bold text-light-text dark:text-dark-text">{o.name}</div>
            <div className="text-xs text-light-text-secondary dark:text-dark-text-secondary">{active ? 'In use' : o.hint}</div>
          </button>
        );
      })}
    </div>
  );
};

export default ThemePicker;
