'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const {
  BASELINE_SIGNER_SHA256,
  createArtifactBaseName,
  normalizeFingerprint,
  parseAaptBadging,
  parseAbiList,
  parseSignerFingerprint,
} = require('../../scripts/android-build.cjs');

test('P0 release identity keeps the recorded package, version code, and ABI', () => {
  const app = require('../../app.json').expo;
  const packageJson = require('../../package.json');
  assert.equal(app.android.package, 'za.togt.app');
  assert.equal(app.version, '1.0.1');
  assert.equal(app.android.versionCode, 2);
  assert.equal(packageJson.scripts.android, 'expo run:android');
  assert.equal(packageJson.scripts.ios, 'expo run:ios');
  assert.deepEqual(parseAbiList(), ['arm64-v8a']);
  assert.equal(
    BASELINE_SIGNER_SHA256,
    'FAC61745DC0903786FB9EDE62A962B399F7348F0BB6F899B8332667591033B9C'
  );
});

test('artifact naming is deterministic across the locked identity inputs', () => {
  const values = {
    abis: ['arm64-v8a'],
    configClass: 'development-lan',
    sourceCommit: '0123456789abcdef0123456789abcdef01234567',
    versionCode: 2,
    versionName: '1.0.1',
  };
  assert.equal(
    createArtifactBaseName(values),
    'TOGT-development-lan-1.0.1-vc2-0123456789ab-arm64-v8a'
  );
  assert.equal(createArtifactBaseName(values), createArtifactBaseName({ ...values }));
});

test('ABI parsing deduplicates supported values and rejects unsupported values', () => {
  assert.deepEqual(parseAbiList('arm64-v8a, x86_64,arm64-v8a'), [
    'arm64-v8a',
    'x86_64',
  ]);
  assert.throws(() => parseAbiList('mips'), /Unsupported Android ABI/);
  assert.throws(() => parseAbiList(','), /at least one ABI/);
});

test('aapt metadata parser records package, version, SDK, and actual ABIs', () => {
  const parsed = parseAaptBadging([
    "package: name='za.togt.app' versionCode='2' versionName='1.0.1' platformBuildVersionName='16' platformBuildVersionCode='36' compileSdkVersion='36' compileSdkVersionCodename='16'",
    "sdkVersion:'24'",
    "targetSdkVersion:'36'",
    "native-code: 'arm64-v8a'",
  ].join('\n'));

  assert.deepEqual(parsed, {
    abis: ['arm64-v8a'],
    compileSdkVersion: '36',
    minSdkVersion: '24',
    packageName: 'za.togt.app',
    targetSdkVersion: '36',
    versionCode: 2,
    versionName: '1.0.1',
  });
});

test('signer parser normalizes apksigner output and rejects missing evidence', () => {
  const output = `Signer #1 certificate SHA-256 digest: ${BASELINE_SIGNER_SHA256.toLowerCase()}`;
  assert.equal(parseSignerFingerprint(output), BASELINE_SIGNER_SHA256);
  assert.equal(
    normalizeFingerprint(BASELINE_SIGNER_SHA256.match(/../g).join(':')),
    BASELINE_SIGNER_SHA256
  );
  assert.throws(() => parseSignerFingerprint('Verified'), /did not report a signer/);
  assert.throws(() => normalizeFingerprint('1234'), /64-character SHA-256/);
});
