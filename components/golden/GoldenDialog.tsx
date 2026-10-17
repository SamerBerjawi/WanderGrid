import React, { forwardRef, ReactNode } from 'react';
import { clsx } from 'clsx';
import GlassPanel, { GlassPanelProps } from '../glass/GlassPanel';
import { isFeatureEnabled } from '../../config/featureFlags';
import { GhButton } from './Gh';

/**
 * Golden Hour dialog surfaces (flag UI_GOLDEN_HOUR): solid white / plum sheets, rounded-3xl, friendly
 * headers with a coloured icon chip, pill buttons, no glass, blur or hairlines. Bottom sheet on mobile.
 * Callers keep their own focus trap / Escape handling and only swap the markup for these shells.
 */

export const isGoldenHour = () => isFeatureEnabled('UI_GOLDEN_HOUR');

export type GhChipTone = 'sun' | 'coral' | 'teal' | 'lilac';
const CHIP_TONE: Record<GhChipTone, string> = {
  sun: 'bg-sunset-sun text-sunset-ink',
  coral: 'bg-sunset-orange text-white',
  teal: 'bg-sunset-teal text-sunset-ink',
  lilac: 'bg-sunset-lilac text-sunset-ink',
};

export const GH_SHEET = 'bg-white dark:bg-sunset-plum text-sunset-ink dark:text-white shadow-card';
export const GH_BACKDROP = 'fixed inset-0 bg-sunset-ink/50 dark:bg-black/60';
export const GH_FOOTER = 'px-5 sm:px-7 py-4 sm:py-5 flex items-center justify-between gap-3 shrink-0 flex-wrap';
export const GH_BODY = 'px-5 sm:px-7 py-2 overflow-y-auto custom-scrollbar flex-1 min-h-0';
/** A soft inset block for grouped content inside a sheet. */
export const GH_FIELD_CARD = 'rounded-3xl bg-sunset-cream dark:bg-sunset-dusk';

const GH_BTN = 'min-h-[44px] px-6 rounded-full inline-flex items-center justify-center gap-2 text-sm font-semibold cursor-pointer transition-transform active:scale-95 disabled:opacity-50';
/** Class strings for raw <button>s inside golden sheets (GhButton is the component form). */
export const GH_BTN_PRIMARY = `${GH_BTN} bg-sunset-coral text-white shadow-card hover:brightness-105`;
export const GH_BTN_SOFT = `${GH_BTN} bg-sunset-sand dark:bg-sunset-dusk text-sunset-ink dark:text-white`;
export const GH_BTN_DANGER = `${GH_BTN} bg-red-600 text-white shadow-card`;

export const GhIconChip: React.FC<{ children: ReactNode; tone?: GhChipTone; className?: string }> = ({ children, tone = 'sun', className }) => (
  <div className={clsx('w-12 h-12 rounded-2xl flex items-center justify-center shrink-0', CHIP_TONE[tone], className)}>{children}</div>
);

export const GhCloseButton: React.FC<{ onClick: () => void; label: string }> = ({ onClick, label }) => (
  <button
    type="button"
    onClick={onClick}
    aria-label={label}
    className="w-11 h-11 min-w-[44px] min-h-[44px] rounded-full flex items-center justify-center shrink-0 cursor-pointer bg-sunset-sand dark:bg-sunset-dusk text-sunset-ink dark:text-white transition-transform active:scale-95"
  >
    <span aria-hidden="true" className="text-lg font-black leading-none">✕</span>
  </button>
);

export const GhSheetHeader: React.FC<{
  title: ReactNode; titleId?: string; subtitle?: string; tag?: string; icon?: ReactNode; tone?: GhChipTone; onClose: () => void; closeLabel: string;
}> = ({ title, titleId, subtitle, tag, icon, tone, onClose, closeLabel }) => (
  <div className="px-5 sm:px-7 pt-3 sm:pt-6 pb-3 flex items-center justify-between gap-3 shrink-0">
    <div className="flex items-center gap-3 min-w-0">
      {icon && <GhIconChip tone={tone}>{icon}</GhIconChip>}
      <div className="min-w-0">
        <div className="flex items-center gap-2 min-w-0">
          <h2 id={titleId} className="text-2xl sm:text-3xl font-black tracking-tight truncate">{title}</h2>
          {tag && <span className="px-3 py-1 rounded-full text-xs font-semibold bg-sunset-lilac text-sunset-ink shrink-0">{tag}</span>}
        </div>
        {subtitle && <p className="text-sm opacity-70 truncate mt-0.5">{subtitle}</p>}
      </div>
    </div>
    <GhCloseButton onClick={onClose} label={closeLabel} />
  </div>
);

const GrabHandle = () => <div className="sm:hidden mx-auto mt-3 h-1.5 w-10 rounded-full bg-sunset-sand dark:bg-sunset-dusk shrink-0" aria-hidden="true" />;

/** Centered dialog on desktop, bottom sheet on mobile. */
export const GoldenModalShell: React.FC<{
  isOpen: boolean; onClose: () => void; containerRef: React.RefObject<HTMLDivElement | null>; titleId: string;
  title: string; subtitle?: string; tag?: string; icon?: ReactNode; maxWidth: string; footerActions?: ReactNode; children: ReactNode;
}> = ({ isOpen, onClose, containerRef, titleId, title, subtitle, tag, icon, maxWidth, footerActions, children }) => (
  <div
    role="dialog"
    aria-modal="true"
    aria-labelledby={titleId}
    className={clsx('fixed inset-0 z-modal flex items-end sm:items-center justify-center sm:p-4 font-sans transition-opacity duration-200', isOpen ? 'opacity-100' : 'opacity-0 pointer-events-none')}
  >
    <div className={GH_BACKDROP} onClick={onClose} />
    <div
      ref={containerRef}
      className={clsx(
        'relative w-full flex flex-col min-h-0 overflow-hidden rounded-t-3xl sm:rounded-3xl transition-transform duration-300 ease-out pb-[env(safe-area-inset-bottom,0px)] sm:pb-0',
        'max-h-[92dvh] sm:max-h-[90dvh]', GH_SHEET, maxWidth,
        isOpen ? 'translate-y-0' : 'translate-y-full sm:translate-y-6'
      )}
    >
      <GrabHandle />
      <GhSheetHeader title={title} titleId={titleId} subtitle={subtitle} tag={tag} icon={icon} onClose={onClose} closeLabel="Close dialog" />
      <div className={GH_BODY}>{children}</div>
      {footerActions && <div className={GH_FOOTER}>{footerActions}</div>}
    </div>
  </div>
);

/** Right-hand sheet on desktop, bottom sheet on mobile. The caller supplies header + body + footer as `children`. */
export const GoldenDrawerShell: React.FC<{
  isVisible: boolean; onClose: () => void; containerRef?: React.RefObject<HTMLDivElement | null>; label?: string; children: ReactNode;
}> = ({ isVisible, onClose, containerRef, label, children }) => (
  <div className="fixed inset-0 z-modal overflow-hidden font-sans" role="dialog" aria-modal="true" aria-label={label}>
    <div className={clsx(GH_BACKDROP, 'transition-opacity duration-300', isVisible ? 'opacity-100' : 'opacity-0')} onClick={onClose} />
    <div className="fixed inset-x-0 bottom-0 top-auto sm:inset-auto sm:top-4 sm:right-4 sm:bottom-4 z-modal flex max-w-full pointer-events-none">
      <div
        ref={containerRef}
        className={clsx(
          'w-screen sm:max-w-lg h-[92dvh] sm:h-full flex flex-col overflow-hidden rounded-t-3xl sm:rounded-3xl pointer-events-auto pb-[env(safe-area-inset-bottom,0px)] sm:pb-0',
          'transform transition-transform duration-300 ease-out', GH_SHEET,
          isVisible ? 'translate-y-0 sm:translate-x-0' : 'translate-y-full sm:translate-y-0 sm:translate-x-full'
        )}
      >
        <GrabHandle />
        {children}
      </div>
    </div>
  </div>
);

/** Confirm dialog footer: soft cancel + coral (or red) confirm pills. */
export const GoldenConfirmActions: React.FC<{ cancelLabel: string; confirmLabel: string; danger?: boolean; onCancel: () => void; onConfirm: () => void }> = ({
  cancelLabel, confirmLabel, danger, onCancel, onConfirm,
}) => (
  <div className="flex gap-3 justify-end flex-wrap">
    <GhButton variant="soft" onClick={onCancel} className="!bg-sunset-sand dark:!bg-sunset-dusk !shadow-none">{cancelLabel}</GhButton>
    <button
      type="button"
      autoFocus
      onClick={onConfirm}
      className={clsx('min-h-[44px] px-6 rounded-full text-sm font-semibold cursor-pointer text-white shadow-card transition-transform active:scale-95 hover:brightness-105', danger ? 'bg-red-600' : 'bg-sunset-coral')}
    >
      {confirmLabel}
    </button>
  </div>
);

/**
 * Drop-in for GlassPanel. Flag OFF: renders the real GlassPanel untouched. Flag ON: a flat rounded-3xl card
 * (glass, blur, border, ring, gradient and glass-shadow classes are dropped from className).
 */
const GLASS_CLASS = /^(wg-glass-.*|backdrop-blur.*|border(-.*)?|ring(-.*)?|bg-gradient-.*|from-.*|via-.*|to-.*|shadow-(xs|sm|md|lg|xl|2xl)|bg-white\/.*|dark:bg-(white|dark-card).*|dark:border.*|dark:ring.*)$/;
export const AdaptivePanel = forwardRef<HTMLDivElement, GlassPanelProps>((props, ref) => {
  if (!isGoldenHour()) return <GlassPanel ref={ref} {...props} />;
  const { className = '', children, id, style, onClick } = props;
  const kept = className.split(/\s+/).filter(c => c && !GLASS_CLASS.test(c)).join(' ');
  return (
    <div ref={ref} id={id} style={style} onClick={onClick as React.MouseEventHandler<HTMLDivElement> | undefined} className={clsx(kept, className.includes('wg-glass-pill') ? 'rounded-full' : 'rounded-3xl', GH_SHEET)}>
      {children}
    </div>
  );
});
AdaptivePanel.displayName = 'AdaptivePanel';
