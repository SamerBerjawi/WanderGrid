/**
 * The rp-* design tokens as RGB arrays for WebGL layers (deck.gl, MapLibre paint), read from the
 * CSS variables in components/new/new.css so the map always matches the page tokens and theme.
 */
export type RGB = [number, number, number];

export interface RpPalette {
    canvas: RGB;
    surface: RGB;
    inset: RGB;
    line: RGB;
    ink: RGB;
    onInk: RGB;
    paper: RGB;
    muted: RGB;
    green: RGB;
    rust: RGB;
    mustard: RGB;
}

const TOKENS: Record<keyof RpPalette, string> = {
    canvas: '--rp-canvas',
    surface: '--rp-surface',
    inset: '--rp-inset',
    line: '--rp-line',
    ink: '--rp-ink',
    onInk: '--rp-on-ink',
    paper: '--rp-paper',
    muted: '--rp-muted',
    green: '--rp-green',
    rust: '--rp-rust',
    mustard: '--rp-mustard',
};

const parse = (value: string, fallback: RGB): RGB => {
    const parts = value.trim().split(/\s+/).map(Number);
    return parts.length === 3 && parts.every(n => Number.isFinite(n)) ? (parts as RGB) : fallback;
};

/** True once the rp-* variables resolve on `el` (new.css arrives with a lazy chunk, so not always at mount). */
export const rpTokensReady = (el: Element | null) =>
    Boolean(el && getComputedStyle(el).getPropertyValue('--rp-ink').trim());

export const readRpPalette = (el: Element | null): RpPalette => {
    const style = el ? getComputedStyle(el) : null;
    const out = {} as RpPalette;
    (Object.keys(TOKENS) as (keyof RpPalette)[]).forEach(key => {
        out[key] = parse(style?.getPropertyValue(TOKENS[key]) ?? '', [128, 128, 128]);
    });
    return out;
};

export const rgba = (c: RGB, a = 1): [number, number, number, number] => [c[0], c[1], c[2], Math.round(a * 255)];
export const css = (c: RGB, a = 1) => `rgba(${c[0]}, ${c[1]}, ${c[2]}, ${a})`;
export const mix = (a: RGB, b: RGB, t: number): RGB => [
    Math.round(a[0] + (b[0] - a[0]) * t),
    Math.round(a[1] + (b[1] - a[1]) * t),
    Math.round(a[2] + (b[2] - a[2]) * t),
];
