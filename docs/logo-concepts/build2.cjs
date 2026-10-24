// Round 2: blends of B (routed grid) and C (departure arc) on the green palette.
const fs = require('fs');
const P = { ink: '#181A1A', paper: '#F2EFE8', green: '#2C5D4F', rust: '#C7441E', mustard: '#F0C94C' };
const s = (w) => `stroke-width="${w}" stroke-linecap="round" stroke-linejoin="round" fill="none"`;
const dots = (xs, ys, skip, f, r = 14, o = .4) => xs.flatMap(x => ys.map(y => [x, y])).filter(([x, y]) => !skip.some(([a, b]) => a === x && b === y)).map(([x, y]) => `<circle cx="${x}" cy="${y}" r="${r}" fill="${f}" opacity="${o}"/>`).join('');
const G = [160, 256, 352];

const concepts = [
  { id: 'f', name: 'Arc over the grid', note: 'The departure arc leaves the bottom-left grid node and lands on the bottom-right one, passing over the rest of the grid.',
    mark: (f, a) => dots(G, G, [[160, 352], [352, 352]], f) + `<path d="M160 352 C190 90 322 90 352 352" stroke="${f}" ${s(30)}/><circle cx="160" cy="352" r="28" fill="${f}"/><circle cx="352" cy="352" r="32" fill="${a}"/>` },
  { id: 'g', name: 'Routed grid, green', note: 'Concept B in the C palette: paper route, mustard destination, faint grid. The most direct merge.',
    mark: (f, a) => dots([160, 352], [160, 256, 352], [[160, 352], [352, 160]], f, 15, .35) + dots([256], [352, 256, 160], [], f, 15, 0) + `<path d="M160 352 H256 V160 H352" stroke="${f}" ${s(30)}/><circle cx="160" cy="352" r="26" fill="${f}"/><circle cx="352" cy="160" r="34" fill="${a}"/>` },
  { id: 'h', name: 'Curved route', note: 'An orthogonal grid route with one sweeping turn: the straight lines of B resolve into the arc of C.',
    mark: (f, a) => dots(G, G, [[160, 352], [256, 352], [352, 256], [352, 160]], f, 14, .3) + `<path d="M160 352 H256 A96 96 0 0 0 352 256 V160" stroke="${f}" ${s(30)}/><circle cx="160" cy="352" r="26" fill="${f}"/><circle cx="352" cy="160" r="34" fill="${a}"/>` },
  { id: 'i', name: 'Dotted flight path', note: 'The arc is a dotted trail, so the whole mark is dots on a grid. Soft and modern; needs a bolder favicon cut.',
    mark: (f, a) => { const pts = []; for (let i = 0; i <= 8; i++) { const t = i / 8, x = 128 + 256 * t, y = 360 - 4 * 190 * t * (1 - t); pts.push(`<circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="${i === 0 || i === 8 ? 0 : 14}" fill="${f}"/>`); } return pts.join('') + `<circle cx="128" cy="360" r="28" fill="${f}"/><circle cx="384" cy="360" r="32" fill="${a}"/><path d="M96 410 H416" stroke="${f}" ${s(14)} opacity=".4"/>`; } },
  { id: 'j', name: 'Crosshair arc', note: 'The arc over a faint 2×2 grid cell, with nodes on the grid lines. Keeps the crosshair from the current icon.',
    mark: (f, a) => `<path d="M256 80 V432 M80 256 H432" stroke="${f}" ${s(10)} opacity=".3"/><path d="M128 384 C150 120 362 120 384 384" stroke="${f}" ${s(32)}/><circle cx="128" cy="384" r="28" fill="${f}"/><circle cx="384" cy="384" r="30" fill="${a}"/>` },
  { id: 'k', name: 'Grid hop', note: 'Three nodes in a row on the horizon and an arc hopping from the first to the last: a multi-stop trip in the simplest form.',
    mark: (f, a) => `<path d="M128 360 C150 130 362 130 384 360" stroke="${f}" ${s(30)}/><circle cx="128" cy="360" r="28" fill="${f}"/><circle cx="256" cy="360" r="20" fill="${f}" opacity=".5"/><circle cx="384" cy="360" r="32" fill="${a}"/><path d="M96 412 H416" stroke="${f}" ${s(14)} opacity=".4"/>` },
];

const variants = [
  { k: 'green', bg: P.green, fg: P.paper, ac: P.mustard },
  { k: 'ink', bg: P.ink, fg: P.paper, ac: P.mustard },
  { k: 'paper', bg: P.paper, fg: P.green, ac: P.rust },
];
const tile = (c, v, size = 512, r = 0) => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512" width="${size}" height="${size}"><rect width="512" height="512" ${r ? `rx="${r}"` : ''} fill="${v.bg}"/>${c.mark(v.fg, v.ac)}</svg>`;
const mk = (c, fg, ac) => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512">${c.mark(fg, ac)}</svg>`;
for (const c of concepts) { fs.writeFileSync(`concept-${c.id}-tile.svg`, tile(c, variants[0])); fs.writeFileSync(`concept-${c.id}-mark.svg`, mk(c, P.green, P.rust)); }

const lock = (c, dk) => `<div class="lock ${dk ? 'dk' : ''}"><div class="m">${mk(c, dk ? P.paper : P.green, dk ? P.mustard : P.rust)}</div><span>wandergrid</span></div>`;
const html = `<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>WanderGrid logo concepts, round 2</title>
<style>
:root{--ink:${P.ink};--muted:#6E675C;--line:#DDD7CA}*{box-sizing:border-box}
body{margin:0;background:#F7F5F0;color:var(--ink);font:15px/1.5 -apple-system,system-ui,sans-serif;padding:32px 16px}
.w{max-width:1000px;margin:0 auto}h1{font-size:26px;margin:0 0 4px}p.s{color:var(--muted);margin:0 0 28px}
.card{background:#fff;border:1px solid var(--line);border-radius:28px;padding:24px;margin-bottom:20px;display:grid;grid-template-columns:200px 1fr;gap:28px}
@media(max-width:700px){.card{grid-template-columns:1fr}}
.big svg{width:200px;height:200px;border-radius:45px;display:block}h2{margin:0 0 4px;font-size:18px}.card p{margin:0 0 16px;color:var(--muted)}
.row{display:flex;gap:18px;align-items:flex-end;flex-wrap:wrap}.i{text-align:center}.i svg{display:block}.cap{font-size:11px;color:var(--muted);margin-top:6px}
.lock{display:flex;align-items:center;gap:10px;padding:12px 16px;border-radius:16px;background:#fff;border:1px solid var(--line);font-weight:600;font-size:20px;letter-spacing:-.02em}
.lock.dk{background:${P.green};color:${P.paper};border-color:${P.green}}.lock .m svg{width:32px;height:32px;display:block}
.fav{background:#E9E5DA;padding:6px 10px;border-radius:8px 8px 0 0;display:flex;gap:8px;align-items:center;font-size:12px}
</style><div class="w"><h1>Round 2: routed grid × departure arc</h1><p class="s">Green tile with paper mark and mustard destination as the lead; ink and paper tiles shown as alternates.</p>
${concepts.map(c => `<section class="card"><div class="big">${tile(c, variants[0], 200, 45)}</div><div><h2>${c.id.toUpperCase()} · ${c.name}</h2><p>${c.note}</p><div class="row">
<div class="i">${tile(c, variants[0], 72, 16)}<div class="cap">App icon</div></div>
<div class="i">${tile(c, variants[1], 72, 16)}<div class="cap">Ink</div></div>
<div class="i">${tile(c, variants[2], 72, 16)}<div class="cap">Paper</div></div>
<div class="i"><div style="border-radius:50%;overflow:hidden;width:72px;height:72px">${tile(c, variants[0], 72)}</div><div class="cap">Maskable</div></div>
<div class="i">${tile(c, variants[0], 32, 7)}<div class="cap">32px</div></div>
<div class="i">${tile(c, variants[0], 16, 4)}<div class="cap">16px</div></div>
<div class="i"><div class="fav">${tile(c, variants[0], 16, 3)}WanderGrid</div><div class="cap">Tab</div></div>
${lock(c, false)}${lock(c, true)}</div></div></section>`).join('')}</div>`;
fs.writeFileSync('index-round2.html', html);
