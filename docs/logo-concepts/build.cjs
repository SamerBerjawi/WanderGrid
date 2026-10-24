// Generates logo concept SVGs + preview sheet. Palette from UI_UX_DESIGN_REFERENCE.md §1.4.
const fs = require('fs');
const P = { ink: '#181A1A', paper: '#F2EFE8', green: '#2C5D4F', rust: '#C7441E', mustard: '#F0C94C' };
const s = (w) => `stroke-width="${w}" stroke-linecap="round" stroke-linejoin="round" fill="none"`;

// Each concept: name, tagline, tile bg, and mark(fg, accent, bg) -> svg fragment in a 512 box (safe zone 96..416).
const concepts = [
  { id: 'a', name: 'Waypoints', note: 'A "W" drawn as a route: one continuous line, two nodes. Reads as W at every size and as a journey up close.', bg: P.ink,
    mark: (f, a) => `<path d="M118 160 L187 360 L256 232 L325 360 L394 160" stroke="${f}" ${s(34)}/><circle cx="118" cy="160" r="30" fill="${f}"/><circle cx="394" cy="160" r="30" fill="${a}"/>` },
  { id: 'b', name: 'Routed grid', note: 'Nine grid nodes with a path routed through them. The most literal reading of the name, and it echoes the dotted grid in the current icon.', bg: P.ink,
    mark: (f, a) => [160, 256, 352].flatMap(x => [160, 256, 352].map(y => ({ x, y }))).filter(p => !((p.x === 160 && p.y === 352) || (p.x === 256 && p.y === 352) || (p.x === 256 && p.y === 256) || (p.x === 256 && p.y === 160) || (p.x === 352 && p.y === 160))).map(p => `<circle cx="${p.x}" cy="${p.y}" r="15" fill="${f}" opacity=".45"/>`).join('') + `<path d="M160 352 H256 V160 H352" stroke="${f}" ${s(30)}/><circle cx="160" cy="352" r="26" fill="${f}"/><circle cx="352" cy="160" r="34" fill="${a}"/>` },
  { id: 'c', name: 'Departure arc', note: 'A single flight arc between two points over a horizon line. Calmest of the set; strongest as a standalone glyph.', bg: P.green,
    mark: (f, a) => `<path d="M122 352 C150 150 362 150 390 352" stroke="${f}" ${s(32)}/><path d="M96 392 H416" stroke="${f}" ${s(20)} opacity=".5"/><circle cx="122" cy="352" r="28" fill="${f}"/><circle cx="390" cy="352" r="28" fill="${a}"/>` },
  { id: 'd', name: 'Globe grid', note: 'Latitude and longitude as a minimal globe with one marked location. Says "atlas" and "grid" at once; the busiest at 16px, so it would need a simplified favicon cut.', bg: P.paper,
    mark: (f, a) => `<circle cx="256" cy="256" r="148" stroke="${f}" ${s(26)}/><ellipse cx="256" cy="256" rx="66" ry="148" stroke="${f}" ${s(18)}/><path d="M108 256 H404" stroke="${f}" ${s(18)}/><circle cx="332" cy="178" r="38" fill="${P.paper}"/><circle cx="332" cy="178" r="30" fill="${a}"/>` },
  { id: 'e', name: 'Bearing', note: 'A navigation chevron with a rust tip, set over a faint crosshair. Feels like a tool rather than a holiday brand.', bg: P.ink,
    mark: (f, a) => `<path d="M256 56 V456 M56 256 H456" stroke="${f}" ${s(8)} opacity=".25"/><path d="M256 110 L378 394 L256 328 L134 394 Z" fill="${f}" stroke="${f}" stroke-width="14" stroke-linejoin="round"/><path d="M256 110 L256 328 L378 394 Z" fill="${a}" stroke="${a}" stroke-width="14" stroke-linejoin="round"/>` },
];

const tile = (c, size = 512, round = 0) => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512" width="${size}" height="${size}"><rect width="512" height="512" ${round ? `rx="${round}"` : ''} fill="${c.bg}"/>${c.mark(c.bg === P.paper ? P.ink : P.paper, c.bg === P.green ? P.mustard : P.rust)}</svg>`;
const markOnly = (c, fg, ac) => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512">${c.mark(fg, ac)}</svg>`;

for (const c of concepts) {
  fs.writeFileSync(`concept-${c.id}-tile.svg`, tile(c));
  fs.writeFileSync(`concept-${c.id}-mark.svg`, markOnly(c, c.bg === P.paper ? P.ink : P.ink, P.rust));
}

const lock = (c, dark) => `<div class="lock ${dark ? 'dk' : ''}"><div class="m">${markOnly(c, dark ? P.paper : P.ink, P.rust)}</div><span>wandergrid</span></div>`;
const html = `<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>WanderGrid logo concepts</title>
<style>
:root{--ink:${P.ink};--paper:${P.paper};--muted:#6E675C;--line:#DDD7CA}
*{box-sizing:border-box}body{margin:0;background:#F7F5F0;color:var(--ink);font:15px/1.5 -apple-system,system-ui,sans-serif;padding:32px 16px}
.w{max-width:1000px;margin:0 auto}h1{font-size:26px;margin:0 0 4px}p.s{color:var(--muted);margin:0 0 28px}
.card{background:#fff;border:1px solid var(--line);border-radius:28px;padding:24px;margin-bottom:20px;display:grid;grid-template-columns:200px 1fr;gap:28px}
@media(max-width:700px){.card{grid-template-columns:1fr}}
.big svg{width:200px;height:200px;border-radius:45px;display:block}
h2{margin:0 0 4px;font-size:18px}.card p{margin:0 0 16px;color:var(--muted)}
.row{display:flex;gap:20px;align-items:flex-end;flex-wrap:wrap}
.cap{font-size:11px;color:var(--muted);margin-top:6px;text-align:center}
.row svg{display:block}.i{text-align:center}
.pwa{width:72px;height:72px;border-radius:16px}.circ{width:72px;height:72px;border-radius:50%}
.lock{display:flex;align-items:center;gap:10px;padding:12px 16px;border-radius:16px;background:#fff;border:1px solid var(--line);font-weight:600;font-size:20px;letter-spacing:-.02em}
.lock.dk{background:var(--ink);color:var(--paper);border-color:var(--ink)}.lock .m svg{width:32px;height:32px;display:block}
.fav{background:#E9E5DA;padding:6px 10px;border-radius:8px 8px 0 0;display:flex;gap:8px;align-items:center;font-size:12px}
</style><div class="w"><h1>WanderGrid logo concepts</h1><p class="s">Palette from the New-pages design reference: ink, paper, green, rust, mustard. Each concept shows the app icon, maskable PWA tile, favicon sizes, and wordmark lockups.</p>
${concepts.map(c => `<section class="card"><div class="big">${tile(c, 200, 112)}</div><div><h2>${c.id.toUpperCase()} · ${c.name}</h2><p>${c.note}</p>
<div class="row">
<div class="i">${tile(c, 72, 16).replace('<svg ', '<svg class="pwa" ')}<div class="cap">App icon</div></div>
<div class="i">${tile(c, 72).replace('<svg ', '<svg class="circ" style="border-radius:50%" ')}<div class="cap">Maskable (circle)</div></div>
<div class="i">${tile(c, 32, 7)}<div class="cap">32px</div></div>
<div class="i">${tile(c, 16, 4)}<div class="cap">16px</div></div>
<div class="i"><div class="fav">${tile(c, 16, 3)}WanderGrid</div><div class="cap">Browser tab</div></div>
${lock(c, false)}${lock(c, true)}
</div></div></section>`).join('')}</div>`;
fs.writeFileSync('index.html', html);
