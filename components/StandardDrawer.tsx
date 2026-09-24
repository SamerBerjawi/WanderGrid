import React, { useState, useEffect, useRef, ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { INPUT_BASE_STYLE, BTN_PRIMARY_STYLE, BTN_SECONDARY_STYLE, CLOSE_BTN_STYLE } from '../constants';
import Icon from './ui/Icon';
import GlassPanel from './glass/GlassPanel';

export interface DrawerProps {
  isOpen: boolean;
  onClose: () => void;
  onSave?: (data: any) => void;
  title: string;
  subtitle?: string;
  tag?: string;
  icon?: string;
  children?: ReactNode;
  footerActions?: ReactNode;
  saveLabel?: string;
}

export const StandardDrawer: React.FC<DrawerProps> = ({
  isOpen,
  onClose,
  onSave,
  title,
  subtitle,
  tag,
  icon = 'category',
  children,
  footerActions,
  saveLabel = 'Save Changes',
}) => {
  const [isVisible, setIsVisible] = useState(false);
  const modalRef = useRef<HTMLDivElement>(null);
  const previouslyFocused = useRef<HTMLElement | null>(null);

  useEffect(() => {
    if (isOpen) {
      const timer = setTimeout(() => setIsVisible(true), 20);
      return () => clearTimeout(timer);
    } else {
      setIsVisible(false);
    }
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen) return;

    // Remember what had focus so we can restore it on close
    previouslyFocused.current = document.activeElement as HTMLElement;

    const container = modalRef.current;
    if (!container) return;

    const getFocusable = () =>
      Array.from(
        container.querySelectorAll<HTMLElement>(
          'a[href], button:not([disabled]), textarea, input, select, [tabindex]:not([tabindex="-1"])'
        )
      ).filter(el => el.offsetParent !== null); // exclude hidden elements

    // Move initial focus into the drawer if nothing inside already has it
    const focusables = getFocusable();
    if (focusables.length && !container.contains(document.activeElement)) {
      focusables[0].focus();
    }

    const handleTab = (e: KeyboardEvent) => {
      if (e.key !== 'Tab') return;
      const els = getFocusable();
      if (!els.length) return;
      const first = els[0];
      const last = els[els.length - 1];

      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    };

    window.addEventListener('keydown', handleTab);
    return () => {
      window.removeEventListener('keydown', handleTab);
      // Return focus to whatever triggered the drawer
      previouslyFocused.current?.focus?.();
    };
  }, [isOpen]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isOpen) {
        handleClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen]);

  const handleClose = () => {
    setIsVisible(false);
    setTimeout(onClose, 250);
  };

  if (!isOpen && !isVisible) return null;

  return createPortal(
    <div className="fixed inset-0 z-modal overflow-hidden font-sans">
      {/* 1. Translucent Scrim Backdrop (No blur to avoid double-blurring page content) */}
      <div 
        className={`fixed inset-0 bg-black/40 dark:bg-black/60 transition-opacity duration-300 ${
          isVisible ? 'opacity-100' : 'opacity-0'
        }`}
        onClick={handleClose} 
      />

      {/* 2. Slide-out Shell with Liquid Glass (Floating 28px standard) */}
      <div className="fixed top-3 sm:top-4 right-3 sm:right-4 bottom-3 sm:bottom-4 z-modal flex max-w-full pl-0 sm:pl-10 pointer-events-none">
        <div 
          className={`w-screen max-w-lg h-full flex flex-col transform transition-transform duration-300 ease-out pointer-events-auto ${
            isVisible ? 'translate-x-0' : 'translate-x-full'
          }`}
        >
          <GlassPanel
            ref={modalRef}
            className="wg-glass-card w-full h-full flex flex-col shadow-2xl overflow-hidden"
            padding="0px"
            overrides={{ borderRadius: 28 }}
          >
            <div className="flex flex-col h-full w-full overflow-hidden rounded-[28px]">
            {/* Header */}
            <div className="p-4 sm:p-6 border-b border-black/5 dark:border-white/10 flex items-center justify-between bg-gradient-to-r from-primary-500/5 to-transparent shrink-0">
            <div className="flex items-center gap-3 min-w-0">
              <div className="w-11 h-11 rounded-2xl flex items-center justify-center text-white bg-primary-500 shrink-0 shadow-md transition-transform hover:scale-105">
                <Icon className="text-2xl" name={icon}/>
              </div>
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <h2 className="text-lg font-bold text-light-text dark:text-dark-text tracking-tight truncate">
                    {title}
                  </h2>
                  {tag && (
                    <span className="px-2 py-0.5 rounded-full text-2xs font-bold uppercase tracking-wider bg-primary-500/10 text-primary-600 dark:text-primary-400 border border-primary-500/20">
                      {tag}
                    </span>
                  )}
                </div>
                {subtitle && (
                  <p className="text-xs text-light-text-secondary dark:text-dark-text-secondary truncate mt-0.5 font-medium">
                    {subtitle}
                  </p>
                )}
              </div>
            </div>
            <button 
              type="button"
              onClick={handleClose}
              className={CLOSE_BTN_STYLE}
              aria-label="Close drawer"
            >
              <Icon className="text-lg" name="close"/>
            </button>
          </div>

          {/* Form Content */}
          <form 
            onSubmit={(e) => { 
              e.preventDefault(); 
              if (onSave) onSave({}); 
              handleClose(); 
            }} 
            className="flex-1 flex flex-col overflow-hidden"
          >
            <div className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-6 custom-scrollbar">
              {children ? children : (
                <>
                  {/* Primary Identifier / Hero Input */}
                  <div className="space-y-2">
                    <label className="block text-xs font-bold uppercase tracking-wider text-light-text-secondary dark:text-dark-text-secondary">
                      Title / Identifier <span className="text-rose-500">*</span>
                    </label>
                    <input
                      type="text"
                      className={`${INPUT_BASE_STYLE} h-14 !text-xl font-bold`}
                      placeholder="Primary Identifier"
                      required
                      autoFocus
                    />
                  </div>

                  {/* Group Section Container */}
                  <div className="p-5 rounded-2xl bg-white/50 dark:bg-white/[0.05] backdrop-blur-md border border-black/8 dark:border-white/10 space-y-4">
                    <span className="text-xs font-bold uppercase tracking-wider text-light-text-secondary dark:text-dark-text-secondary block">
                      Configuration Group
                    </span>
                    {/* Secondary form elements go here */}
                  </div>
                </>
              )}
            </div>

            {/* Sticky Frosted Footer */}
            <div className="p-4 sm:p-6 border-t border-black/5 dark:border-white/10 bg-white/30 dark:bg-white/[0.03] backdrop-blur-md flex items-center justify-between gap-3 shrink-0">
              {footerActions ? footerActions : (
                <>
                  <button 
                    type="button" 
                    onClick={handleClose} 
                    className={`${BTN_SECONDARY_STYLE} h-12 px-6 text-xs font-bold uppercase tracking-wider`}
                  >
                    Cancel
                  </button>
                  <button 
                    type="submit" 
                    className={`${BTN_PRIMARY_STYLE} h-12 px-8 text-xs font-bold uppercase tracking-wider flex items-center gap-2 shadow-lg shadow-primary-500/20 active:scale-95`}
                  >
                    <span>{saveLabel}</span>
                    <Icon className="text-base" name="check"/>
                  </button>
                </>
              )}
            </div>
          </form>
          </div>
          </GlassPanel>
        </div>
      </div>
    </div>,
    document.body
  );
};

export default StandardDrawer;
