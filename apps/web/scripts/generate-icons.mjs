import sharp from 'sharp';
import fs from 'fs';
import path from 'path';

const publicDir = path.resolve('apps/web/public');
const svgRaw = fs.readFileSync(path.join(publicDir, 'icon.svg'), 'utf8');

// Create square version (without rounded corners) for iOS and Android maskable icon
const squareSvg = svgRaw
  .replace('rx="112"', 'rx="0"')
  .replace('rx="104"', 'rx="0"');

async function generate() {
  console.log('Generating PWA and Apple Touch icons...');

  // 1. Apple Touch Icon (180x180)
  await sharp(Buffer.from(squareSvg))
    .resize(180, 180)
    .png()
    .toFile(path.join(publicDir, 'apple-touch-icon.png'));
  console.log('Created apple-touch-icon.png (180x180)');

  // 2. Icon 192 (192x192)
  await sharp(Buffer.from(squareSvg))
    .resize(192, 192)
    .png()
    .toFile(path.join(publicDir, 'icon-192.png'));
  console.log('Created icon-192.png (192x192)');

  // 3. Icon 512 (512x512)
  await sharp(Buffer.from(squareSvg))
    .resize(512, 512)
    .png()
    .toFile(path.join(publicDir, 'icon-512.png'));
  console.log('Created icon-512.png (512x512)');

  console.log('All icons generated successfully!');
}

generate().catch(err => {
  console.error('Icon generation failed:', err);
  process.exit(1);
});

