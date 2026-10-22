import type { BackupSelectionOptions } from '../types';
import { isTripAir, isTripRoad } from '../services/mockDb';

/** What a backup holds, in the groups the Settings page lets you pick. Pure helpers, shared by backup and restore. */

export type BackupCategory = keyof Required<BackupSelectionOptions>;

export const BACKUP_CATEGORIES: Array<{ key: BackupCategory; label: string; hint: string }> = [
    { key: 'flights', label: 'Flights', hint: 'Trips with flights, and flights on their own' },
    { key: 'roadTrips', label: 'Road trips', hint: 'Trains, buses, cars, cruises and ferries' },
    { key: 'visited', label: 'Atlas', hint: 'Visited countries and cities' },
    { key: 'users', label: 'Members', hint: 'Profiles and leave balances' },
    { key: 'calendar', label: 'Calendar', hint: 'Events, leave types and holiday calendars' },
    { key: 'settings', label: 'Settings', hint: 'Preferences, carriers and gear' },
];

export const ALL_ON: Required<BackupSelectionOptions> = { flights: true, roadTrips: true, visited: true, users: true, calendar: true, settings: true };
export const ALL_OFF: Required<BackupSelectionOptions> = { flights: false, roadTrips: false, visited: false, users: false, calendar: false, settings: false };

const list = (v: unknown): any[] => (Array.isArray(v) ? v : []);

export interface BackupCounts extends Record<BackupCategory, number> {
    version: string | null;
    timestamp: string | null;
}

/** How many records of each group a backup (a file, or the current database in the same shape) holds. */
export const countBackup = (state: any): BackupCounts => {
    const trips = list(state?.trips);
    const flights = list(state?.flights);
    const settings = state?.workspaceSettings;
    return {
        flights: trips.filter(isTripAir).length + flights.filter((f: any) => !f.mode || f.mode === 'Flight').length,
        roadTrips: trips.filter(isTripRoad).length + flights.filter((f: any) => f.mode && f.mode !== 'Flight').length,
        visited: list(state?.visited).length,
        users: list(state?.users).length,
        calendar: list(state?.events).length + list(state?.entitlements).length + list(state?.configs).length,
        settings: settings && typeof settings === 'object' && Object.keys(settings).length > 0 ? 1 : 0,
        version: state?.version ? String(state.version) : null,
        timestamp: state?.timestamp ? String(state.timestamp) : null,
    };
};

/** The groups a file actually has something for: the ones a restore starts with ticked. */
export const availableCategories = (counts: BackupCounts): Required<BackupSelectionOptions> => ({
    flights: counts.flights > 0,
    roadTrips: counts.roadTrips > 0,
    visited: counts.visited > 0,
    users: counts.users > 0,
    calendar: counts.calendar > 0,
    settings: counts.settings > 0,
});

/** Parses a backup file's text: tolerates a byte-order mark, and says in plain words when it is not a WanderGrid backup. */
export const parseBackupText = (text: string): any => {
    if (!text || !text.trim()) throw new Error('That file is empty.');
    let parsed: any;
    try {
        parsed = JSON.parse(text.trim().replace(/^﻿/, ''));
    } catch {
        throw new Error("That isn't a backup file. Choose a .json file exported from WanderGrid.");
    }
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) throw new Error("That isn't a WanderGrid backup.");
    const counts = countBackup(parsed);
    const any = BACKUP_CATEGORIES.some(c => counts[c.key] > 0);
    if (!any) throw new Error('That backup has nothing to restore.');
    return parsed;
};
