# Developer and AI Coding Agent Guidelines: Optimization & Architecture

This document preserves the production-grade architectural and performance optimization rules established for WanderGrid. Any subsequent updates, refactoring, or feature development must adhere to these structural constraints and design guidelines.

---

## 1. Static Dataset Optimization (Airports & Carriers)

Direct, live network fetches to external sources (such as GitHub raw URLs) during request handling are **strictly prohibited** in production. 

- **RAM Caching Principle**: All lookups, auto-completes, and index searches for airports and carriers must be served from in-memory caches on the Node.js server (`memoryAirports` and `memoryCarriers`).
- **PostgreSQL Prepopulation**: On database initialization, tables `global_airports` and `global_carriers` are prepopulated. The server loads these records from PG into memory maps on startup to completely bypass external networks.
- **Background Synchronization Task**: A weekly background task (`setInterval` loop in `server.js`) periodically pulls the latest datasets, performs a transactional truncate-and-write to database tables, and reloads memory maps. This ensures dataset freshness without impact on container startup or client response times.
- **Lazy Network Fallback**: Direct external fetches are *only* used as a lazy recovery mechanism if database tables are empty or unreachable, and must execute strictly in the background without hanging process threads.

---

## 2. Geocoding & Location Lookups

Location coordinates and reverse-lookup requests must be safe, fast, and cached permanently.

- **PostgreSQL Persistent Cache Table**: All geocoding, autocomplete, or location inquiries must transit through the backend proxy (`/api/proxy/geocoding`). Lookups check `geocoding_cache` first and return instant caching headers (`X-Cache: HIT`).
- **Strict 3-Second Timeout Limits**: Direct API calls to external geocoding providers (e.g., OpenMeteo) must enforce a strict **3-second timeout limit** utilizing `AbortController`.
- **Graceful Fail-Safe**: On network failure or timeout, the systems must fast-fail and immediately return an empty array `[]` instead of letting an external network issue hang the client UI.

---

## 3. Asynchronous Background Tasking

Heavy backend operations (e.g., generating multi-table full database backups, data compilations, sheet exports) must be offloaded from the standard synchronous business process, avoiding gateway timeouts and container blocks.

- **Immediate 202 Acknowledgment**: When a request for a heavy task is received, the backend must immediately register the job, return a lightweight token/job-status payload (`{ success: true, jobId, status: 'Processing' }`), and return HTTP 202.
- **Asynchronous Processing Block**: The job is executed in a non-blocking `Promise.resolve().then(...)` loop, maintaining progress status values directly on an active tasks mapper.
- **Status Polling Endpoints**: Provide lightweight status polling endpoints (`/api/jobs/status/:jobId`) so the client visualizes and tracks step progression without holding open HTTP threads.

---

## 4. Connection Lifecycle & Container Orchestration (Graceful Shutdown)

The database client and server must handle network resilience and container lifecycles seamlessly.

- **Database Client Pooling**: Establish limits on the connection pool (e.g., `max: 20`), idle timeout limits (`idleTimeoutMillis: 30000` to release inactive clients), and query/connection limits (`connectionTimeoutMillis: 5000` to fast-fail unreachable db hosts).
- **Graceful Process Closures**: Maintain process listeners for `SIGTERM` and `SIGINT` signals emitted by modern deployment targets (Kubernetes, AWS ECS, Google Cloud Run). Upon signal alert, the handler must immediately cease incoming connection ingress, safely process pending queue queries, and cleanly call `pool.end()` to prevent server leaks.

---

## 5. Client State Synchronization & React Optimization

Prevent stale client interfaces, duplicate network requests, or infinite rendering loops by leveraging a unified reactive cache model.

- **SWR Render Cache**: Leverage `/hooks/useWanderSync.ts` for all shared collection and data queries. It manages an in-memory cache with an automated 5-second TTL.
- **Dynamic Mutation Invalidation**: When executing database state mutations via API calls (POST, PUT, DELETE), the local/remote database proxy dispatches a standard `wandergrid_db_updated` event on the global window object. 
- **Reactive Cache Repopulation**: Active queries instantiated via the synchronization hook listen for the mutation standard, invalidate their cached states immediately, and dynamically fetch updated data payloads to synchronize the layout instantly.

---

## 6. Observability & Zero Silent Errors

Keep systems highly diagnosable and user sessions resilient.

- **Structured JSON Logger**: In production, all server logs are written using centralized JSON structures containing accurate levels, timestamps, structured details, and complete error stack traces.
- **Global Error Boundaries**: The root UI is wrapped in an interactive `/components/ErrorBoundary.tsx` module. If an unhandled client crash occurs, it traps the exception, avoids browser freezes, and renders a diagnostic recovery card allowing prompt cache resets or page reloads.

---

## 7. Application UI Design System & Modal Guidelines

All modal overlays, slide-out drawer components, form surfaces, and dialogs across the application must strictly adhere to the unified visual design language, surface hierarchy, and micro-interactions defined in this guideline.

### 7.1 Core Visual Tokens & Surfaces

* **Container Backgrounds:** Solid theme tokens `bg-light-card dark:bg-dark-card` for root drawers and dialogs. Avoid full-panel glass washes or nested high-blur backdrops on primary shells.
* **Secondary / Fill Cards:** `bg-light-fill dark:bg-dark-fill/50 border border-black/5 dark:border-white/5 rounded-3xl p-5`.
* **Elevated / Floating Cards:** `bg-white dark:bg-dark-card border border-black/5 dark:border-white/5 shadow-sm rounded-2xl`.
* **Hairline Dividers & Borders:** Ultra-low opacity borders across both themes: `border-black/5 dark:border-white/5` (inner items) and `border-black/10 dark:border-white/10` (structural shells).
* **Glassmorphic Elements:** Restrict frosted glass (`backdrop-blur`) strictly to:
  1. Backdrop overlay (`bg-black/60 backdrop-blur-sm`).
  2. Sticky bottom action footers (`bg-light-card/80 dark:bg-dark-card/80 backdrop-blur-md`).

### 7.2 Typography & Label System

* **Header Title:** `text-lg font-bold text-light-text dark:text-dark-text tracking-tight truncate`
* **Subtitles & Metadata:** `text-xs text-light-text-secondary dark:text-dark-text-secondary font-medium truncate mt-0.5`
* **Section & Form Field Labels:** `block text-xs font-bold uppercase tracking-wider text-light-text-secondary dark:text-dark-text-secondary`
* **Hero / Main Title Input:** `${INPUT_BASE_STYLE} h-14 !text-xl font-bold` for the primary resource name to anchor visual hierarchy.
* **Standard Field Inputs:** `${INPUT_BASE_STYLE} h-10 text-xs font-bold` for all secondary parameters.

### 7.3 Micro-Components & Interactive Patterns

* **Header Avatar / Icon Container:**
  `w-11 h-11 rounded-2xl flex items-center justify-center text-white shrink-0 shadow-md transition-transform hover:scale-105`
* **Hero Icon / Media Trigger:**
  `w-16 h-16 rounded-2xl flex items-center justify-center text-white shadow-lg transition-transform hover:scale-105 active:scale-95 border-2 border-white/20 shrink-0` (includes `drop-shadow-sm` on the inner icon).
* **Close Button:**
  `w-9 h-9 rounded-xl flex items-center justify-center text-light-text-secondary dark:text-dark-text-secondary hover:bg-black/5 dark:hover:bg-white/5 transition-colors shrink-0`
* **Category / Status Pills:**
  `px-2 py-0.5 rounded-full text-2xs font-bold uppercase tracking-wider bg-primary-500/10 text-primary-600 dark:text-primary-400 border border-primary-500/20`
* **Segmented Switcher / Tab Bar:**
  * Wrapper: `bg-black/5 dark:bg-white/5 p-1 rounded-2xl flex border border-black/5 dark:border-white/5`
  * Active Option: `bg-white dark:bg-dark-card text-primary-500 shadow-sm py-2.5 rounded-xl text-xs font-bold uppercase tracking-wider transition-all`
  * Inactive Option: `text-light-text-secondary dark:text-dark-text-secondary opacity-60 hover:opacity-100 py-2.5 rounded-xl text-xs font-bold uppercase tracking-wider transition-all`
* **Color Palette Swatches:**
  * Default Swatch: `w-7 h-7 rounded-full transition-all hover:scale-110 focus:outline-none`
  * Active Selection Ring: `ring-2 ring-offset-2 ring-offset-light-card dark:ring-offset-dark-card ring-primary-500 scale-110 shadow-sm`
  * Custom Color Input Trigger: `relative w-7 h-7 rounded-full overflow-hidden cursor-pointer hover:scale-110 transition-transform bg-gradient-to-br from-pink-500 via-red-500 to-yellow-500 flex items-center justify-center` with an embedded invisible native color input (`absolute inset-0 opacity-0 cursor-pointer`).
* **Live Preview / Readout Strip:**
  `p-4 rounded-2xl bg-white dark:bg-dark-card border border-black/5 dark:border-white/5 shadow-sm flex items-center justify-between` featuring a monospace metric pill: `px-2.5 py-1 rounded-full bg-black/5 dark:bg-white/5 text-xs font-mono font-bold text-light-text dark:text-dark-text`.

### 7.4 Standard Slide-Out Drawer Template

Use `/components/StandardDrawer.tsx` (or the canonical pattern below) as the structural baseline for every modal and drawer in the application:

```tsx
import React, { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { INPUT_BASE_STYLE, BTN_PRIMARY_STYLE, BTN_SECONDARY_STYLE } from '../constants';
import Icon from './ui/Icon';

interface DrawerProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (data: any) => void;
  title: string;
  subtitle?: string;
  tag?: string;
}

export const StandardDrawer: React.FC<DrawerProps> = ({
  isOpen,
  onClose,
  onSave,
  title,
  subtitle,
  tag,
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
                <Icon className="text-2xl" name="category"/>
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
          <form onSubmit={(e) => { e.preventDefault(); onSave({}); handleClose(); }} className="flex-1 flex flex-col overflow-hidden">
            <div className="flex-1 overflow-y-auto p-6 space-y-6 custom-scrollbar">
              
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

            </div>

            {/* Sticky Frosted Footer */}
            <div className="p-6 border-t border-black/5 dark:border-white/5 bg-light-card/80 dark:bg-dark-card/80 backdrop-blur-md flex items-center justify-between gap-3 shrink-0">
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
                <span>Save Changes</span>
                <Icon className="text-base" name="check"/>
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>,
    document.body
  );
};
```

