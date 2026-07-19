const fs = require('fs');
const path = require('path');

const src = `C:\\Users\\Lenovo\\.gemini\\antigravity-ide\\brain\\c841e404-bf7a-4b1f-9189-930f7861bfa5\\galaxy_academy_icon_1784451183566.png`;
const destDir = path.join(__dirname, 'assets', 'icons');

try {
  if (!fs.existsSync(destDir)) {
    fs.mkdirSync(destDir, { recursive: true });
  }

  fs.copyFileSync(src, path.join(destDir, 'icon-192.png'));
  fs.copyFileSync(src, path.join(destDir, 'icon-512.png'));
  fs.copyFileSync(src, path.join(__dirname, 'favicon.ico'));

  console.log('Icons and favicon copied successfully!');
} catch (err) {
  console.error('Failed to copy icons:', err);
}
