import React, { useState, useEffect, ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { INPUT_BASE_STYLE, BTN_PRIMARY_STYLE, BTN_SECONDARY_STYLE } from '../constants';
import Icon from './ui/Icon';

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

  useEffect(() => {
    if (isOpen) {
      const timer = setTimeout(() => setIsVisible(true), 20);
      return () => clearTimeout(timer);
    } else {
      setIsVisible(false);
    }
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
    <div className="fixed inset-0 z-50 overflow-hidden font-sans">
      {/* 1. Frosted Backdrop */}
      <div 
        className={`fixed inset-0 bg-black/60 backdrop-blur-sm transition-opacity duration-300 ${
          isVisible ? 'opacity-100' : 'opacity-0'
        }`}
        onClick={handleClose}
      />

      {/* 2. Slide-out Shell */}
      <div className="fixed inset-y-0 right-0 max-w-full flex pl-10">
        <div 
          className={`w-screen max-w-lg bg-light-card dark:bg-dark-card shadow-2xl border-l border-black/10 dark:border-white/10 flex flex-col transform transition-transform duration-300 ease-out ${
            isVisible ? 'translate-x-0' : 'translate-x-full'
          }`}
        >
          {/* Header */}
          <div className="p-6 border-b border-black/5 dark:border-white/5 flex items-center justify-between bg-gradient-to-r from-primary-500/5 to-transparent shrink-0">
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
              className="w-9 h-9 rounded-xl flex items-center justify-center text-light-text-secondary dark:text-dark-text-secondary hover:bg-black/5 dark:hover:bg-white/5 transition-colors shrink-0"
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
            <div className="flex-1 overflow-y-auto p-6 space-y-6 custom-scrollbar">
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
                  <div className="p-5 rounded-3xl bg-light-fill dark:bg-dark-fill/50 border border-black/5 dark:border-white/5 space-y-4">
                    <span className="text-xs font-bold uppercase tracking-wider text-light-text-secondary dark:text-dark-text-secondary block">
                      Configuration Group
                    </span>
                    {/* Secondary form elements go here */}
                  </div>
                </>
              )}
            </div>

            {/* Sticky Frosted Footer */}
            <div className="p-6 border-t border-black/5 dark:border-white/5 bg-light-card/80 dark:bg-dark-card/80 backdrop-blur-md flex items-center justify-between gap-3 shrink-0">
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
      </div>
    </div>,
    document.body
  );
};

export default StandardDrawer;
