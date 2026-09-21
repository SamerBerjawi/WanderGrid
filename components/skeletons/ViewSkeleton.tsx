import React from 'react';
import GlassPanel from '../glass/GlassPanel';
import { ViewState } from '../../types';

interface ViewSkeletonProps {
  view?: ViewState | string;
}

export const ViewSkeleton: React.FC<ViewSkeletonProps> = ({ view = 'dashboard' }) => {
  const isDashboard = view === 'dashboard';
  const isMap = view === 'map' || view === 'atlas';

  if (isMap) {
    return (
      <div className="w-full max-w-[1680px] mx-auto pt-2 sm:pt-4 px-1 sm:px-4 md:px-6 lg:px-8 flex flex-col gap-5 sm:gap-6 animate-fadeIn pb-16">
        {/* Header Skeleton */}
        <div className="w-full flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 sm:w-12 sm:h-12 rounded-2xl bg-black/10 dark:bg-white/10 animate-pulse" />
            <div className="h-8 sm:h-12 w-48 sm:w-64 rounded-2xl bg-black/10 dark:bg-white/10 animate-pulse" />
          </div>
          <div className="h-10 w-28 rounded-2xl bg-black/10 dark:bg-white/10 animate-pulse" />
        </div>
        {/* Fullscreen Map Canvas Skeleton */}
        <GlassPanel
          className="wg-glass-card w-full h-[70vh] rounded-[28px] overflow-hidden bg-white/40 dark:bg-dark-card/40 flex items-center justify-center relative"
          padding="24px"
          overrides={{ borderRadius: 28 }}
        >
          <div className="flex flex-col items-center gap-3 text-light-text-secondary dark:text-dark-text-secondary animate-pulse">
            <div className="w-12 h-12 rounded-2xl border-2 border-primary-500/30 border-t-primary-500 rounded-full animate-spin" />
            <p className="text-xs font-bold uppercase tracking-wider">Rendering Cartographic Projection...</p>
          </div>
          <div className="absolute top-6 left-6 h-10 w-44 rounded-2xl bg-black/10 dark:bg-white/10 animate-pulse" />
          <div className="absolute top-6 right-6 h-10 w-32 rounded-2xl bg-black/10 dark:bg-white/10 animate-pulse" />
        </GlassPanel>
      </div>
    );
  }

  if (isDashboard) {
    return (
      <div className="w-full max-w-[1680px] mx-auto pt-2 sm:pt-4 px-1 sm:px-4 md:px-6 lg:px-8 flex flex-col gap-5 sm:gap-6 animate-fadeIn pb-16">
        {/* Header Skeleton */}
        <div className="w-full flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 sm:w-12 sm:h-12 rounded-2xl bg-black/10 dark:bg-white/10 animate-pulse" />
            <div className="h-8 sm:h-12 w-48 sm:w-72 rounded-2xl bg-black/10 dark:bg-white/10 animate-pulse" />
          </div>
          <div className="h-11 w-32 rounded-full bg-black/10 dark:bg-white/10 animate-pulse" />
        </div>

        {/* 3 Metric Glass Tiles */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {[1, 2, 3].map((i) => (
            <GlassPanel
              key={i}
              className="wg-glass-card bg-white/50 dark:bg-dark-card/50"
              padding="20px"
              overrides={{ borderRadius: 24 }}
            >
              <div className="flex items-center justify-between mb-3">
                <div className="h-4 w-24 rounded-lg bg-black/10 dark:bg-white/10 animate-pulse" />
                <div className="w-8 h-8 rounded-xl bg-black/10 dark:bg-white/10 animate-pulse" />
              </div>
              <div className="h-8 w-32 rounded-xl bg-black/10 dark:bg-white/10 animate-pulse mb-2" />
              <div className="h-3 w-40 rounded-lg bg-black/10 dark:bg-white/10 animate-pulse" />
            </GlassPanel>
          ))}
        </div>

        {/* Bento Grid Skeleton */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
          <div className="lg:col-span-8 flex flex-col gap-6">
            <GlassPanel
              className="wg-glass-card h-80 bg-white/50 dark:bg-dark-card/50"
              padding="24px"
              overrides={{ borderRadius: 28 }}
            >
              <div className="h-6 w-48 rounded-xl bg-black/10 dark:bg-white/10 animate-pulse mb-4" />
              <div className="w-full h-56 rounded-2xl bg-black/5 dark:bg-white/5 animate-pulse" />
            </GlassPanel>
          </div>
          <div className="lg:col-span-4 flex flex-col gap-6">
            <GlassPanel
              className="wg-glass-card h-80 bg-white/50 dark:bg-dark-card/50"
              padding="24px"
              overrides={{ borderRadius: 28 }}
            >
              <div className="h-6 w-36 rounded-xl bg-black/10 dark:bg-white/10 animate-pulse mb-4" />
              <div className="space-y-3">
                {[1, 2, 3].map((j) => (
                  <div key={j} className="h-14 w-full rounded-2xl bg-black/5 dark:bg-white/5 animate-pulse" />
                ))}
              </div>
            </GlassPanel>
          </div>
        </div>
      </div>
    );
  }

  // Default: List / Feed View Skeleton (Flights, Planner, Trips, Settings)
  return (
    <div className="w-full max-w-[1680px] mx-auto pt-2 sm:pt-4 px-1 sm:px-4 md:px-6 lg:px-8 flex flex-col gap-5 sm:gap-6 animate-fadeIn pb-16">
      {/* Header Skeleton */}
      <div className="w-full flex items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 sm:w-12 sm:h-12 rounded-2xl bg-black/10 dark:bg-white/10 animate-pulse" />
          <div className="h-8 sm:h-12 w-48 sm:w-64 rounded-2xl bg-black/10 dark:bg-white/10 animate-pulse" />
        </div>
        <div className="h-11 w-32 rounded-full bg-black/10 dark:bg-white/10 animate-pulse" />
      </div>

      {/* Floating Center Tabs Skeleton */}
      <div className="flex justify-center w-full my-1">
        <div className="h-12 w-72 rounded-full bg-black/10 dark:bg-white/10 animate-pulse" />
      </div>

      {/* Content Cards Skeleton */}
      <div className="flex flex-col gap-4">
        {[1, 2, 3, 4].map((k) => (
          <GlassPanel
            key={k}
            className="wg-glass-card bg-white/50 dark:bg-dark-card/50"
            padding="20px"
            overrides={{ borderRadius: 24 }}
          >
            <div className="flex items-center justify-between gap-4">
              <div className="flex items-center gap-4 flex-1">
                <div className="w-12 h-12 rounded-2xl bg-black/10 dark:bg-white/10 animate-pulse shrink-0" />
                <div className="space-y-2 flex-1 max-w-md">
                  <div className="h-5 w-48 rounded-lg bg-black/10 dark:bg-white/10 animate-pulse" />
                  <div className="h-3 w-32 rounded-lg bg-black/10 dark:bg-white/10 animate-pulse" />
                </div>
              </div>
              <div className="h-8 w-24 rounded-full bg-black/10 dark:bg-white/10 animate-pulse shrink-0" />
            </div>
          </GlassPanel>
        ))}
      </div>
    </div>
  );
};

export default ViewSkeleton;
