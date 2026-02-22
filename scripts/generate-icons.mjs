#!/usr/bin/env node

/**
 * Generate app icon for D-Chat Desktop.
 *
 * Creates a 512x512 PNG icon: dark rounded-square background (#1e1e2e)
 * with a white "D" lettermark centered.
 *
 * electron-builder will automatically convert icon.png to .icns (macOS)
 * and .ico (Windows) during packaging.
 *
 * Usage: node scripts/generate-icons.mjs
 */

import sharp from 'sharp';
import { writeFileSync, mkdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const resourcesDir = join(__dirname, '..', 'resources');

const SIZE = 512;
const BG_COLOR = '#1e1e2e';
const CORNER_RADIUS = 100;

// Build the SVG for the icon
const svg = `<svg width="${SIZE}" height="${SIZE}" xmlns="http://www.w3.org/2000/svg">
  <rect width="${SIZE}" height="${SIZE}" rx="${CORNER_RADIUS}" ry="${CORNER_RADIUS}" fill="${BG_COLOR}"/>
  <text
    x="50%" y="54%"
    dominant-baseline="middle"
    text-anchor="middle"
    font-family="Arial, Helvetica, sans-serif"
    font-weight="bold"
    font-size="320"
    fill="white"
    letter-spacing="-10"
  >D</text>
</svg>`;

async function main() {
  mkdirSync(resourcesDir, { recursive: true });

  const outputPath = join(resourcesDir, 'icon.png');

  await sharp(Buffer.from(svg))
    .resize(SIZE, SIZE)
    .png()
    .toFile(outputPath);

  console.log(`Created ${outputPath} (${SIZE}x${SIZE})`);

  // Also generate a 256x256 version for Windows .ico compatibility
  const icon256Path = join(resourcesDir, 'icon-256.png');
  await sharp(Buffer.from(svg))
    .resize(256, 256)
    .png()
    .toFile(icon256Path);

  console.log(`Created ${icon256Path} (256x256)`);
}

main().catch((err) => {
  console.error('Icon generation failed:', err);
  process.exit(1);
});
