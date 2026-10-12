// Design-token lint (WP-4.6, UI-009/UI-010). Fails when UI code uses:
//   - a numeric or arbitrary z-index instead of the token scale (AGENTS.md §8)
//   - an arbitrary hex colour class such as bg-[#123456]
//   - a colour shade that doesn't exist in the configured palette (e.g. text-gray-750), which Tailwind silently drops
// Usage: node scripts/check-tokens.mjs [files...]   (no arguments = every .ts/.tsx under App, views, components)
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import resolveConfig from 'tailwindcss/resolveConfig.js';
import tailwindConfig from '../tailwind.config.js';

// Files whose hex values are data, not styling: map-style preview swatches and the WebGL globe background.
const HEX_ALLOWLIST = new Set(['components/mapSettings/tabs/MapTab.tsx', 'components/DeckFlightMap.tsx']);

const walk = (dir) => readdirSync(dir).flatMap((name) => {
  const p = join(dir, name);
  return statSync(p).isDirectory() ? walk(p) : /\.(ts|tsx)$/.test(name) ? [p] : [];
});
const files = process.argv.length > 2 ? process.argv.slice(2) : ['App.tsx', 'constants.ts', ...walk('views'), ...walk('components')];

const { theme } = resolveConfig(tailwindConfig);
const colorUtil = '(?:bg|text|border|border-[trblxy]|ring|ring-offset|from|via|to|fill|stroke|outline|decoration|divide|placeholder|accent|caret|shadow)';
const colorClass = new RegExp(`(?<![\\w\\[-])${colorUtil}-([a-z]+)-(\\d{2,3})(?![\\w\\]])`, 'g');
const numericZ = /(?<![\w\[-])z-(10|20|30|40|50)(?![\w\]-])|(?<![\w-])z-\[[^\]]+\]/g;
const arbitraryHex = /(?<![\w-])[a-z-]+-\[#[0-9a-fA-F]{3,8}\]/g;

const problems = [];
for (const file of files) {
  const lines = readFileSync(file, 'utf8').split('\n');
  lines.forEach((line, i) => {
    const at = `${file}:${i + 1}`;
    for (const m of line.matchAll(numericZ)) problems.push(`${at}  ${m[0]}  → use z-raised/z-float/z-dropdown/z-sticky/z-modal-backdrop/z-modal/z-popover/z-toast/z-tooltip`);
    if (!HEX_ALLOWLIST.has(file)) for (const m of line.matchAll(arbitraryHex)) problems.push(`${at}  ${m[0]}  → use a palette or theme token`);
    for (const m of line.matchAll(colorClass)) {
      const [, color, shade] = m;
      const scale = theme.colors[color];
      if (scale && typeof scale === 'object' && !(shade in scale)) problems.push(`${at}  ${m[0]}  → ${color} has no ${shade} shade`);
    }
  });
}

if (problems.length) {
  console.error(`check-tokens: ${problems.length} problem(s)\n` + problems.join('\n'));
  process.exit(1);
}
console.log(`check-tokens: ${files.length} files clean`);
