import { describe, expect, it } from 'vitest';
import { availableCategories, countBackup, parseBackupText } from '../../utils/backupModel';

const backup = {
    version: '3.7',
    timestamp: '2026-10-01T10:00:00Z',
    users: [{ id: 'u1' }, { id: 'u2' }],
    trips: [
        { id: 't1', transports: [{ mode: 'Flight' }] },
        { id: 't2', transports: [{ mode: 'Train' }] },
    ],
    flights: [{ id: 'f1' }, { id: 'f2', mode: 'Ferry' }],
    visited: [{ id: 'v1' }],
    events: [{ id: 'e1' }],
    entitlements: [{ id: 'n1' }, { id: 'n2' }],
    configs: [],
    workspaceSettings: { orgName: 'Org' },
};

describe('countBackup', () => {
    it('counts each group, including flights and land journeys kept on their own', () => {
        const c = countBackup(backup);
        expect(c).toMatchObject({ flights: 2, roadTrips: 2, visited: 1, users: 2, calendar: 3, settings: 1, version: '3.7' });
    });
    it('handles missing parts', () => {
        expect(countBackup({})).toMatchObject({ flights: 0, roadTrips: 0, visited: 0, users: 0, calendar: 0, settings: 0, version: null });
        expect(countBackup(null).settings).toBe(0);
    });
    it('treats empty settings as none', () => {
        expect(countBackup({ workspaceSettings: {} }).settings).toBe(0);
    });
});

describe('availableCategories', () => {
    it('ticks only the groups the file has', () => {
        expect(availableCategories(countBackup({ users: [{ id: 'a' }], visited: [] }))).toEqual({ flights: false, roadTrips: false, visited: false, users: true, calendar: false, settings: false });
    });
});

describe('parseBackupText', () => {
    it('reads a backup, with or without a byte-order mark', () => {
        expect(parseBackupText(JSON.stringify(backup)).users).toHaveLength(2);
        expect(parseBackupText('﻿' + JSON.stringify(backup)).visited).toHaveLength(1);
    });
    it('explains what is wrong in plain words', () => {
        expect(() => parseBackupText('')).toThrow(/empty/);
        expect(() => parseBackupText('{nope')).toThrow(/isn't a backup/);
        expect(() => parseBackupText('[1,2]')).toThrow(/isn't a WanderGrid backup/);
        expect(() => parseBackupText('{"hello":1}')).toThrow(/nothing to restore/);
    });
});
