'use strict';

const fs = require('node:fs');
const path = require('node:path');
const sharp = require('sharp');

const mobileRoot = path.resolve(__dirname, '..');
const assetsRoot = path.join(mobileRoot, 'assets');
const markPath = path.join(assetsRoot, 'brand', 'togt-mark.svg');

const CREAM = '#F7F4EF';

function readMark() {
  if (!fs.existsSync(markPath)) {
    throw new Error(`Missing brand source: ${markPath}`);
  }
  return fs.readFileSync(markPath);
}

async function renderSquare(mark) {
  const foreground = await sharp(mark)
    .resize(720, 720, { fit: 'contain' })
    .png()
    .toBuffer();

  await sharp({
    create: { width: 1024, height: 1024, channels: 4, background: CREAM },
  })
    .composite([{ input: foreground, gravity: 'centre' }])
    .png()
    .toFile(path.join(assetsRoot, 'icon.png'));

  await sharp({
    create: { width: 1024, height: 1024, channels: 4, background: '#00000000' },
  })
    .composite([{ input: foreground, gravity: 'centre' }])
    .png()
    .toFile(path.join(assetsRoot, 'adaptive-icon.png'));
}

async function renderSplash(mark) {
  const foreground = await sharp(mark)
    .resize(520, 520, { fit: 'contain' })
    .png()
    .toBuffer();

  await sharp({
    create: { width: 1284, height: 2778, channels: 4, background: CREAM },
  })
    .composite([{ input: foreground, top: 950, left: 382 }])
    .png()
    .toFile(path.join(assetsRoot, 'splash.png'));
}

async function renderNotificationMark(mark) {
  const whiteMark = mark
    .toString('utf8')
    .replaceAll('#12844E', '#FFFFFF')
    .replaceAll('#0F1F1B', '#FFFFFF');

  await sharp(Buffer.from(whiteMark))
    .resize(96, 96, { fit: 'contain' })
    .png()
    .toFile(path.join(assetsRoot, 'notification-icon.png'));
}

async function main() {
  const mark = readMark();
  await Promise.all([
    renderSquare(mark),
    renderSplash(mark),
    renderNotificationMark(mark),
  ]);
  process.stdout.write('Generated Grounded Momentum icon, adaptive icon, splash, and notification mark.\n');
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
