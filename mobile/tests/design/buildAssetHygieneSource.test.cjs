'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const mobileRoot = path.resolve(__dirname, '..', '..');
const sourceExtensions = new Set(['.js', '.jsx', '.ts', '.tsx']);

function collectSourceFiles(directory) {
  return fs.readdirSync(directory, { withFileTypes: true })
    .sort((left, right) => left.name.localeCompare(right.name))
    .flatMap((entry) => {
      const entryPath = path.join(directory, entry.name);
      if (entry.isDirectory()) return collectSourceFiles(entryPath);
      return entry.isFile() && sourceExtensions.has(path.extname(entry.name))
        ? [entryPath]
        : [];
    });
}

test('font imports stay family and weight specific so Android does not bundle unused TTFs', () => {
  const sourceFiles = [path.join(mobileRoot, 'App.js'), ...collectSourceFiles(path.join(mobileRoot, 'src'))];
  const joined = sourceFiles
    .map((filePath) => fs.readFileSync(filePath, 'utf8'))
    .join('\n');

  assert.doesNotMatch(joined, /from\s+['"]@expo\/vector-icons['"]/);
  assert.doesNotMatch(joined, /from\s+['"]@expo-google-fonts\/(?:inter|manrope)['"]/);

  const iconImports = [...joined.matchAll(/from\s+['"](@expo\/vector-icons\/[^'"]+)['"]/g)]
    .map((match) => match[1]);
  assert.ok(iconImports.length > 0, 'expected Material Community icon imports');
  assert.deepEqual([...new Set(iconImports)], ['@expo/vector-icons/MaterialCommunityIcons']);

  const appSource = fs.readFileSync(path.join(mobileRoot, 'App.js'), 'utf8');
  const fontImports = [...appSource.matchAll(/from\s+['"](@expo-google-fonts\/[^'"]+)['"]/g)]
    .map((match) => match[1]);
  assert.deepEqual(fontImports.sort(), [
    '@expo-google-fonts/inter/400Regular',
    '@expo-google-fonts/inter/500Medium',
    '@expo-google-fonts/inter/600SemiBold',
    '@expo-google-fonts/inter/700Bold',
    '@expo-google-fonts/manrope/700Bold',
    '@expo-google-fonts/manrope/800ExtraBold',
  ]);
});
