import React from 'react';
import type { User } from '../../../types';
import { cn } from '../../../utils/cn';
import { initials } from '../trips/TripDetailsModal';

/** A member's photo, or their initials on an ink disc when there is none. */
export const Avatar: React.FC<{ user: Pick<User, 'name' | 'profilePicture'>; size?: number; className?: string }> = ({ user, size = 40, className }) => (
    <span
        className={cn('flex shrink-0 items-center justify-center overflow-hidden rounded-full bg-rp-ink font-medium text-rp-on-ink', className)}
        style={{ width: size, height: size, fontSize: Math.max(11, Math.round(size * 0.36)) }}
    >
        {user.profilePicture ? (
            <img src={user.profilePicture} alt="" className="size-full object-cover" referrerPolicy="no-referrer" />
        ) : (
            <span aria-hidden>{initials(user.name)}</span>
        )}
    </span>
);
