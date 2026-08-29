'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const mobileRoot = path.resolve(__dirname, '..', '..');
const uiRoot = path.join(mobileRoot, 'src', 'ui');

function read(relativePath) {
  return fs.readFileSync(path.join(mobileRoot, relativePath), 'utf8');
}

function collectSource(directory) {
  return fs.readdirSync(directory, { withFileTypes: true })
    .filter((entry) => entry.isFile() && /\.tsx?$/.test(entry.name))
    .map((entry) => ({
      name: entry.name,
      source: fs.readFileSync(path.join(directory, entry.name), 'utf8'),
    }));
}

test('Grounded Momentum tokens preserve the approved visual contract', () => {
  const source = read('src/design/tokens.ts');
  const approvedColors = [
    '#12844E',
    '#0D6D40',
    '#0F1F1B',
    '#F7F4EF',
    '#F0A500',
    '#D32F2F',
    '#B42318',
    '#FFFFFF',
    '#D6DED9',
  ];

  for (const color of approvedColors) {
    assert.match(source, new RegExp(color, 'i'), `missing approved colour ${color}`);
  }

  for (const [name, value] of Object.entries({
    xxs: 4,
    xs: 8,
    sm: 12,
    md: 16,
    lg: 20,
    xl: 24,
    xxl: 32,
    xxxl: 40,
    xxxxl: 48,
  })) {
    assert.match(source, new RegExp(`${name}:\\s*${value}\\b`), `missing spacing token ${name}`);
  }

  assert.match(source, /input:\s*12\b/);
  assert.match(source, /card:\s*18\b/);
  assert.match(source, /hero:\s*24\b/);
  assert.match(source, /touchTarget:\s*48\b/);
  assert.match(source, /instant:\s*90\b/);
  assert.match(source, /quick:\s*160\b/);
  assert.match(source, /standard:\s*240\b/);
  assert.match(source, /emphasis:\s*360\b/);
  assert.match(source, /maxTranslation:\s*8\b/);
  assert.match(source, /fontVariant:\s*\['tabular-nums'\]/);
});

test('type roles match the approved size, line height and weight hierarchy', () => {
  const source = read('src/design/tokens.ts');
  const roles = [
    ['display', 32, 38, '800'],
    ['h1', 28, 34, '800'],
    ['h2', 22, 28, '700'],
    ['h3', 18, 24, '700'],
    ['body', 16, 24, '400'],
    ['bodySmall', 14, 20, '400'],
    ['label', 13, 18, '600'],
    ['caption', 12, 16, '500'],
  ];

  for (const [role, size, lineHeight, weight] of roles) {
    assert.match(
      source,
      new RegExp(`${role}:\\s*\\{[^}]*fontSize:\\s*${size}[^}]*lineHeight:\\s*${lineHeight}[^}]*fontWeight:\\s*'${weight}'`),
      `type role ${role} drifted`,
    );
  }
});

test('approved foreground and surface pairings meet WCAG AA contrast', () => {
  function relativeLuminance(hex) {
    const channels = hex.slice(1).match(/.{2}/g).map((channel) => parseInt(channel, 16) / 255);
    const linear = channels.map((channel) => (
      channel <= 0.04045
        ? channel / 12.92
        : ((channel + 0.055) / 1.055) ** 2.4
    ));
    return (0.2126 * linear[0]) + (0.7152 * linear[1]) + (0.0722 * linear[2]);
  }

  function contrast(foreground, background) {
    const lighter = Math.max(relativeLuminance(foreground), relativeLuminance(background));
    const darker = Math.min(relativeLuminance(foreground), relativeLuminance(background));
    return (lighter + 0.05) / (darker + 0.05);
  }

  const bodyPairings = [
    ['#0F1F1B', '#F7F4EF', 'ink on cream'],
    ['#0F1F1B', '#FFFFFF', 'ink on white'],
    ['#4E5C57', '#F7F4EF', 'secondary text on cream'],
    ['#4E5C57', '#FFFFFF', 'secondary text on white'],
    ['#FFFFFF', '#12844E', 'white on emerald'],
    ['#FFFFFF', '#0D6D40', 'white on pressed emerald'],
    ['#0F1F1B', '#F0A500', 'ink on amber'],
    ['#FFFFFF', '#D32F2F', 'white on emergency red'],
    ['#FFFFFF', '#B42318', 'white on error red'],
  ];

  for (const [foreground, background, label] of bodyPairings) {
    assert.ok(contrast(foreground, background) >= 4.5, `${label} must meet 4.5:1`);
  }
});

test('responsive metrics implement compact, standard and large contracts', () => {
  const source = read('src/design/layout.ts');
  assert.match(source, /standard:\s*360\b/);
  assert.match(source, /large:\s*430\b/);
  assert.match(source, /width < breakpoints\.standard/);
  assert.match(source, /width < breakpoints\.large/);
  assert.match(source, /size === 'compact' \? spacing\.md : spacing\.lg/);
  assert.match(source, /supportsPairedCards:\s*size === 'large'/);
});

test('the first-slice component registry is complete and exported', () => {
  const requiredFiles = [
    'AppScaffold.tsx',
    'BrandMark.tsx',
    'Button.tsx',
    'Chip.tsx',
    'DesignGalleryScreen.tsx',
    'Feedback.tsx',
    'SectionHeader.tsx',
    'Surface.tsx',
    'TextField.tsx',
    'TopAppBar.tsx',
  ];
  const index = read('src/ui/index.ts');

  for (const file of requiredFiles) {
    assert.equal(fs.existsSync(path.join(uiRoot, file)), true, `missing ${file}`);
    assert.match(index, new RegExp(`'\\./${path.basename(file, path.extname(file))}'`));
  }

  for (const exportedName of [
    'PrimaryButton',
    'SecondaryButton',
    'TertiaryButton',
    'DangerButton',
    'StatusPill',
    'EmptyState',
    'InlineError',
    'ScreenError',
    'OfflineBanner',
  ]) {
    const uiSource = collectSource(uiRoot).map((file) => file.source).join('\n');
    assert.match(uiSource, new RegExp(`export function ${exportedName}\\b`), `missing ${exportedName}`);
  }
});

test('the in-app wordmark carries the same generated identity used by Android', () => {
  const source = read('src/ui/BrandMark.tsx');
  assert.match(source, /require\('\.\.\/\.\.\/assets\/adaptive-icon\.png'\)/);
  assert.match(source, /accessibilityLabel="TOGT"/);
});

test('new UI consumes semantic tokens and the approved React Native foundations only', () => {
  const sources = collectSource(uiRoot);

  for (const { name, source } of sources) {
    assert.doesNotMatch(source, /#[\da-f]{3,8}\b/i, `${name} contains a raw colour`);
    assert.doesNotMatch(source, /\.\.\/theme(?:['"]|\b)/, `${name} imports the legacy theme`);

    for (const match of source.matchAll(/from\s+['"]([^'"]+)['"]/g)) {
      const dependency = match[1];
      assert.equal(
        dependency === 'react'
          || dependency === 'react-native'
          || dependency === 'react-native-safe-area-context'
          || dependency.startsWith('.'),
        true,
        `${name} imports unsupported dependency ${dependency}`,
      );
    }
  }
});

test('controls and feedback provide accessibility defaults', () => {
  const button = read('src/ui/Button.tsx');
  const chip = read('src/ui/Chip.tsx');
  const field = read('src/ui/TextField.tsx');
  const topBar = read('src/ui/TopAppBar.tsx');
  const feedback = read('src/ui/Feedback.tsx');

  assert.match(button, /accessibilityRole="button"/);
  assert.match(button, /accessibilityState=/);
  assert.match(button, /theme\.sizing\.touchTarget/);
  assert.match(button, /busy:\s*loading/);
  assert.match(button, /borderWidth:\s*focused \? theme\.border\.strong/);
  assert.match(button, /onFocus=\{handleFocus\}/);
  assert.match(chip, /minHeight:\s*onPress \? theme\.sizing\.touchTarget/);
  assert.match(chip, /accessibilityState=\{\{ disabled, selected \}\}/);
  assert.match(chip, /onFocus=\{\(\) => setFocused\(true\)\}/);
  assert.match(chip, /accessibilityLabel=\{`\$\{label\} status`\}/);
  assert.match(field, /accessibilityLabel=\{visibleLabel\}/);
  assert.match(field, /accessibilityState=\{\{ disabled \}\}/);
  assert.match(field, /accessibilityLiveRegion="polite"/);
  assert.match(topBar, /accessibilityLabel=\{action\.accessibilityLabel\}/);
  assert.match(topBar, /minHeight:\s*theme\.sizing\.touchTarget/);
  assert.match(feedback, /accessibilityRole="alert"/);
  assert.match(feedback, /Last updated \{lastUpdatedLabel\}/);
});

test('reduced motion removes translation and caps duration', () => {
  const source = read('src/design/motion.ts');
  assert.match(source, /reduceMotionEnabled \? Math\.min\(duration, motion\.duration\.reduced\) : duration/);
  assert.match(source, /if \(reduceMotionEnabled\) return 0/);
  assert.match(source, /AccessibilityInfo\.isReduceMotionEnabled/);
  assert.match(source, /'reduceMotionChanged'/);
  assert.match(source, /useState\(true\)/);
});
