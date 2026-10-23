const fs = require('fs');
const path = require('path');

// The release line (major.minor). Change it here when a new minor or major version starts; the counter resets.
const RELEASE_LINE = '1.1';

const versionFilePath = path.join(__dirname, '..', 'version.ts');
const packageFilePath = path.join(__dirname, '..', 'package.json');

const now = new Date();
const yy = String(now.getFullYear()).slice(-2);
const mm = String(now.getMonth() + 1).padStart(2, '0');
const dd = String(now.getDate()).padStart(2, '0');
const todayDateStr = `${yy}${mm}${dd}`;

let currentVersion = `v${RELEASE_LINE}-${todayDateStr}.1`;

if (fs.existsSync(versionFilePath)) {
  try {
    const content = fs.readFileSync(versionFilePath, 'utf8');
    const match = content.match(/APP_VERSION\s*=\s*['"]v(\d+\.\d+)-(\d{6})\.(\d+)['"]/);
    if (match) {
      const prevLine = match[1];
      const prevDate = match[2];
      const prevCounter = parseInt(match[3], 10);
      // The counter continues only within the same release line and day.
      if (prevLine === RELEASE_LINE && prevDate === todayDateStr) {
        currentVersion = `v${RELEASE_LINE}-${todayDateStr}.${prevCounter + 1}`;
      } else {
        currentVersion = `v${RELEASE_LINE}-${todayDateStr}.1`;
      }
    }
  } catch (err) {
    console.warn('Could not read version.ts:', err.message);
  }
}

try {
  // Update version.ts
  fs.writeFileSync(versionFilePath, `export const APP_VERSION = '${currentVersion}';\n`, 'utf8');
} catch (err) {
  console.warn('Could not write version.ts:', err.message);
}

try {
  // Update package.json
  if (fs.existsSync(packageFilePath)) {
    const pkg = JSON.parse(fs.readFileSync(packageFilePath, 'utf8'));
    pkg.version = currentVersion.replace(/^v/, '');
    fs.writeFileSync(packageFilePath, JSON.stringify(pkg, null, 2) + '\n', 'utf8');
  }
} catch (err) {
  console.warn('Could not write package.json:', err.message);
}

console.log(`Version updated to ${currentVersion}`);
