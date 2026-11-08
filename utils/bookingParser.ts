import type { Accommodation, Activity, Transport, TransportMode } from '../types';
import { AIRPORT_CODES } from './flightData';

/**
 * Reads booking confirmations (airline, rail, bus, ferry, car hire, hotel, restaurant and event emails)
 * and turns them into trip items. Pure and rule-based: there is no AI in WanderGrid.
 *
 * 1. A raw email (`.eml`, MIME) is unpacked to its HTML and text parts.
 * 2. Structured data comes first: most booking emails carry schema.org markup for Gmail and Apple Mail
 *    (`<script type="application/ld+json">` or microdata), which names every field exactly.
 * 3. When there is none, a careful text reading looks for flight segments (flight number, two airport
 *    codes, date and times) and a hotel stay (check-in and check-out dates).
 */

export type BookingKind = 'transport' | 'stay' | 'activity';
export type BookingSource = 'schema' | 'text';

/** A transport leg before it is given ids and a trip. */
export type ParsedTransport = Omit<Transport, 'id' | 'itineraryId' | 'type'>;
export type ParsedStay = Omit<Accommodation, 'id'>;
export type ParsedActivity = Omit<Activity, 'id'>;

export type ParsedBooking =
    | { kind: 'transport'; source: BookingSource; transport: ParsedTransport }
    | { kind: 'stay'; source: BookingSource; stay: ParsedStay }
    | { kind: 'activity'; source: BookingSource; activity: ParsedActivity };

export interface ParseResult {
    bookings: ParsedBooking[];
    subject?: string;
}

/* ------------------------------------------------------------------ email (MIME) */

export interface EmailParts {
    subject?: string;
    /** The email's Date header as yyyy-mm-dd, used to place dates written without a year. */
    sentDate?: string;
    html: string;
    text: string;
}

type Headers = Record<string, string>;

const parseHeaders = (block: string): Headers => {
    const out: Headers = {};
    // Folded header lines start with whitespace and continue the line above.
    const lines = block.replace(/\r\n/g, '\n').replace(/\n[ \t]+/g, ' ').split('\n');
    for (const line of lines) {
        const i = line.indexOf(':');
        if (i > 0) out[line.slice(0, i).trim().toLowerCase()] = line.slice(i + 1).trim();
    }
    return out;
};

const param = (header: string | undefined, name: string): string | undefined => {
    if (!header) return undefined;
    const m = header.match(new RegExp(`${name}\\s*=\\s*(?:"([^"]*)"|([^;\\s]+))`, 'i'));
    return m ? (m[1] ?? m[2]) : undefined;
};

const decodeBytes = (bytes: Uint8Array, charset = 'utf-8'): string => {
    try { return new TextDecoder(charset.toLowerCase(), { fatal: false }).decode(bytes); } catch { return new TextDecoder('utf-8').decode(bytes); }
};

const base64Bytes = (b64: string): Uint8Array => {
    const clean = b64.replace(/[^A-Za-z0-9+/=]/g, '');
    const bin = atob(clean);
    const out = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
    return out;
};

const qpBytes = (qp: string): Uint8Array => {
    const soft = qp.replace(/=\r?\n/g, '');
    const out: number[] = [];
    for (let i = 0; i < soft.length; i++) {
        const c = soft[i];
        if (c === '=' && /^[0-9A-Fa-f]{2}$/.test(soft.slice(i + 1, i + 3))) { out.push(parseInt(soft.slice(i + 1, i + 3), 16)); i += 2; }
        else {
            const code = c.charCodeAt(0);
            if (code < 128) out.push(code);
            else out.push(...new TextEncoder().encode(c));
        }
    }
    return new Uint8Array(out);
};

/** RFC 2047 encoded words in a header ("=?utf-8?B?...?=" and "=?utf-8?Q?...?="). */
export const decodeHeader = (value: string): string =>
    value.replace(/=\?([^?]+)\?([BbQq])\?([^?]*)\?=(\s+(?==\?))?/g, (_m, charset: string, enc: string, data: string) => {
        try {
            const bytes = enc.toUpperCase() === 'B' ? base64Bytes(data) : qpBytes(data.replace(/_/g, ' '));
            return decodeBytes(bytes, charset);
        } catch { return data; }
    });

const decodeBody = (body: string, headers: Headers): string => {
    const enc = (headers['content-transfer-encoding'] || '').toLowerCase();
    const charset = param(headers['content-type'], 'charset') || 'utf-8';
    try {
        if (enc === 'base64') return decodeBytes(base64Bytes(body), charset);
        if (enc === 'quoted-printable') return decodeBytes(qpBytes(body), charset);
    } catch { /* fall through to the raw text */ }
    return body;
};

const walkPart = (raw: string, out: { html: string[]; text: string[] }, depth = 0) => {
    const split = raw.search(/\r?\n\r?\n/);
    const headers = parseHeaders(split >= 0 ? raw.slice(0, split) : raw);
    const body = split >= 0 ? raw.slice(split).replace(/^\r?\n\r?\n/, '') : '';
    const type = (headers['content-type'] || 'text/plain').toLowerCase();
    if (type.startsWith('multipart/') && depth < 8) {
        const boundary = param(headers['content-type'], 'boundary');
        if (!boundary) return;
        const pieces = body.split(new RegExp(`\\r?\\n?--${boundary.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(?:--)?[ \\t]*\\r?\\n?`));
        for (const piece of pieces) if (piece.trim()) walkPart(piece, out, depth + 1);
        return;
    }
    if (/attachment/i.test(headers['content-disposition'] || '') && !type.startsWith('text/')) return;
    if (type.startsWith('text/html')) out.html.push(decodeBody(body, headers));
    else if (type.startsWith('text/plain')) out.text.push(decodeBody(body, headers));
};

/** True when the text starts with email headers (a saved `.eml` or "Show original" copy). */
export const looksLikeEmail = (raw: string): boolean => {
    const head = raw.slice(0, 4000).replace(/\r\n/g, '\n');
    const end = head.indexOf('\n\n');
    if (end < 0) return false;
    const lines = head.slice(0, end).split('\n').filter(l => !/^[ \t]/.test(l));
    const named = lines.filter(l => /^[A-Za-z][A-Za-z0-9-]*:/.test(l));
    return named.length >= 2 && named.length >= lines.length * 0.8 && /^(from|to|subject|date|content-type|mime-version|received|return-path|delivered-to|message-id)\s*:/im.test(head.slice(0, end));
};

const toIsoDay = (d: Date): string => `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-${String(d.getUTCDate()).padStart(2, '0')}`;

/** Unpacks a raw email to its subject, sent date, HTML and text. Anything else is returned as it is. */
export const readEmail = (raw: string): EmailParts => {
    if (!looksLikeEmail(raw)) {
        const isHtml = /<(html|body|div|table|p|br|span|script)\b/i.test(raw);
        return { html: isHtml ? raw : '', text: isHtml ? '' : raw };
    }
    const split = raw.search(/\r?\n\r?\n/);
    const headers = parseHeaders(raw.slice(0, split));
    const out = { html: [] as string[], text: [] as string[] };
    walkPart(raw, out);
    const sent = headers.date ? new Date(headers.date) : null;
    return {
        subject: headers.subject ? decodeHeader(headers.subject) : undefined,
        sentDate: sent && !isNaN(sent.getTime()) ? toIsoDay(sent) : undefined,
        html: out.html.join('\n'),
        text: out.text.join('\n'),
    };
};

/* ------------------------------------------------------------------ schema.org */

type Thing = Record<string, any>;

const typeOf = (t: Thing): string => {
    const raw = Array.isArray(t?.['@type']) ? t['@type'][0] : t?.['@type'];
    return String(raw || '').replace(/^https?:\/\/schema\.org\//i, '');
};

const decodeEntities = (s: string): string =>
    s.replace(/&quot;/g, '"').replace(/&#34;/g, '"').replace(/&apos;|&#39;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&');

/** Every JSON-LD object in the HTML, with arrays and `@graph` flattened. */
export const jsonLdThings = (html: string): Thing[] => {
    const out: Thing[] = [];
    const push = (v: unknown) => {
        if (Array.isArray(v)) v.forEach(push);
        else if (v && typeof v === 'object') {
            const t = v as Thing;
            if (Array.isArray(t['@graph'])) t['@graph'].forEach(push);
            if (t['@type']) out.push(t);
        }
    };
    const re = /<script[^>]*type\s*=\s*["']?application\/ld\+json["']?[^>]*>([\s\S]*?)<\/script>/gi;
    let m: RegExpExecArray | null;
    while ((m = re.exec(html))) {
        const body = m[1].trim().replace(/^<!--|-->$/g, '');
        try { push(JSON.parse(body)); } catch {
            try { push(JSON.parse(decodeEntities(body))); } catch { /* not JSON */ }
        }
    }
    return out;
};

/** Microdata (`itemscope` / `itemtype` / `itemprop`) read into the same shape as JSON-LD. Needs a DOM. */
export const microdataThings = (html: string): Thing[] => {
    if (typeof DOMParser === 'undefined' || !/itemscope/i.test(html)) return [];
    const doc = new DOMParser().parseFromString(html, 'text/html');
    const valueOf = (el: Element): unknown => {
        if (el.hasAttribute('itemscope')) return readScope(el);
        return el.getAttribute('content') ?? el.getAttribute('datetime') ?? el.getAttribute('href') ?? el.getAttribute('src') ?? (el.textContent || '').trim();
    };
    const readScope = (scope: Element): Thing => {
        const thing: Thing = { '@type': (scope.getAttribute('itemtype') || '').split('/').pop() || '' };
        const walk = (node: Element) => {
            for (const child of Array.from(node.children)) {
                const prop = child.getAttribute('itemprop');
                if (prop) for (const p of prop.split(/\s+/)) thing[p] = thing[p] === undefined ? valueOf(child) : thing[p];
                if (!child.hasAttribute('itemscope')) walk(child);
            }
        };
        walk(scope);
        return thing;
    };
    // Only the outermost scopes: nested ones are read as properties of their parent.
    return Array.from(doc.querySelectorAll('[itemscope]'))
        .filter(el => !el.hasAttribute('itemprop'))
        .map(readScope);
};

const str = (v: unknown): string => {
    if (v == null) return '';
    if (typeof v === 'string') return v.trim();
    if (typeof v === 'number') return String(v);
    if (Array.isArray(v)) return str(v[0]);
    if (typeof v === 'object') return str((v as Thing).name ?? (v as Thing)['@id'] ?? '');
    return '';
};

/** "2026-03-03T10:15:00+00:00" → date and the time as written (the local time at that place). */
export const splitIso = (v: unknown): { date: string; time: string } => {
    const s = str(v);
    const m = s.match(/^(\d{4})-(\d{2})-(\d{2})(?:[T\s](\d{2}):(\d{2}))?/);
    return m ? { date: `${m[1]}-${m[2]}-${m[3]}`, time: m[4] ? `${m[4]}:${m[5]}` : '' } : { date: '', time: '' };
};

const addressOf = (v: unknown): string => {
    if (!v) return '';
    if (typeof v === 'string') return v.trim();
    const a = v as Thing;
    if (typeof a.address === 'string' || (a.address && typeof a.address === 'object')) return addressOf(a.address);
    return [a.streetAddress, a.postalCode && a.addressLocality ? `${a.postalCode} ${a.addressLocality}` : a.addressLocality, a.addressRegion, str(a.addressCountry)]
        .map(x => str(x)).filter(Boolean).join(', ');
};

const priceOf = (r: Thing): number | undefined => {
    const raw = r.totalPrice ?? r.price ?? r.priceSpecification?.price;
    const n = typeof raw === 'number' ? raw : parseFloat(String(raw ?? '').replace(/[^\d.]/g, ''));
    return Number.isFinite(n) && n > 0 ? n : undefined;
};

export const cabinOf = (v: unknown): Transport['travelClass'] | undefined => {
    const t = str(v).toLowerCase();
    if (!t) return undefined;
    if (t.includes('first')) return 'First';
    if (t.includes('business') || t === 'j' || t === 'c') return 'Business';
    if (t.includes('premium')) return 'Premium Economy';
    if (t.includes('econ') || t.includes('standard') || t === 'y') return 'Economy';
    return undefined;
};

const seatOf = (r: Thing): string | undefined => {
    const ticket = Array.isArray(r.reservedTicket) ? r.reservedTicket[0] : r.reservedTicket;
    const seat = r.airplaneSeat ?? ticket?.ticketedSeat?.seatNumber ?? ticket?.ticketedSeat;
    const row = ticket?.ticketedSeat?.seatRow;
    const s = typeof seat === 'object' ? str(seat?.seatNumber) : str(seat);
    return (row && s && !s.startsWith(String(row)) ? `${row}${s}` : s) || undefined;
};

/** "TP 1234", or the airline code and a bare number from separate fields. */
const flightNumberOf = (flight: Thing): { code: string; number: string } => {
    const airlineCode = str(flight.airline?.iataCode ?? flight.provider?.iataCode).toUpperCase();
    const raw = str(flight.flightNumber).toUpperCase().replace(/\s+/g, '');
    const m = raw.match(/^([A-Z0-9]{2})(\d{1,4}[A-Z]?)$/);
    if (m && (!airlineCode || m[1] === airlineCode || /[A-Z]/.test(m[1]))) return { code: m[1], number: `${m[1]} ${m[2]}` };
    return { code: airlineCode, number: raw ? `${airlineCode ? `${airlineCode} ` : ''}${raw}` : '' };
};

const airportOf = (a: Thing | undefined): string => {
    const code = str(a?.iataCode).toUpperCase();
    return /^[A-Z]{3}$/.test(code) ? code : str(a?.name);
};

const legOf = (mode: TransportMode, r: Thing, f: Thing, from: string, to: string, provider: string, identifier: string): ParsedTransport | null => {
    const dep = splitIso(f.departureTime ?? r.departureTime ?? r.pickupTime);
    const arr = splitIso(f.arrivalTime ?? r.arrivalTime ?? r.dropoffTime);
    if (!from || !to || !dep.date) return null;
    return {
        mode, provider, identifier,
        confirmationCode: str(r.reservationNumber ?? r.confirmationNumber).toUpperCase(),
        origin: from, destination: to,
        departureDate: dep.date, departureTime: dep.time,
        arrivalDate: arr.date || dep.date, arrivalTime: arr.time,
        seatNumber: seatOf(r),
        travelClass: cabinOf(r.airplaneSeatClass ?? r.reservedTicket?.ticketedSeat?.seatingType),
        cost: priceOf(r),
    };
};

/** One schema.org reservation as a trip item, or null for anything that isn't a booking. */
export const fromSchema = (r: Thing): ParsedBooking | null => {
    const type = typeOf(r);
    const f: Thing = (Array.isArray(r.reservationFor) ? r.reservationFor[0] : r.reservationFor) || {};
    if (/^(ReservationCancelled|Cancelled)/.test(str(r.reservationStatus).split('/').pop() || '')) return null;

    if (type === 'FlightReservation') {
        const { code, number } = flightNumberOf(f);
        const leg = legOf('Flight', r, f, airportOf(f.departureAirport), airportOf(f.arrivalAirport), str(f.airline) || code, number);
        if (!leg) return null;
        return {
            kind: 'transport', source: 'schema',
            transport: {
                ...leg, providerCode: code || undefined,
                departureTerminal: str(f.departureTerminal) || undefined, departureGate: str(f.departureGate) || undefined,
                arrivalTerminal: str(f.arrivalTerminal) || undefined, arrivalGate: str(f.arrivalGate) || undefined,
            },
        };
    }
    if (type === 'TrainReservation' || type === 'BusReservation' || type === 'BoatReservation') {
        const mode: TransportMode = type === 'TrainReservation' ? 'Train' : type === 'BusReservation' ? 'Bus' : 'Ferry';
        const from = str(f.departureStation ?? f.departureBusStop ?? f.departureBoatTerminal);
        const to = str(f.arrivalStation ?? f.arrivalBusStop ?? f.arrivalBoatTerminal);
        const provider = str(f.trainCompany ?? f.busCompany ?? f.provider ?? r.provider ?? r.broker);
        const identifier = str(f.trainNumber ?? f.busNumber ?? f.trainName ?? f.busName).toUpperCase();
        const leg = legOf(mode, r, f, from, to, provider, identifier);
        return leg ? { kind: 'transport', source: 'schema', transport: leg } : null;
    }
    if (type === 'RentalCarReservation') {
        const pickup = r.pickupLocation ?? {};
        const dropoff = r.dropoffLocation ?? pickup;
        const from = str(pickup) || addressOf(pickup);
        const to = str(dropoff) || addressOf(dropoff) || from;
        const leg = legOf('Car Rental', r, f, from, to, str(r.provider ?? f.rentalCompany ?? f.brand ?? r.broker), '');
        if (!leg) return null;
        const model = [str(f.brand), str(f.model)].filter(Boolean).join(' ') || str(f.name);
        return {
            kind: 'transport', source: 'schema',
            transport: { ...leg, pickupLocation: addressOf(pickup) || from, dropoffLocation: addressOf(dropoff) || to, vehicleModel: model || undefined },
        };
    }
    if (type === 'LodgingReservation') {
        const inn = splitIso(r.checkinTime ?? r.checkinDate);
        const out = splitIso(r.checkoutTime ?? r.checkoutDate);
        const name = str(f.name);
        if (!name || !inn.date) return null;
        return {
            kind: 'stay', source: 'schema',
            stay: {
                name, address: addressOf(f.address ?? f), type: stayTypeOf(`${name} ${typeOf(f)}`),
                checkInDate: inn.date, checkInTime: inn.time || '15:00',
                checkOutDate: out.date || inn.date, checkOutTime: out.time || '11:00',
                confirmationCode: str(r.reservationNumber ?? r.confirmationNumber).toUpperCase() || undefined,
                website: str(f.url) || undefined, cost: priceOf(r),
            },
        };
    }
    if (type === 'FoodEstablishmentReservation' || type === 'EventReservation' || (type === 'Reservation' && f.name)) {
        const when = splitIso(r.startTime ?? f.startDate ?? r.startDate);
        const title = str(f.name);
        if (!title || !when.date) return null;
        const place = f.location ?? f;
        return {
            kind: 'activity', source: 'schema',
            activity: {
                title, date: when.date, time: when.time,
                type: type === 'FoodEstablishmentReservation' ? 'Dining' : typeOf(f) === 'TouristAttraction' ? 'Tour' : 'Entertainment',
                location: [str(place.name) !== title ? str(place.name) : '', addressOf(place.address ?? place)].filter(Boolean).join(', ') || undefined,
                cost: priceOf(r),
                description: r.partySize ? `Table for ${str(r.partySize)}` : undefined,
            },
        };
    }
    return null;
};

/** The kind of stay a name suggests, for the stay's icon. */
export const stayTypeOf = (text: string): Accommodation['type'] => {
    const t = text.toLowerCase();
    if (/airbnb/.test(t)) return 'Airbnb';
    if (/hostel/.test(t)) return 'Hostel';
    if (/resort/.test(t)) return 'Resort';
    if (/villa/.test(t)) return 'Villa';
    if (/apartment|flat|aparthotel|residence/.test(t)) return 'Apartment';
    if (/camp/.test(t)) return 'Campground';
    return 'Hotel';
};

/* ------------------------------------------------------------------ text fallback */

const MONTHS: Record<string, number> = {
    jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6, jul: 7, aug: 8, sep: 9, sept: 9, oct: 10, nov: 11, dec: 12,
    january: 1, february: 2, march: 3, april: 4, june: 6, july: 7, august: 8, september: 9, october: 10, november: 11, december: 12,
};
const MONTH_RE = '(jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|june?|july?|aug(?:ust)?|sep(?:t(?:ember)?)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)\\.?';
const DATE_RES: { re: RegExp; read: (m: RegExpMatchArray) => [number | null, number, number] }[] = [
    { re: /\b(\d{4})-(\d{2})-(\d{2})\b/g, read: m => [+m[1], +m[2], +m[3]] },
    { re: new RegExp(`\\b(\\d{1,2})(?:st|nd|rd|th)?\\s+${MONTH_RE}(?:\\s+|,\\s*)?(\\d{4})?`, 'gi'), read: m => [m[3] ? +m[3] : null, MONTHS[m[2].toLowerCase().replace('.', '')], +m[1]] },
    { re: new RegExp(`\\b${MONTH_RE}\\s+(\\d{1,2})(?:st|nd|rd|th)?(?:,?\\s+(\\d{4}))?`, 'gi'), read: m => [m[3] ? +m[3] : null, MONTHS[m[1].toLowerCase().replace('.', '')], +m[2]] },
    { re: /\b(\d{1,2})[/.](\d{1,2})[/.](\d{4})\b/g, read: m => (+m[2] > 12 ? [+m[3], +m[1], +m[2]] : [+m[3], +m[2], +m[1]]) },
];

const pad = (n: number) => String(n).padStart(2, '0');

/** The dates in a piece of text, in order, as yyyy-mm-dd. A date without a year takes the next one on or after `ref`. */
export const findDates = (text: string, ref: string): { date: string; index: number }[] => {
    const found: { date: string; index: number; end: number }[] = [];
    const refYear = +ref.slice(0, 4);
    for (const { re, read } of DATE_RES) {
        re.lastIndex = 0;
        let m: RegExpExecArray | null;
        while ((m = re.exec(text))) {
            const [y0, mo, d] = read(m);
            if (!mo || mo > 12 || d < 1 || d > 31) continue;
            let y = y0 ?? refYear;
            let iso = `${y}-${pad(mo)}-${pad(d)}`;
            if (y0 == null && iso < ref.slice(0, 10)) { y += 1; iso = `${y}-${pad(mo)}-${pad(d)}`; }
            const index = m.index, end = m.index + m[0].length;
            if (found.some(f => index < f.end && end > f.index)) continue;
            found.push({ date: iso, index, end });
        }
    }
    return found.sort((a, b) => a.index - b.index).map(({ date, index }) => ({ date, index }));
};

/** The clock times in a piece of text, in order, as HH:mm (12-hour times are converted). */
export const findTimes = (text: string): { time: string; index: number }[] => {
    const out: { time: string; index: number }[] = [];
    const re = /\b([01]?\d|2[0-3])[:h.]([0-5]\d)\s*(am|pm|a\.m\.|p\.m\.)?(?![\d])/gi;
    let m: RegExpExecArray | null;
    while ((m = re.exec(text))) {
        if (m[0].includes('.') && !m[3] && !/[:h]/.test(m[0])) continue; // "3.50" is more likely a price than a time
        let h = +m[1];
        const ampm = (m[3] || '').toLowerCase().replace(/\./g, '');
        if (ampm === 'pm' && h < 12) h += 12;
        if (ampm === 'am' && h === 12) h = 0;
        out.push({ time: `${pad(h)}:${m[2]}`, index: m.index });
    }
    return out;
};

/** The booking reference near a label like "Booking reference", "Confirmation number" or "PNR". */
export const findReference = (text: string): string | undefined => {
    const re = /\b(?:booking|confirmation|reservation|record locator|pnr|itinerary)\s*(?:reference|code|number|no\.?|ref\.?|#)?\s*(?:is|:|#)?\s*:?\s*([A-Za-z0-9-]{5,12})\b/gi;
    let m: RegExpExecArray | null;
    while ((m = re.exec(text))) {
        const code = m[1];
        // The code is written in capitals or digits ("reservation is confirmed" is a sentence, not a code)...
        if (code !== code.toUpperCase() || /^(CONFIRMED|CONFIRMATION|RESERVED|BOOKED|NUMBER|DETAILS|REFERENCE)$/.test(code)) continue;
        // ...and has letters or is long: "12345" next to "booking" is more often a count or a price.
        if (/[A-Z]/.test(code) || code.replace(/-/g, '').length >= 7) return code;
    }
    return undefined;
};

/** Words that look like airport codes in capitals but are ordinary English (and very common in emails). */
const NOT_AIRPORTS = new Set(['THE', 'AND', 'FOR', 'YOU', 'ARE', 'NOT', 'ALL', 'ANY', 'CAN', 'HAS', 'HER', 'HIS', 'ONE', 'OUR', 'OUT', 'NEW', 'NOW', 'WAY', 'WHO', 'GET', 'SEE', 'USD', 'EUR', 'GBP', 'CHF', 'PNR', 'REF', 'VAT', 'TAX', 'FEE', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT', 'SUN', 'JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC', 'FLT', 'ETA', 'ETD', 'UTC', 'GMT', 'PDF', 'APP', 'FAQ', 'SMS', 'ATM', 'VIA', 'BAG', 'ROW', 'SEAT']);

const isAirportCode = (code: string, bracketed: boolean): boolean =>
    /^[A-Z]{3}$/.test(code) && !NOT_AIRPORTS.has(code) && (bracketed || code in AIRPORT_CODES);

const AIRPORT_PAIR = /\(?\b([A-Z]{3})\b\)?\s*(?:-|–|—|→|->|>|to|✈)\s*(?:[A-Za-zÀ-ÿ .'-]{0,40})?\(?\b([A-Z]{3})\b\)?/g;
const BRACKETED = /\(([A-Z]{3})\)/g;
const FLIGHT_NO = /\b(?:flight\s*(?:no\.?|number|#)?\s*:?\s*)?([A-Z][A-Z0-9]|[0-9][A-Z])\s?(\d{1,4})\b/g;

/** True for a line that begins a flight segment: a flight number with two airport codes beside it. */
const startsSegment = (line: string): boolean => {
    FLIGHT_NO.lastIndex = 0;
    const flight = FLIGHT_NO.exec(line);
    FLIGHT_NO.lastIndex = 0;
    if (!flight) return false;
    AIRPORT_PAIR.lastIndex = 0;
    const pair = AIRPORT_PAIR.test(line);
    AIRPORT_PAIR.lastIndex = 0;
    return pair || (line.match(BRACKETED) || []).length >= 2;
};

/** Flight segments found in plain text: flight number, two airport codes and a date in the same block. */
export const textFlights = (text: string, ref: string): ParsedTransport[] => {
    const lines = text.replace(/\r/g, '').split('\n').map(l => l.replace(/\s+/g, ' ').trim()).filter(Boolean);
    const reference = findReference(text);
    const out: ParsedTransport[] = [];
    const seen = new Set<string>();
    for (let i = 0; i < lines.length; i++) {
        // A segment is a small block of lines: this one and the next few, up to where the next segment starts.
        let end = Math.min(lines.length, i + 5);
        for (let j = i + 1; j < end; j++) if (startsSegment(lines[j])) { end = j; break; }
        const blockLines = lines.slice(Math.max(0, i - 1), end);
        const block = blockLines.join('\n');
        const here = lines[i];
        FLIGHT_NO.lastIndex = 0;
        let fm: RegExpExecArray | null;
        while ((fm = FLIGHT_NO.exec(here))) {
            const labelled = /flight/i.test(fm[0]);
            const code = fm[1];
            if (!labelled && !/[A-Z]/.test(code)) continue;
            if (!labelled && !/^[A-Z0-9]{2}$/.test(code)) continue;
            // Codes that read as words or units ("NO 1", "TO 2") need the "flight" label.
            if (!labelled && /^(NO|TO|AT|ON|IN|OF|OR|BY|UP|IS|IT|AM|PM|KG|CM|MM|ID|OK|VS|PO|ST|RD|ND|TH)$/.test(code)) continue;
            const number = `${code} ${fm[2]}`;
            let from = '', to = '';
            AIRPORT_PAIR.lastIndex = 0;
            let pm: RegExpExecArray | null;
            while ((pm = AIRPORT_PAIR.exec(block))) {
                const br = /\(/.test(pm[0]);
                if (isAirportCode(pm[1], br) && isAirportCode(pm[2], br) && pm[1] !== pm[2]) { from = pm[1]; to = pm[2]; break; }
            }
            if (!from) {
                const codes = Array.from(block.matchAll(BRACKETED)).map(m => m[1]).filter(c => isAirportCode(c, true));
                if (codes.length >= 2 && codes[0] !== codes[1]) { from = codes[0]; to = codes[1]; }
            }
            if (!from) continue;
            const dates = findDates(block, ref);
            if (!dates.length) continue;
            const times = findTimes(block);
            const depDate = dates[0].date;
            const depTime = times[0]?.time || '';
            const arrTime = times[1]?.time || '';
            // The arrival date is the one written beside the arrival time (the next segment's date is not it).
            const arrLine = times[1] ? blockLines.find(l => findTimes(l).some(t => t.time === times[1].time)) : undefined;
            const arrDates = arrLine ? findDates(arrLine, depDate).map(d => d.date).filter(d => d >= depDate) : [];
            let arrDate = arrDates.length ? arrDates[arrDates.length - 1] : depDate;
            if (arrDate === depDate && depTime && arrTime && arrTime < depTime) {
                const d = new Date(`${depDate}T00:00:00Z`); d.setUTCDate(d.getUTCDate() + 1); arrDate = toIsoDay(d);
            }
            const key = `${number}|${depDate}`;
            if (seen.has(key)) continue;
            seen.add(key);
            out.push({
                mode: 'Flight', provider: code, providerCode: code, identifier: number, confirmationCode: reference || '',
                origin: from, destination: to, departureDate: depDate, departureTime: depTime, arrivalDate: arrDate, arrivalTime: arrTime,
                seatNumber: block.match(/\bseat\s*:?\s*(\d{1,2}[A-K])\b/i)?.[1]?.toUpperCase(),
                travelClass: cabinOf(block.match(/\b(first|business|premium economy|economy)\b/i)?.[1]),
            });
        }
    }
    return out;
};

/** A hotel stay found in plain text: check-in and check-out dates, and a name from a label or a hotel-like line. */
export const textStay = (text: string, ref: string, subject?: string): ParsedStay | null => {
    const inM = text.match(/check[\s-]?in(?:\s*date)?\s*:?\s*([^\n]{0,60})/i);
    const outM = text.match(/check[\s-]?out(?:\s*date)?\s*:?\s*([^\n]{0,60})/i);
    if (!inM || !outM) return null;
    const inD = findDates(inM[1], ref)[0]?.date;
    const outD = findDates(outM[1], inD || ref)[0]?.date;
    if (!inD || !outD || outD < inD) return null;
    const lines = text.split('\n').map(l => l.trim()).filter(Boolean);
    const labelled = text.match(/\b(?:hotel|property|accommodation|stay at)\s*(?:name)?\s*:\s*([^\n]{2,80})/i)?.[1]?.trim();
    const hotelish = lines.find(l => l.length <= 80 && /\b(hotel|resort|hostel|inn|suites|apartments?|lodge|guest ?house|b&b|motel|villa|residence)\b/i.test(l) && !/check[\s-]?(in|out)/i.test(l) && !/:/.test(l));
    const fromSubject = subject?.match(/(?:at|for|:)\s+(.{3,60}?)(?:\s+[-–|]|$)/)?.[1];
    const name = labelled || hotelish || fromSubject;
    if (!name) return null;
    const address = text.match(/\baddress\s*:\s*([^\n]{4,140})/i)?.[1]?.trim() || '';
    return {
        name, address, type: stayTypeOf(name),
        checkInDate: inD, checkInTime: findTimes(inM[1])[0]?.time || '15:00',
        checkOutDate: outD, checkOutTime: findTimes(outM[1])[0]?.time || '11:00',
        confirmationCode: findReference(text),
    };
};

/* ------------------------------------------------------------------ entry point */

/** HTML to readable text: block elements become line breaks so a segment's fields stay together. */
export const htmlToText = (html: string): string => {
    const noScripts = html.replace(/<(script|style|head)[^>]*>[\s\S]*?<\/\1>/gi, ' ');
    const broken = noScripts.replace(/<(br|\/p|\/div|\/tr|\/li|\/h\d|\/table|\/td|\/th)[^>]*>/gi, m => (/td|th/i.test(m) ? ' \n' : '\n'));
    return decodeEntities(broken.replace(/<[^>]+>/g, ' ').replace(/&#(\d+);/g, (_m, n) => String.fromCharCode(+n)))
        .split('\n').map(l => l.replace(/[ \t ]+/g, ' ').trim()).filter(Boolean).join('\n');
};

const bookingKey = (b: ParsedBooking): string => {
    if (b.kind === 'transport') return `t|${b.transport.mode}|${b.transport.origin}|${b.transport.destination}|${b.transport.departureDate}|${b.transport.identifier.replace(/\s/g, '')}`;
    if (b.kind === 'stay') return `s|${b.stay.name.toLowerCase()}|${b.stay.checkInDate}`;
    return `a|${b.activity.title.toLowerCase()}|${b.activity.date}|${b.activity.time}`;
};

const sortDate = (b: ParsedBooking): string =>
    b.kind === 'transport' ? `${b.transport.departureDate}T${b.transport.departureTime || '00:00'}` : b.kind === 'stay' ? `${b.stay.checkInDate}T${b.stay.checkInTime}` : `${b.activity.date}T${b.activity.time || '00:00'}`;

/**
 * Everything bookable in a confirmation: pasted text, an HTML page or a raw `.eml`.
 * `today` (yyyy-mm-dd) places dates written without a year when the email has no Date header.
 */
export const parseBookings = (input: string, today = toIsoDay(new Date())): ParseResult => {
    const email = readEmail(input);
    const html = email.html;
    const ref = email.sentDate || today;
    const things = html ? [...jsonLdThings(html), ...microdataThings(html)] : [];
    let bookings = things.filter(t => /Reservation$/.test(typeOf(t))).map(fromSchema).filter((b): b is ParsedBooking => Boolean(b));

    if (bookings.length === 0) {
        const text = [email.text, html ? htmlToText(html) : ''].filter(Boolean).join('\n');
        bookings = textFlights(text, ref).map(transport => ({ kind: 'transport' as const, source: 'text' as const, transport }));
        const stay = textStay(text, ref, email.subject);
        if (stay) bookings.push({ kind: 'stay', source: 'text', stay });
    }

    const seen = new Set<string>();
    const unique = bookings.filter(b => { const k = bookingKey(b); if (seen.has(k)) return false; seen.add(k); return true; });
    unique.sort((a, b) => sortDate(a).localeCompare(sortDate(b)));
    return { bookings: unique, subject: email.subject };
};
