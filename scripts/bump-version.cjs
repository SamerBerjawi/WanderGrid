const fs = require('fs');
const path = require('path');

const versionFilePath = path.join(__dirname, '..', 'version.ts');
const packageFilePath = path.join(__dirname, '..', 'package.json');

const now = new Date();
const yy = String(now.getFullYear()).slice(-2);
const mm = String(now.getMonth() + 1).padStart(2, '0');
const dd = String(now.getDate()).padStart(2, '0');
const todayDateStr = `${yy}${mm}${dd}`;

let currentVersion = `v0.5-${todayDateStr}.1`;

if (fs.existsSync(versionFilePath)) {
  try {
    const content = fs.readFileSync(versionFilePath, 'utf8');
    const match = content.match(/APP_VERSION\s*=\s*['"]v0\.5-(\d{6})\.(\d+)['"]/);
    if (match) {
      const prevDate = match[1];
      const prevCounter = parseInt(match[2], 10);
      if (prevDate === todayDateStr) {
        currentVersion = `v0.5-${todayDateStr}.${prevCounter + 1}`;
      } else {
        currentVersion = `v0.5-${todayDateStr}.1`;
      }
    } else {
      currentVersion = `v0.5-${todayDateStr}.1`;
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
