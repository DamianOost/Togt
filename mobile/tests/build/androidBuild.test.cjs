'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const {
  BASELINE_SIGNER_SHA1,
  BASELINE_SIGNER_SHA256,
  BLOCKED_ANDROID_PERMISSIONS,
  assertAndroidPermissionBoundary,
  assertAddressPinCandidateProfile,
  assertApkSdkVersions,
  assertGoogleMapsManifestMetadata,
  assertRuntimeAssetMetadata,
  createArtifactBaseName,
  createSafeRuntimeContract,
  fingerprintRuntimeContract,
  normalizeFingerprint,
  normalizeSha1Fingerprint,
  parseAaptBadging,
  parseAaptPermissions,
  parseAbiList,
  parseAndroidCleartextPolicy,
  parseAndroidVersionCatalog,
  parseSignerFingerprint,
  parseSignerFingerprints,
  resolveSigningConfiguration,
} = require('../../scripts/android-build.cjs');

test('address-pin vc4 preflight requires the flagship Google Maps profile', () => {
  const identity = {
    packageName: 'za.togt.app',
    versionCode: 4,
    versionName: '1.2.0',
  };
  const runtime = runtimeAssetFixture({
    featureFlags: {
      ...runtimeAssetFixture().runtime.featureFlags,
      groundedMomentumShell: true,
      customerFlagship: true,
    },
    googleMapsAndroidApiKey: 'synthetic-test-key',
    locationCapabilities: {
      schemaVersion: 1,
      mapsDisplay: true,
      addressSearch: false,
      addressResolution: false,
      addressProvenanceRecording: true,
    },
    mapsProvider: 'google',
  }).runtime;

  assert.doesNotThrow(() => assertAddressPinCandidateProfile(identity, runtime));
  assert.throws(
    () => assertAddressPinCandidateProfile(identity, { ...runtime, mapsProvider: 'disabled' }),
    /requires the packaged Google Maps provider/
  );
  assert.throws(
    () => assertAddressPinCandidateProfile(identity, {
      ...runtime,
      featureFlags: { ...runtime.featureFlags, customerFlagship: false },
    }),
    /requires groundedMomentumShell and customerFlagship/
  );
  assert.throws(
    () => assertAddressPinCandidateProfile(identity, {
      ...runtime,
      locationCapabilities: { ...runtime.locationCapabilities, mapsDisplay: false },
    }),
    /requires the packaged location-capability contract/
  );
  assert.throws(
    () => assertAddressPinCandidateProfile({ ...identity, versionName: '1.1.0' }, runtime),
    /must use versionName 1\.2\.0/
  );
});

test('APK map metadata inspection verifies the packaged key without recording it', () => {
  const key = 'synthetic-android-key';
  const xml = [
    'E: meta-data',
    'A: android:name="com.google.android.geo.API_KEY"',
    `A: android:value="${key}"`,
  ].join('\n');
  assert.equal(assertGoogleMapsManifestMetadata(xml, {
    googleMapsAndroidApiKey: key,
    mapsProvider: 'google',
  }), true);
  assert.throws(
    () => assertGoogleMapsManifestMetadata(xml, {
      googleMapsAndroidApiKey: 'different-key',
      mapsProvider: 'google',
    }),
    /does not contain the configured Android key/
  );
  assert.equal(assertGoogleMapsManifestMetadata('E: manifest', {
    googleMapsAndroidApiKey: null,
    mapsProvider: 'disabled',
    locationCapabilities: {
      schemaVersion: 1,
      mapsDisplay: false,
      addressSearch: false,
      addressResolution: false,
      addressProvenanceRecording: true,
    },
  }), false);
  assert.throws(
    () => assertGoogleMapsManifestMetadata(xml, {
      googleMapsAndroidApiKey: null,
      mapsProvider: 'disabled',
    }),
    /present in a Maps-disabled build/
  );
});

function runtimeAssetFixture(overrides = {}) {
  const runtime = {
    androidCleartextAllowed: true,
    apiBaseUrl: 'http://127.0.0.1:3003',
    appEnvironment: 'development',
    buildProvider: 'local_gradle',
    configClass: 'development-local',
    featureFlags: {
      groundedMomentumShell: true,
      customerFlagship: true,
      workerExperience: true,
      relationships: false,
      aiAssistedIntake: false,
      explainableRecommendations: false,
      livePlatformStatus: false,
      contextualSafetyEducation: false,
      darkTheme: false,
    },
    mapsProvider: 'disabled',
    packageName: 'za.togt.app',
    peachAllowed: false,
    pushProvider: 'disabled',
    scheme: 'togt',
    ...overrides,
  };
  const appConfig = JSON.stringify({
    extra: {
      apiUrl: runtime.apiBaseUrl,
      appEnvironment: runtime.appEnvironment,
      androidCleartextAllowed: runtime.androidCleartextAllowed,
      buildProvider: runtime.buildProvider,
      configClass: runtime.configClass,
      providers: {
        maps: runtime.mapsProvider,
        peach: runtime.peachAllowed,
        push: runtime.pushProvider,
      },
      locationCapabilities: runtime.locationCapabilities,
      featureFlags: {
        schemaVersion: 1,
        flags: runtime.featureFlags,
      },
    },
  });
  return { appConfig, runtime };
}

test('Grounded Momentum release identity keeps the package and advances beyond P0 v2', () => {
  const app = require('../../app.json').expo;
  const packageJson = require('../../package.json');
  assert.equal(app.android.package, 'za.togt.app');
  assert.equal(app.version, '1.2.0');
  assert.equal(packageJson.version, app.version);
  assert.equal(app.android.versionCode, 4);
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
    runtimeConfigSha256: 'A'.repeat(64),
    versionCode: 4,
    versionName: '1.2.0',
  };
  assert.equal(
    createArtifactBaseName(values),
    'TOGT-development-lan-1.2.0-vc4-0123456789ab-rtaaaaaaaaaaaa-arm64-v8a'
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
    "package: name='za.togt.app' versionCode='4' versionName='1.2.0' platformBuildVersionName='16' platformBuildVersionCode='36' compileSdkVersion='36' compileSdkVersionCodename='16'",
    "sdkVersion:'24'",
    "targetSdkVersion:'36'",
    "native-code: 'arm64-v8a'",
  ].join('\n'));

  assert.deepEqual(parsed, {
    abis: ['arm64-v8a'],
    minSdkVersion: '24',
    packageName: 'za.togt.app',
    targetSdkVersion: '36',
    versionCode: 4,
    versionName: '1.2.0',
  });
  assert.doesNotThrow(() => assertApkSdkVersions(parsed));
  assert.throws(
    () => assertApkSdkVersions({ ...parsed, minSdkVersion: '23' }),
    /APK minSdk mismatch: expected 24; found 23/
  );
  assert.throws(
    () => assertApkSdkVersions({ ...parsed, targetSdkVersion: '35' }),
    /APK targetSdk mismatch: expected 36; found 35/
  );
});

test('generated Android version evidence is parsed independently from APK badging', () => {
  assert.deepEqual(
    parseAndroidVersionCatalog([
      'minSdk = "24"',
      'targetSdk = "36"',
      'compileSdk = "36"',
      'buildTools = "36.0.0"',
    ].join('\n')),
    {
      buildToolsVersion: '36.0.0',
      compileSdkVersion: '36',
      minSdkVersion: '24',
      targetSdkVersion: '36',
    }
  );
  assert.throws(() => parseAndroidVersionCatalog('minSdk = "24"'), /missing buildTools/);
});

test('APK permission evidence excludes camera, audio, overlay, and legacy storage claims', () => {
  const permissions = parseAaptPermissions([
    "uses-permission: name='android.permission.INTERNET'",
    "uses-permission: name='android.permission.POST_NOTIFICATIONS'",
    "uses-permission-sdk-23: name='android.permission.ACCESS_FINE_LOCATION'",
  ].join('\n'));
  assert.deepEqual(permissions, [
    'android.permission.ACCESS_FINE_LOCATION',
    'android.permission.INTERNET',
    'android.permission.POST_NOTIFICATIONS',
  ]);
  assert.doesNotThrow(() => assertAndroidPermissionBoundary(permissions));
  for (const blocked of BLOCKED_ANDROID_PERMISSIONS) {
    assert.throws(
      () => assertAndroidPermissionBoundary([...permissions, blocked]),
      new RegExp(blocked.replaceAll('.', '\\.'))
    );
  }
});

test('signer parser normalizes apksigner output and rejects missing evidence', () => {
  const output = [
    `Signer #1 certificate SHA-1 digest: ${BASELINE_SIGNER_SHA1.toLowerCase()}`,
    `Signer #1 certificate SHA-256 digest: ${BASELINE_SIGNER_SHA256.toLowerCase()}`,
  ].join('\n');
  assert.equal(parseSignerFingerprint(output), BASELINE_SIGNER_SHA256);
  assert.deepEqual(parseSignerFingerprints(output), {
    sha1: BASELINE_SIGNER_SHA1,
    sha256: BASELINE_SIGNER_SHA256,
  });
  assert.equal(
    normalizeFingerprint(BASELINE_SIGNER_SHA256.match(/../g).join(':')),
    BASELINE_SIGNER_SHA256
  );
  assert.equal(
    normalizeSha1Fingerprint(BASELINE_SIGNER_SHA1.match(/../g).join(':')),
    BASELINE_SIGNER_SHA1
  );
  assert.throws(() => parseSignerFingerprint('Verified'), /did not report a signer/);
  assert.throws(
    () => parseSignerFingerprints(`Signer #1 certificate SHA-256 digest: ${BASELINE_SIGNER_SHA256}`),
    /did not report a signer SHA-1/
  );
  assert.throws(() => normalizeFingerprint('1234'), /64-character SHA-256/);
  assert.throws(() => normalizeSha1Fingerprint('1234'), /40-character SHA-1/);
});

test('the internal signer baseline cannot be redefined by an environment override', () => {
  assert.throws(
    () => resolveSigningConfiguration({
      TOGT_ANDROID_EXPECTED_SIGNER_SHA256: 'A'.repeat(64),
      TOGT_ANDROID_SIGNING_MODE: 'generated-debug',
    }, { appEnvironment: 'development' }),
    /cannot redefine the internal signer baseline/
  );
  const resolved = resolveSigningConfiguration({
    TOGT_ANDROID_EXPECTED_SIGNER_SHA256: BASELINE_SIGNER_SHA256.match(/../g).join(':'),
    TOGT_ANDROID_SIGNING_MODE: 'generated-debug',
  }, { appEnvironment: 'development' });
  assert.equal(resolved.expectedSignerSha1, BASELINE_SIGNER_SHA1);
  assert.equal(resolved.expectedSignerSha256, BASELINE_SIGNER_SHA256);
});

test('prebuild cleartext parser requires an explicit application policy', () => {
  const manifest = (value) =>
    `<manifest>\n  <application\n    android:name=".MainApplication"\n` +
    `    android:usesCleartextTraffic="${value}">\n  </application>\n</manifest>`;

  assert.equal(parseAndroidCleartextPolicy(manifest('true')), true);
  assert.equal(parseAndroidCleartextPolicy(manifest('false')), false);
  assert.throws(
    () => parseAndroidCleartextPolicy('<manifest><application></application></manifest>'),
    /must explicitly set android:usesCleartextTraffic/
  );
  assert.throws(
    () => parseAndroidCleartextPolicy('<manifest></manifest>'),
    /missing its application element/
  );
});

test('runtime asset guard accepts matching metadata and the expected bundled origin', () => {
  const { appConfig, runtime } = runtimeAssetFixture();
  assert.doesNotThrow(() =>
    assertRuntimeAssetMetadata(
      appConfig,
      'const endpoint = "http://127.0.0.1:3003";',
      runtime
    )
  );
});

test('runtime asset guard rejects stale bundled API origins', () => {
  const { appConfig, runtime } = runtimeAssetFixture();
  assert.throws(
    () => assertRuntimeAssetMetadata(
      appConfig,
      'const endpoint = "http://192.168.10.126:3003";',
      runtime
    ),
    /stale or unreviewed runtime origin.*192\.168\.10\.126:3003.*127\.0\.0\.1:3003/
  );
});

test('runtime asset guard rejects stale HTTPS API origins without explicit ports', () => {
  const { appConfig, runtime } = runtimeAssetFixture({
    androidCleartextAllowed: false,
    apiBaseUrl: 'https://api.example.test',
    appEnvironment: 'preview',
    configClass: 'preview',
  });
  assert.throws(
    () => assertRuntimeAssetMetadata(
      appConfig,
      'const endpoint = "https://preview.example.test";',
      runtime
    ),
    /stale or unreviewed runtime origin.*preview\.example\.test.*api\.example\.test/
  );
  assert.doesNotThrow(() => assertRuntimeAssetMetadata(
    appConfig,
    'const docs = "https://docs.expo.dev"; const endpoint = "https://api.example.test";',
    runtime
  ));
});

test('runtime configuration fingerprint binds endpoint, providers, and feature flags', () => {
  const { runtime } = runtimeAssetFixture({
    androidCleartextAllowed: false,
    apiBaseUrl: 'https://api.example.test',
    appEnvironment: 'preview',
    configClass: 'preview',
  });
  const baseline = fingerprintRuntimeContract(createSafeRuntimeContract(runtime));
  const changedEndpoint = fingerprintRuntimeContract(createSafeRuntimeContract({
    ...runtime,
    apiBaseUrl: 'https://api-two.example.test',
  }));
  const changedProvider = fingerprintRuntimeContract(createSafeRuntimeContract({
    ...runtime,
    mapsProvider: 'google',
  }));
  const changedFlag = fingerprintRuntimeContract(createSafeRuntimeContract({
    ...runtime,
    featureFlags: { ...runtime.featureFlags, relationships: true },
  }));
  const changedLocationCapability = fingerprintRuntimeContract(createSafeRuntimeContract({
    ...runtime,
    locationCapabilities: { ...runtime.locationCapabilities, mapsDisplay: true },
  }));
  const changedMapsKey = fingerprintRuntimeContract(createSafeRuntimeContract({
    ...runtime,
    googleMapsAndroidApiKey: 'rotated-synthetic-key',
    mapsProvider: 'google',
  }));
  assert.match(baseline, /^[A-F0-9]{64}$/);
  assert.notEqual(changedEndpoint, baseline);
  assert.notEqual(changedProvider, baseline);
  assert.notEqual(changedFlag, baseline);
  assert.notEqual(changedLocationCapability, baseline);
  assert.notEqual(changedMapsKey, baseline);
});

test('release keystores inside the repository are rejected before signing', () => {
  assert.throws(
    () => resolveSigningConfiguration(
      {
        TOGT_ANDROID_SIGNING_MODE: 'keystore',
        TOGT_ANDROID_KEYSTORE_PATH: __filename,
      },
      { appEnvironment: 'preview' }
    ),
    /outside the repository tree/
  );
});

test('repository ignores secret-bearing Android inputs while keeping examples trackable', () => {
  const ignore = fs.readFileSync(path.resolve(__dirname, '..', '..', '..', '.gitignore'), 'utf8');
  for (const pattern of [
    '.env.*',
    '*.jks',
    '*.keystore',
    'key.properties',
    'keystore.properties',
    'signing.properties',
    'google-services.json',
    'GoogleService-Info.plist',
  ]) {
    assert.match(ignore, new RegExp(`^${pattern.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, 'm'));
  }
  for (const exception of [
    '!.env.example',
    '!google-services.example.json',
    '!GoogleService-Info.example.plist',
  ]) {
    assert.match(ignore, new RegExp(`^${exception.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, 'm'));
  }
});

test('runtime asset guard rejects mismatched generated app configuration', () => {
  const { appConfig, runtime } = runtimeAssetFixture({
    apiBaseUrl: 'http://192.168.10.20:3003',
    configClass: 'development-lan',
  });
  assert.throws(
    () => assertRuntimeAssetMetadata(appConfig, 'bundle', {
      ...runtime,
      apiBaseUrl: 'http://127.0.0.1:3003',
      configClass: 'development-local',
    }),
    /Generated app\.config API URL mismatch/
  );
});

test('runtime asset guard rejects a stale packaged feature path', () => {
  const { appConfig, runtime } = runtimeAssetFixture();
  const stale = JSON.parse(appConfig);
  stale.extra.featureFlags.flags.aiAssistedIntake = true;

  assert.throws(
    () => assertRuntimeAssetMetadata(JSON.stringify(stale), 'bundle', runtime),
    /feature flag aiAssistedIntake mismatch/
  );
});

test('candidate APKs remain quarantined until every artifact inspection passes', () => {
  const source = fs.readFileSync(
    path.resolve(__dirname, '..', '..', 'scripts', 'android-build.cjs'),
    'utf8'
  );
  const buildStart = source.indexOf('function buildApk(');
  assert.notEqual(buildStart, -1);
  const buildSource = source.slice(buildStart, source.indexOf('\nfunction main(', buildStart));
  const quarantineIndex = buildSource.indexOf('fs.mkdtempSync(');
  const signatureInspectionIndex = buildSource.indexOf('parseSignerFingerprints(signerOutput)');
  const metadataInspectionIndex = buildSource.indexOf('assertGoogleMapsManifestMetadata(');
  const publishIndex = buildSource.indexOf('fs.copyFileSync(inspectedApk, artifactPath');
  const cleanupIndex = buildSource.indexOf('removeGeneratedDirectory(quarantineRoot, outputRoot)');

  assert.ok(quarantineIndex >= 0, 'build must create an isolated candidate directory');
  assert.ok(signatureInspectionIndex > quarantineIndex, 'signature inspection must use the quarantined APK');
  assert.ok(metadataInspectionIndex > signatureInspectionIndex, 'manifest inspection must follow signature verification');
  assert.ok(publishIndex > metadataInspectionIndex, 'publication must happen only after inspections pass');
  assert.ok(cleanupIndex > publishIndex, 'candidate quarantine must be cleaned after publication or failure');
  assert.match(buildSource, /COPYFILE_EXCL/);
  assert.match(buildSource, /finally\s*{\s*removeGeneratedDirectory\(quarantineRoot, outputRoot\)/);
});
