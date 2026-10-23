export interface FeedOptions {
    trips: boolean;
    flights: boolean;
    transport: boolean;
    stays: boolean;
    activities: boolean;
    leave: boolean;
    holidays: boolean;
    planning: boolean;
    stay: 'split' | 'span';
    cost: boolean;
    reminders: boolean;
    private: 'full' | 'busy' | 'hide';
    remindFlight: number;
    remindStay: number;
    remindActivity: number;
}

export interface FeedContext {
    now?: number;
    baseUrl?: string;
    name?: string;
    currency?: string;
    viewer?: 'owner';
    airportTz?: (iata: string) => string | undefined;
    airportName?: (iata: string) => string;
    entitlementName?: (id?: string) => string | undefined;
    holidayCalendars?: Array<{ id: string; countryName?: string; year?: number; holidays?: Array<{ id?: string; name: string; date: string }> }>;
}

type AnyRecord = Record<string, any>;

export const DEFAULT_FEED_OPTIONS: Readonly<FeedOptions>;
export const TRIP_FILE_OPTIONS: Readonly<FeedOptions>;
export const FEED_REFRESH: string;
export function parseFeedOptions(query: string | URLSearchParams | AnyRecord | undefined | null): FeedOptions;
export function feedOptionsToQuery(options: Partial<FeedOptions>): string;
export function icsEscape(value: unknown): string;
export function icsFold(line: string): string;
export function validDay(iso: unknown): iso is string;
export function zonedToUtcMs(dateIso: string, time: string, tz?: string): number | null;
export function transportEvent(t: AnyRecord, trip: AnyRecord | null | undefined, options: FeedOptions, ctx: FeedContext): string | null;
export function tripEvents(trip: AnyRecord, options: Partial<FeedOptions>, ctx: FeedContext): string[];
export function wrapCalendar(events: string[], name?: string, opts?: { refresh?: boolean }): string;
export function buildFeed(trips: AnyRecord[], options?: Partial<FeedOptions>, ctx?: FeedContext): string;
