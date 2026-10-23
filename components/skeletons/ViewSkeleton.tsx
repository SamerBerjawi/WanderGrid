import React from 'react';
import { cn } from '../../utils/cn';
import '../new/new.css';

interface ViewSkeletonProps {
  view?: string;
  /** Fill the screen on the New canvas (the shell itself is still loading). */
  fullScreen?: boolean;
}

/** A placeholder block: a soft pulse in `rp-line` (still under reduced motion). */
const Bone: React.FC<{ className?: string }> = ({ className }) => (
  <div className={cn('animate-pulse rounded-full bg-rp-line/70 motion-reduce:animate-none', className)} />
);

const Card: React.FC<{ className?: string; children?: React.ReactNode }> = ({ className, children }) => (
  <div className={cn('rounded-rp-card bg-rp-surface p-5 rp-shadow-rest sm:p-6', className)}>{children}</div>
);

/** Two-line page title and a primary action, as the New pages open (§1.2). */
const Header: React.FC = () => (
  <div className="flex items-end justify-between gap-4">
    <div className="flex flex-col gap-2.5">
      <Bone className="h-8 w-28 sm:h-9 sm:w-36" />
      <Bone className="h-8 w-44 sm:h-9 sm:w-56" />
    </div>
    <Bone className="h-11 w-28 shrink-0" />
  </div>
);

/**
 * The Suspense fallback for lazy views, in the New language (decision 178): rp-surface cards on the
 * canvas with pulsing bones in the shape of the page that is loading. It carries its own `rp-root`, so
 * it also shows inside the old shell while an old page loads.
 */
export const ViewSkeleton: React.FC<ViewSkeletonProps> = ({ view = 'dashboard', fullScreen }) => {
  const isDashboard = view === 'dashboard';
  const isMap = view === 'map' || view === 'atlas';

  return (
    <div
      role="status"
      aria-busy="true"
      aria-label="Loading"
      className={cn('rp-root mx-auto flex w-full max-w-[1680px] flex-col gap-5 px-1 pt-2 pb-16 sm:gap-6 sm:px-4 sm:pt-4 md:px-6 lg:px-8', fullScreen && 'min-h-screen max-w-none bg-rp-canvas')}
    >
      {fullScreen ? (
        <div className="flex items-center justify-between gap-3 pt-2">
          <Bone className="h-11 w-11 sm:w-40" />
          <Bone className="hidden h-11 w-80 md:block" />
          <Bone className="h-11 w-24" />
        </div>
      ) : null}
      <Header />

      {isMap ? (
        <Card className="relative h-[60vh] overflow-hidden p-0 sm:p-0">
          <Bone className="absolute top-5 left-5 h-11 w-44 rounded-full" />
          <Bone className="absolute top-5 right-5 h-11 w-28" />
          <div className="flex h-full items-center justify-center"><Bone className="size-24 opacity-60" /></div>
        </Card>
      ) : isDashboard ? (
        <>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3 sm:gap-4">
            {[0, 1, 2].map((i) => (
              <Card key={i} className="flex items-center gap-4 p-4 sm:p-5">
                <Bone className="size-11 shrink-0" />
                <div className="flex flex-1 flex-col gap-2.5">
                  <Bone className="h-6 w-24" />
                  <Bone className="h-3.5 w-36" />
                </div>
              </Card>
            ))}
          </div>
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-12">
            <Card className="h-72 lg:col-span-8"><Bone className="h-5 w-40" /><Bone className="mt-5 h-44 w-full rounded-rp-inset" /></Card>
            <Card className="h-72 lg:col-span-4"><Bone className="h-5 w-32" /><div className="mt-5 flex flex-col gap-3">{[0, 1, 2].map((j) => <Bone key={j} className="h-12 w-full rounded-rp-inset" />)}</div></Card>
          </div>
        </>
      ) : (
        <>
          <Bone className="h-11 w-full max-w-sm self-start" />
          <div className="flex flex-col gap-3">
            {[0, 1, 2, 3].map((k) => (
              <Card key={k} className="flex items-center gap-4 p-4 sm:p-5">
                <Bone className="size-12 shrink-0 rounded-rp-inset" />
                <div className="flex flex-1 flex-col gap-2.5">
                  <Bone className="h-4 w-48 max-w-full" />
                  <Bone className="h-3.5 w-32" />
                </div>
                <Bone className="hidden h-8 w-24 sm:block" />
              </Card>
            ))}
          </div>
        </>
      )}
    </div>
  );
};

export default ViewSkeleton;
