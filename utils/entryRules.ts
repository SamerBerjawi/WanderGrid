/**
 * Entry rules: a small, static starter table of what a passport needs to enter a country, and how long the
 * passport must stay valid. It is a guide, not advice: rules change, so the screen always says when it was last
 * reviewed and points to the government's own site. It covers the destinations and passports travellers
 * ask about most; anything it does not know is reported as "check", never as fine.
 */

/** When the table was last reviewed. Shown beside every answer. */
export const RULES_REVIEWED = '2026-11';

export type EntryKind = 'free' | 'eta' | 'evisa' | 'visa' | 'unknown';
export interface EntryRule {
    kind: EntryKind;
    /** The document, when there is one: "ESTA", "eTA", "e-Visa". */
    doc?: string;
    /** Days you may stay without a visa. */
    days?: number;
    note?: string;
}

const words = (s: string) => s.split(/\s+/).filter(Boolean);

/** Schengen area members (full members as of 2025). */
export const SCHENGEN = words('AT BE BG CH CZ DE DK EE ES FI FR GR HR HU IS IT LI LT LU LV MT NL NO PL PT RO SE SI SK');
/** EU, EEA and Switzerland: free movement. */
export const EU_EEA_CH = [...SCHENGEN, 'CY', 'IE'];
/** Passports that most destinations let in without a visa. */
export const WIDELY_EXEMPT = [...EU_EEA_CH, 'US', 'CA', 'GB', 'AU', 'NZ', 'JP', 'KR', 'SG'];
/** The US Visa Waiver Program countries (an ESTA is enough). */
const VWP = words('AD AT AU BE BN CH CL CZ DE DK EE ES FI FR GB GR HR HU IE IS IT JP KR LI LT LU LV MC MT NL NO NZ PL PT QA RO SE SG SI SK SM TW');

const has = (list: string[], code: string) => list.includes(code);

/** Countries named by demonym, as people write a nationality ("French", "Dutch"). */
const DEMONYMS: Record<string, string> = {
    american: 'US', british: 'GB', english: 'GB', scottish: 'GB', welsh: 'GB', french: 'FR', german: 'DE', dutch: 'NL', belgian: 'BE', italian: 'IT',
    spanish: 'ES', portuguese: 'PT', irish: 'IE', swiss: 'CH', austrian: 'AT', swedish: 'SE', norwegian: 'NO', danish: 'DK', finnish: 'FI', polish: 'PL',
    greek: 'GR', czech: 'CZ', hungarian: 'HU', romanian: 'RO', bulgarian: 'BG', croatian: 'HR', canadian: 'CA', australian: 'AU', 'new zealander': 'NZ',
    japanese: 'JP', korean: 'KR', 'south korean': 'KR', singaporean: 'SG', indian: 'IN', chinese: 'CN', brazilian: 'BR', mexican: 'MX', lebanese: 'LB',
    turkish: 'TR', israeli: 'IL', emirati: 'AE', thai: 'TH', icelandic: 'IS', luxembourgish: 'LU', maltese: 'MT', estonian: 'EE', latvian: 'LV', lithuanian: 'LT',
    slovak: 'SK', slovenian: 'SI', cypriot: 'CY', south_african: 'ZA', 'south african': 'ZA', argentine: 'AR', argentinian: 'AR', chilean: 'CL', colombian: 'CO',
};
export const demonymCode = (text?: string): string | undefined => DEMONYMS[(text || '').trim().toLowerCase()];

/** What `nat` (a country code) needs to enter `dest` (a country code). */
export const entryRule = (nat: string, dest: string): EntryRule => {
    if (nat === dest) return { kind: 'free', note: 'Your own country.' };
    const eu = has(EU_EEA_CH, nat);
    const wide = has(WIDELY_EXEMPT, nat);

    if (has(SCHENGEN, dest)) {
        if (eu) return { kind: 'free', note: 'Free movement: carry your passport or ID card.' };
        if (has(['US', 'CA', 'AU', 'NZ', 'GB', 'JP', 'KR', 'SG'], nat)) return { kind: 'free', days: 90, note: '90 days in any 180. The EU\'s ETIAS authorisation is being introduced: check its site before you go.' };
        return { kind: 'unknown' };
    }
    switch (dest) {
        case 'US':
            if (has(VWP, nat)) return { kind: 'eta', doc: 'ESTA', days: 90, note: 'Apply online before you fly; it is valid for two years.' };
            if (nat === 'CA') return { kind: 'free', note: 'No ESTA for Canadian citizens; carry your passport.' };
            return { kind: 'visa', doc: 'Visa', note: 'Most other passports need a visa from a US embassy.' };
        case 'GB':
            if (nat === 'IE') return { kind: 'free', note: 'Irish citizens need no permission.' };
            if (wide) return { kind: 'eta', doc: 'UK ETA', days: 180, note: 'Apply online before you travel.' };
            return { kind: 'unknown' };
        case 'CA':
            if (nat === 'US') return { kind: 'free', note: 'Carry your passport.' };
            if (wide) return { kind: 'eta', doc: 'eTA', days: 180, note: 'Needed to fly in; not for crossing by land or sea.' };
            return { kind: 'unknown' };
        case 'AU':
            if (nat === 'NZ') return { kind: 'free', note: 'New Zealanders get a visa on arrival (Special Category).' };
            if (has(EU_EEA_CH, nat) || nat === 'GB') return { kind: 'eta', doc: 'eVisitor', days: 90, note: 'Free, apply online before you travel.' };
            if (wide) return { kind: 'eta', doc: 'ETA', days: 90, note: 'Apply in the Australian ETA app before you travel.' };
            return { kind: 'unknown' };
        case 'NZ':
            if (nat === 'AU') return { kind: 'free', note: 'Australian citizens need no visa.' };
            if (wide) return { kind: 'eta', doc: 'NZeTA', days: 90, note: 'Apply online before you travel; a tourist levy applies.' };
            return { kind: 'unknown' };
        case 'IN':
            if (wide) return { kind: 'evisa', doc: 'e-Visa', note: 'Apply online before you travel.' };
            return { kind: 'unknown' };
        case 'JP':
            if (wide) return { kind: 'free', days: 90, note: 'Visit Japan Web speeds up arrival.' };
            return { kind: 'unknown' };
        case 'TH':
            if (wide) return { kind: 'free', days: 60, note: 'The digital arrival card is required before you land.' };
            return { kind: 'unknown' };
        case 'SG':
            if (wide) return { kind: 'free', days: 90, note: 'Submit the SG Arrival Card within three days of arriving.' };
            return { kind: 'unknown' };
        case 'AE':
            if (wide) return { kind: 'free', days: 30, note: 'Allowed stays are 30 to 90 days, by passport.' };
            return { kind: 'unknown' };
        default:
            return { kind: 'unknown' };
    }
};

export interface ValidityRule {
    /** Months the passport must stay valid after you leave (0: for the stay only). */
    months: number;
    /** The passport must have been issued within this many years. */
    maxAgeYears?: number;
    note?: string;
}

const SIX_MONTHS = words('TH CN ID VN SG MY PH IN AE SA QA OM KW BH EG RU CU MA NP LK KH LA MM BD PK');

/** How long a passport must stay valid for a destination. */
export const validityRule = (dest: string): ValidityRule => {
    if (has(SCHENGEN, dest)) return { months: 3, maxAgeYears: 10, note: 'Valid at least 3 months after you leave the Schengen area, and issued in the last 10 years.' };
    if (dest === 'NZ') return { months: 3 };
    if (dest === 'TR') return { months: 5, note: 'Turkey asks for 150 days after arrival.' };
    if (dest === 'ZA') return { months: 1, note: 'South Africa asks for 30 days after you leave, and two blank pages.' };
    if (has(SIX_MONTHS, dest)) return { months: 6 };
    return { months: 0 };
};
