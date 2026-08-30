'use strict';

const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const { resolveBuildConfiguration } = require('../src/config/buildConfig.cjs');

const mobileRoot = path.resolve(__dirname, '..');
const appJson = require('../app.json');

const BASELINE_SIGNER_SHA256 =
  'FAC61745DC0903786FB9EDE62A962B399F7348F0BB6F899B8332667591033B9C';
const BASELINE_SIGNER_SHA1 = '5E8F16062EA3CD2C4A0D547876BAA6F38CABF625';
const DEFAULT_ABIS = ['arm64-v8a'];
const SUPPORTED_ABIS = new Set(['arm64-v8a', 'armeabi-v7a', 'x86', 'x86_64']);
const SIGNING_MODES = new Set(['generated-debug', 'keystore']);
const REQUIRED_ANDROID_PLATFORM = 'android-36';
const REQUIRED_BUILD_TOOLS_VERSION = '36.0.0';
const REQUIRED_NDK_VERSION = '27.1.12297006';
const REQUIRED_MIN_SDK_VERSION = '24';
const REQUIRED_TARGET_SDK_VERSION = '36';
const REQUIRED_COMPILE_SDK_VERSION = '36';
const BLOCKED_ANDROID_PERMISSIONS = Object.freeze([
  'android.permission.ACCESS_BACKGROUND_LOCATION',
  'android.permission.CAMERA',
  'android.permission.READ_EXTERNAL_STORAGE',
  'android.permission.RECORD_AUDIO',
  'android.permission.SYSTEM_ALERT_WINDOW',
  'android.permission.WRITE_EXTERNAL_STORAGE',
]);
const REVIEWED_NON_API_ORIGINS = new Set([
  'http://localhost',
  'https://bit.ly',
  'https://classic-assets.eascdn.net',
  'https://clients3.google.com',
  'https://docs.expo.dev',
  'https://expo.fyi',
  'https://fonts.gstatic.com',
  'https://github.com',
  'https://react.dev',
  'https://reactnative.dev',
  'https://reactnavigation.org',
  'https://redux-toolkit.js.org',
  'https://redux.js.org',
  'https://socket.io',
]);

function normalizeFingerprint(value, name = 'fingerprint') {
  const normalized = typeof value === 'string'
    ? value.replace(/[^a-fA-F0-9]/g, '').toUpperCase()
    : '';
  if (!/^[A-F0-9]{64}$/.test(normalized)) {
    throw new Error(`${name} must be a 64-character SHA-256 fingerprint.`);
  }
  return normalized;
}

function parseAbiList(value) {
  const abis = (value ? value.split(',') : DEFAULT_ABIS)
    .map((abi) => abi.trim())
    .filter(Boolean);
  const unique = [...new Set(abis)];
  if (unique.length === 0) throw new Error('TOGT_ANDROID_ABIS must contain at least one ABI.');
  const unsupported = unique.filter((abi) => !SUPPORTED_ABIS.has(abi));
  if (unsupported.length > 0) {
    throw new Error(`Unsupported Android ABI: ${unsupported.join(', ')}.`);
  }
  return unique;
}

function sanitizeArtifactPart(value) {
  const sanitized = String(value)
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, '-')
    .replace(/^-+|-+$/g, '');
  if (!sanitized) throw new Error('Artifact identity contains an empty component.');
  return sanitized;
}

function createArtifactBaseName({
  configClass,
  versionName,
  versionCode,
  sourceCommit,
  abis,
  runtimeConfigSha256,
}) {
  const abiLabel = abis.map(sanitizeArtifactPart).join('+');
  const runtimeLabel = normalizeFingerprint(
    runtimeConfigSha256,
    'runtime configuration SHA-256'
  ).slice(0, 12);
  return [
    'TOGT',
    sanitizeArtifactPart(configClass),
    sanitizeArtifactPart(versionName),
    `vc${versionCode}`,
    sanitizeArtifactPart(sourceCommit.slice(0, 12)),
    `rt${sanitizeArtifactPart(runtimeLabel)}`,
    abiLabel,
  ].join('-');
}

function normalizeSha1Fingerprint(value, name = 'fingerprint') {
  const normalized = typeof value === 'string'
    ? value.replace(/[^a-fA-F0-9]/g, '').toUpperCase()
    : '';
  if (!/^[A-F0-9]{40}$/.test(normalized)) {
    throw new Error(`${name} must be a 40-character SHA-1 fingerprint.`);
  }
  return normalized;
}

function stableJson(value) {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(',')}]`;
  if (value && typeof value === 'object') {
    return `{${Object.keys(value).sort().map((key) =>
      `${JSON.stringify(key)}:${stableJson(value[key])}`
    ).join(',')}}`;
  }
  return JSON.stringify(value);
}

function createSafeRuntimeContract(runtime) {
  const mapsAndroidKeySha256 = runtime.mapsProvider === 'google'
    && typeof runtime.googleMapsAndroidApiKey === 'string'
    && runtime.googleMapsAndroidApiKey
    ? crypto.createHash('sha256').update(runtime.googleMapsAndroidApiKey).digest('hex').toUpperCase()
    : null;
  return Object.freeze({
    schemaVersion: 1,
    apiOrigin: new URL(runtime.apiBaseUrl).origin,
    appEnvironment: runtime.appEnvironment,
    androidCleartextAllowed: runtime.androidCleartextAllowed,
    buildProvider: runtime.buildProvider,
    configClass: runtime.configClass,
    packageName: runtime.packageName,
    scheme: runtime.scheme,
    providers: Object.freeze({
      maps: runtime.mapsProvider,
      mapsAndroidKeySha256,
      peach: runtime.peachAllowed,
      push: runtime.pushProvider,
    }),
    locationCapabilities: Object.freeze({ ...runtime.locationCapabilities }),
    featureFlags: Object.freeze({
      schemaVersion: 1,
      flags: Object.freeze({ ...runtime.featureFlags }),
    }),
  });
}

function fingerprintRuntimeContract(contract) {
  return crypto.createHash('sha256').update(stableJson(contract)).digest('hex').toUpperCase();
}

function parseAaptBadging(output) {
  const packageMatch = output.match(
    /^package: name='([^']+)' versionCode='([^']+)' versionName='([^']+)'/m
  );
  if (!packageMatch) throw new Error('aapt did not report package/version metadata.');

  const sdkMatch = output.match(/^sdkVersion:'([^']+)'/m);
  const targetSdkMatch = output.match(/^targetSdkVersion:'([^']+)'/m);
  const nativeCodeMatch = output.match(/^native-code:(.*)$/m);
  const abis = nativeCodeMatch
    ? [...nativeCodeMatch[1].matchAll(/'([^']+)'/g)].map((match) => match[1])
    : [];

  return {
    abis,
    packageName: packageMatch[1],
    targetSdkVersion: targetSdkMatch?.[1] || null,
    minSdkVersion: sdkMatch?.[1] || null,
    versionCode: Number(packageMatch[2]),
    versionName: packageMatch[3],
  };
}

function parseAaptPermissions(output) {
  return [...new Set(
    [...String(output).matchAll(/uses-permission(?:-sdk-\d+)?:\s+name='([^']+)'/g)]
      .map((match) => match[1])
  )].sort();
}

function assertAndroidPermissionBoundary(permissions) {
  const forbidden = BLOCKED_ANDROID_PERMISSIONS.filter((permission) =>
    permissions.includes(permission)
  );
  if (forbidden.length > 0) {
    throw new Error(`APK contains blocked Android permissions: ${forbidden.join(', ')}.`);
  }
}

function assertApkSdkVersions(badging) {
  if (badging.minSdkVersion !== REQUIRED_MIN_SDK_VERSION) {
    throw new Error(
      `APK minSdk mismatch: expected ${REQUIRED_MIN_SDK_VERSION}; ` +
      `found ${badging.minSdkVersion || 'missing'}.`
    );
  }
  if (badging.targetSdkVersion !== REQUIRED_TARGET_SDK_VERSION) {
    throw new Error(
      `APK targetSdk mismatch: expected ${REQUIRED_TARGET_SDK_VERSION}; ` +
      `found ${badging.targetSdkVersion || 'missing'}.`
    );
  }
}

function parseSignerFingerprint(output) {
  const match = output.match(/Signer #1 certificate SHA-256 digest:\s*([a-fA-F0-9:]+)/i);
  if (!match) throw new Error('apksigner did not report a signer SHA-256 digest.');
  return normalizeFingerprint(match[1], 'APK signer fingerprint');
}

function parseAndroidCleartextPolicy(manifestXml) {
  if (typeof manifestXml !== 'string' || !manifestXml.trim()) {
    throw new Error('Generated AndroidManifest.xml is empty.');
  }

  const applicationTag = manifestXml.match(/<application\b[^>]*>/i)?.[0];
  if (!applicationTag) {
    throw new Error('Generated AndroidManifest.xml is missing its application element.');
  }

  const cleartextMatch = applicationTag.match(
    /android:usesCleartextTraffic=(["'])(true|false)\1/i
  );
  if (!cleartextMatch) {
    throw new Error(
      'Generated AndroidManifest.xml must explicitly set android:usesCleartextTraffic.'
    );
  }
  return cleartextMatch[2].toLowerCase() === 'true';
}

function assertAndroidCleartextPolicy(context) {
  const manifestPath = requireFile(
    path.join(mobileRoot, 'android', 'app', 'src', 'main', 'AndroidManifest.xml'),
    'Expo prebuild did not create the main AndroidManifest.xml.'
  );
  const actual = parseAndroidCleartextPolicy(fs.readFileSync(manifestPath, 'utf8'));
  const expected = context.runtime.androidCleartextAllowed;
  if (actual !== expected) {
    throw new Error(
      `Android cleartext policy mismatch for ${context.runtime.configClass}: ` +
      `expected ${expected}; found ${actual}.`
    );
  }
}

function isPathInside(parent, candidate) {
  const relative = path.relative(path.resolve(parent), path.resolve(candidate));
  return relative !== '' && !relative.startsWith(`..${path.sep}`) && relative !== '..' && !path.isAbsolute(relative);
}

function parseSignerFingerprints(output) {
  const sha1Match = output.match(/Signer #1 certificate SHA-1 digest:\s*([a-fA-F0-9:]+)/i);
  if (!sha1Match) throw new Error('apksigner did not report a signer SHA-1 digest.');
  return Object.freeze({
    sha1: normalizeSha1Fingerprint(sha1Match[1], 'APK signer SHA-1 fingerprint'),
    sha256: parseSignerFingerprint(output),
  });
}

function isPathAtOrInside(parent, candidate) {
  const relative = path.relative(path.resolve(parent), path.resolve(candidate));
  return relative === '' || (
    !relative.startsWith(`..${path.sep}`) &&
    relative !== '..' &&
    !path.isAbsolute(relative)
  );
}

function removeGeneratedFile(filePath, outputRoot) {
  if (!isPathInside(outputRoot, filePath)) {
    throw new Error(`Refusing to replace a file outside ${outputRoot}.`);
  }
  fs.rmSync(filePath, { force: true });
}

function run(command, args, options = {}) {
  const capture = options.capture === true;
  const result = spawnSync(command, args, {
    cwd: options.cwd || mobileRoot,
    encoding: capture ? 'utf8' : undefined,
    env: options.env || process.env,
    shell: options.shell === true,
    stdio: capture ? 'pipe' : 'inherit',
  });

  if (result.error) throw result.error;
  if (result.status !== 0) {
    let detail = capture
      ? `${result.stdout || ''}${result.stderr || ''}`.trim()
      : '';
    for (const secret of options.sensitiveValues || []) {
      if (typeof secret === 'string' && secret) detail = detail.split(secret).join('[REDACTED]');
    }
    throw new Error(
      `${path.basename(command)} exited with status ${result.status}${detail ? `:\n${detail}` : '.'}`
    );
  }

  return capture ? `${result.stdout || ''}${result.stderr || ''}` : '';
}

function executable(directory, baseName) {
  const suffix = process.platform === 'win32' ? '.exe' : '';
  return path.join(directory, `${baseName}${suffix}`);
}

function batchExecutable(directory, baseName) {
  const suffix = process.platform === 'win32' ? '.bat' : '';
  return path.join(directory, `${baseName}${suffix}`);
}

function requireFile(filePath, message) {
  if (!fs.existsSync(filePath) || !fs.statSync(filePath).isFile()) {
    throw new Error(message || `Required file is missing: ${filePath}`);
  }
  return filePath;
}

function requireDirectory(directoryPath, message) {
  if (!fs.existsSync(directoryPath) || !fs.statSync(directoryPath).isDirectory()) {
    throw new Error(message || `Required directory is missing: ${directoryPath}`);
  }
  return directoryPath;
}

function removeGeneratedDirectory(directoryPath, outputRoot) {
  if (!isPathInside(outputRoot, directoryPath)) {
    throw new Error(`Refusing to remove a directory outside ${outputRoot}.`);
  }
  fs.rmSync(directoryPath, { force: true, recursive: true });
}

function parseAndroidVersionCatalog(source) {
  const readVersion = (name) => {
    const match = String(source).match(new RegExp(`^${name}\\s*=\\s*["']([^"']+)["']`, 'm'));
    if (!match) throw new Error(`React Native Android version catalog is missing ${name}.`);
    return match[1];
  };
  return Object.freeze({
    buildToolsVersion: readVersion('buildTools'),
    compileSdkVersion: readVersion('compileSdk'),
    minSdkVersion: readVersion('minSdk'),
    targetSdkVersion: readVersion('targetSdk'),
  });
}

function resolveGeneratedAndroidSdkEvidence(toolchain) {
  const relativeCatalogPath = path.join(
    'node_modules',
    'react-native',
    'gradle',
    'libs.versions.toml'
  );
  const catalogPath = requireFile(
    path.join(mobileRoot, relativeCatalogPath),
    'React Native Android version catalog is missing. Run npm ci from mobile.'
  );
  const versions = parseAndroidVersionCatalog(fs.readFileSync(catalogPath, 'utf8'));
  const expected = {
    buildToolsVersion: REQUIRED_BUILD_TOOLS_VERSION,
    compileSdkVersion: REQUIRED_COMPILE_SDK_VERSION,
    minSdkVersion: REQUIRED_MIN_SDK_VERSION,
    targetSdkVersion: REQUIRED_TARGET_SDK_VERSION,
  };
  for (const [name, expectedValue] of Object.entries(expected)) {
    if (versions[name] !== expectedValue) {
      throw new Error(
        `Generated Android ${name} mismatch: expected ${expectedValue}; found ${versions[name]}.`
      );
    }
  }
  if (toolchain.buildToolsVersion !== versions.buildToolsVersion) {
    throw new Error(
      `Android build-tools mismatch: generated configuration requires ` +
      `${versions.buildToolsVersion}; toolchain resolved ${toolchain.buildToolsVersion}.`
    );
  }
  return Object.freeze({
    ...versions,
    androidPlatform: REQUIRED_ANDROID_PLATFORM,
    source: relativeCatalogPath.replaceAll(path.sep, '/'),
  });
}

function resolveToolchain(environment) {
  const javaHomeValue = environment.JAVA_HOME?.trim();
  if (!javaHomeValue) throw new Error('JAVA_HOME must point to a JDK 17 installation.');
  const javaHome = path.resolve(javaHomeValue);
  const java = requireFile(
    executable(path.join(javaHome, 'bin'), 'java'),
    'JAVA_HOME does not contain bin/java.'
  );
  const javaOutput = run(java, ['-version'], { capture: true, env: environment });
  const javaVersion = javaOutput.match(/version "(\d+)(?:\.[^"]*)?"/i)?.[1];
  if (javaVersion !== '17') {
    throw new Error(`Local Android builds require JDK 17; detected ${javaVersion || 'unknown'}.`);
  }

  const androidHome = environment.ANDROID_HOME?.trim();
  const androidSdkRoot = environment.ANDROID_SDK_ROOT?.trim();
  if (androidHome && androidSdkRoot && path.resolve(androidHome) !== path.resolve(androidSdkRoot)) {
    throw new Error('ANDROID_HOME and ANDROID_SDK_ROOT must resolve to the same Android SDK.');
  }
  const sdkValue = androidSdkRoot || androidHome;
  if (!sdkValue) {
    throw new Error('ANDROID_SDK_ROOT (or ANDROID_HOME) must point to the Android SDK.');
  }
  const sdkRoot = requireDirectory(path.resolve(sdkValue));
  requireDirectory(
    path.join(sdkRoot, 'platforms', REQUIRED_ANDROID_PLATFORM),
    `Android SDK platform ${REQUIRED_ANDROID_PLATFORM} is required.`
  );
  requireDirectory(
    path.join(sdkRoot, 'ndk', REQUIRED_NDK_VERSION),
    `Android NDK ${REQUIRED_NDK_VERSION} is required.`
  );

  const buildTools = requireDirectory(
    path.join(sdkRoot, 'build-tools', REQUIRED_BUILD_TOOLS_VERSION),
    `Android build-tools ${REQUIRED_BUILD_TOOLS_VERSION} are required.`
  );

  return {
    aapt: requireFile(executable(buildTools, 'aapt')),
    apksigner: requireFile(batchExecutable(buildTools, 'apksigner')),
    buildToolsVersion: REQUIRED_BUILD_TOOLS_VERSION,
    androidPlatform: REQUIRED_ANDROID_PLATFORM,
    java,
    javaHome,
    sdkRoot,
    zipalign: requireFile(executable(buildTools, 'zipalign')),
  };
}

function resolveSigningConfiguration(environment, runtime, { requireGeneratedKey = false } = {}) {
  const mode = environment.TOGT_ANDROID_SIGNING_MODE?.trim().toLowerCase() || 'generated-debug';
  if (!SIGNING_MODES.has(mode)) {
    throw new Error('TOGT_ANDROID_SIGNING_MODE must be generated-debug or keystore.');
  }

  const expectedSignerSha256 = normalizeFingerprint(
    environment.TOGT_ANDROID_EXPECTED_SIGNER_SHA256 || BASELINE_SIGNER_SHA256,
    'TOGT_ANDROID_EXPECTED_SIGNER_SHA256'
  );
  if (expectedSignerSha256 !== BASELINE_SIGNER_SHA256) {
    throw new Error(
      'TOGT_ANDROID_EXPECTED_SIGNER_SHA256 cannot redefine the internal signer baseline. ' +
      'A different signer requires an explicitly separate clean-install track.'
    );
  }

  if (mode === 'generated-debug') {
    if (runtime.appEnvironment !== 'development') {
      throw new Error('generated-debug signing is limited to labelled development builds.');
    }
    const keystorePath = path.join(mobileRoot, 'android', 'app', 'debug.keystore');
    if (requireGeneratedKey) {
      requireFile(
        keystorePath,
        'Expo prebuild did not create android/app/debug.keystore for the internal build.'
      );
    }
    return {
      alias: 'androiddebugkey',
      expectedSignerSha1: BASELINE_SIGNER_SHA1,
      expectedSignerSha256,
      keyPasswordEnvironmentName: 'TOGT_INTERNAL_DEBUG_KEY_PASSWORD',
      keystorePath,
      mode,
      storePasswordEnvironmentName: 'TOGT_INTERNAL_DEBUG_STORE_PASSWORD',
    };
  }

  const keystoreValue = environment.TOGT_ANDROID_KEYSTORE_PATH?.trim();
  if (!keystoreValue) {
    throw new Error('TOGT_ANDROID_KEYSTORE_PATH is required for keystore signing.');
  }
  const requestedKeystorePath = path.resolve(keystoreValue);
  const repositoryRoot = path.resolve(mobileRoot, '..');
  if (isPathAtOrInside(repositoryRoot, requestedKeystorePath)) {
    throw new Error('TOGT_ANDROID_KEYSTORE_PATH must be outside the repository tree.');
  }
  const keystorePath = requireFile(
    requestedKeystorePath,
    'TOGT_ANDROID_KEYSTORE_PATH must point to a readable keystore outside the repository.'
  );
  const realRepositoryRoot = fs.realpathSync(repositoryRoot);
  const realKeystorePath = fs.realpathSync(keystorePath);
  if (isPathAtOrInside(realRepositoryRoot, realKeystorePath)) {
    throw new Error(
      'TOGT_ANDROID_KEYSTORE_PATH resolves inside the repository tree and is not allowed.'
    );
  }
  const alias = environment.TOGT_ANDROID_KEY_ALIAS?.trim();
  if (!alias) throw new Error('TOGT_ANDROID_KEY_ALIAS is required for keystore signing.');
  if (!environment.TOGT_ANDROID_KEYSTORE_PASSWORD) {
    throw new Error('TOGT_ANDROID_KEYSTORE_PASSWORD is required for keystore signing.');
  }
  if (!environment.TOGT_ANDROID_KEY_PASSWORD) {
    throw new Error('TOGT_ANDROID_KEY_PASSWORD is required for keystore signing.');
  }

  return {
    alias,
    expectedSignerSha1: BASELINE_SIGNER_SHA1,
    expectedSignerSha256,
    keyPasswordEnvironmentName: 'TOGT_ANDROID_KEY_PASSWORD',
    keystorePath,
    mode,
    storePasswordEnvironmentName: 'TOGT_ANDROID_KEYSTORE_PASSWORD',
  };
}

function buildEnvironment(environment = process.env) {
  return {
    ...environment,
    ANDROID_BUILD_PROVIDER: environment.ANDROID_BUILD_PROVIDER || 'local_gradle',
    CI: environment.CI || '1',
    EXPO_PUBLIC_APP_ENV: environment.EXPO_PUBLIC_APP_ENV || 'development',
    EXPO_PUBLIC_ENABLE_PEACH: environment.EXPO_PUBLIC_ENABLE_PEACH || 'false',
    EXPO_PUBLIC_MAPS_PROVIDER: environment.EXPO_PUBLIC_MAPS_PROVIDER || 'disabled',
    EXPO_PUBLIC_PUSH_PROVIDER: environment.EXPO_PUBLIC_PUSH_PROVIDER || 'disabled',
    TOGT_STANDALONE_BUILD: 'true',
  };
}

function expoCliPath() {
  return requireFile(
    path.join(mobileRoot, 'node_modules', 'expo', 'bin', 'cli'),
    'Expo dependencies are missing. Run npm ci before the Android build command.'
  );
}

function verifyReleaseIdentity(runtime) {
  const expo = appJson.expo;
  if (expo.android?.package !== 'za.togt.app' || runtime.packageName !== 'za.togt.app') {
    throw new Error('Android package identity must remain za.togt.app.');
  }
  if (!Number.isInteger(expo.android?.versionCode) || expo.android.versionCode < 3) {
    throw new Error('Grounded Momentum successors must use Android versionCode 3 or higher.');
  }
  if (typeof expo.version !== 'string' || !expo.version.trim()) {
    throw new Error('app.json must contain a non-empty versionName.');
  }
  return {
    packageName: expo.android.package,
    versionCode: expo.android.versionCode,
    versionName: expo.version,
  };
}

function assertAddressPinCandidateProfile(identity, runtime) {
  if (identity.versionCode !== 4) return;
  if (identity.versionName !== '1.2.0') {
    throw new Error('Address-pin versionCode 4 must use versionName 1.2.0.');
  }
  if (
    runtime.featureFlags?.groundedMomentumShell !== true
    || runtime.featureFlags?.customerFlagship !== true
  ) {
    throw new Error(
      'Address-pin versionCode 4 requires groundedMomentumShell and customerFlagship.'
    );
  }
  if (runtime.mapsProvider !== 'google' || !runtime.googleMapsAndroidApiKey) {
    throw new Error(
      'Address-pin versionCode 4 requires the packaged Google Maps provider and Android key.'
    );
  }
  if (
    runtime.locationCapabilities?.schemaVersion !== 1
    || runtime.locationCapabilities?.mapsDisplay !== true
    || runtime.locationCapabilities?.addressProvenanceRecording !== true
  ) {
    throw new Error(
      'Address-pin versionCode 4 requires the packaged location-capability contract.'
    );
  }
}

function preflight(
  environment = buildEnvironment(),
  { requireSigning = true, requireToolchain = true } = {}
) {
  const runtime = resolveBuildConfiguration(environment);
  if (runtime.buildProvider !== 'local_gradle') {
    throw new Error('The local APK command requires ANDROID_BUILD_PROVIDER=local_gradle.');
  }
  const identity = verifyReleaseIdentity(runtime);
  assertAddressPinCandidateProfile(identity, runtime);
  const abis = parseAbiList(environment.TOGT_ANDROID_ABIS);
  const signing = requireSigning ? resolveSigningConfiguration(environment, runtime) : null;
  const toolchain = requireToolchain ? resolveToolchain(environment) : null;
  const sdkEvidence = toolchain ? resolveGeneratedAndroidSdkEvidence(toolchain) : null;
  const expoCli = expoCliPath();

  run(process.execPath, [expoCli, 'config', '--type', 'public', '--json'], {
    capture: true,
    env: environment,
    sensitiveValues: [runtime.googleMapsAndroidApiKey],
  });

  const toolchainSummary = toolchain
    ? `, JDK 17, build-tools ${toolchain.buildToolsVersion}`
    : '';
  const signingSummary = signing ? `, signer ${signing.expectedSignerSha256}` : '';
  console.log(
    `P0 Android preflight passed: ${identity.packageName} ${identity.versionName} ` +
    `(versionCode ${identity.versionCode}), ${runtime.configClass}, ${abis.join(',')}` +
    `${toolchainSummary}${signingSummary}.`
  );

  return { abis, environment, identity, runtime, sdkEvidence, signing, toolchain };
}

function runPrebuild(context) {
  const expoCli = expoCliPath();
  run(process.execPath, [expoCli, 'prebuild', '--platform', 'android', '--clean', '--no-install'], {
    env: context.environment,
  });
  assertAndroidCleartextPolicy(context);
  return {
    ...context,
    signing: resolveSigningConfiguration(context.environment, context.runtime, {
      requireGeneratedKey: true,
    }),
  };
}

function runExport(context) {
  const expoCli = expoCliPath();
  run(
    process.execPath,
    [expoCli, 'export', '--platform', 'android', '--output-dir', 'dist/android', '--clear'],
    { env: context.environment }
  );
}

function gitOutput(args) {
  return run('git', args, { capture: true }).trim();
}

function assertCleanSource() {
  const status = gitOutput(['status', '--porcelain']);
  if (status) {
    throw new Error(
      'Refusing to stamp an APK from a dirty source tree. Commit the reviewed source first.'
    );
  }
  return gitOutput(['rev-parse', 'HEAD']);
}

function sha256File(filePath) {
  const hash = crypto.createHash('sha256');
  hash.update(fs.readFileSync(filePath));
  return hash.digest('hex').toUpperCase();
}

function assertSameValues(actual, expected, label) {
  const left = [...actual].sort();
  const right = [...expected].sort();
  if (left.length !== right.length || left.some((value, index) => value !== right[index])) {
    throw new Error(`${label} mismatch: expected ${right.join(',')}; found ${left.join(',') || 'none'}.`);
  }
}

function assertGoogleMapsManifestMetadata(xmlTreeSource, runtime) {
  const metadataName = 'com.google.android.geo.API_KEY';
  const hasMetadata = typeof xmlTreeSource === 'string' && xmlTreeSource.includes(metadataName);
  if (runtime.mapsProvider !== 'google') {
    if (hasMetadata) {
      throw new Error('Google Maps manifest metadata is present in a Maps-disabled build.');
    }
    return false;
  }
  if (!hasMetadata) {
    throw new Error('Google Maps manifest metadata is missing from the Maps-enabled APK.');
  }
  if (
    typeof runtime.googleMapsAndroidApiKey !== 'string'
    || !runtime.googleMapsAndroidApiKey
    || !xmlTreeSource.includes(runtime.googleMapsAndroidApiKey)
  ) {
    throw new Error('Google Maps manifest metadata does not contain the configured Android key.');
  }
  return true;
}

function assertRuntimeAssetMetadata(appConfigSource, bundleSource, runtime) {
  let appConfig;
  try {
    appConfig = JSON.parse(appConfigSource);
  } catch (error) {
    throw new Error(`Generated app.config is not valid JSON: ${error.message}`);
  }

  const extra = appConfig?.extra || {};
  const claims = [
    ['API URL', extra.apiUrl, runtime.apiBaseUrl],
    ['app environment', extra.appEnvironment, runtime.appEnvironment],
    ['configuration class', extra.configClass, runtime.configClass],
    ['build provider', extra.buildProvider, runtime.buildProvider],
    ['Android cleartext policy', extra.androidCleartextAllowed, runtime.androidCleartextAllowed],
    ['maps provider', extra.providers?.maps, runtime.mapsProvider],
    ['Peach provider', extra.providers?.peach, runtime.peachAllowed],
    ['push provider', extra.providers?.push, runtime.pushProvider],
  ];
  for (const [label, actual, expected] of claims) {
    if (actual !== expected) {
      throw new Error(
        `Generated app.config ${label} mismatch: expected ${JSON.stringify(expected)}; ` +
        `found ${JSON.stringify(actual)}.`
      );
    }
  }
  if (extra.featureFlags?.schemaVersion !== 1) {
    throw new Error('Generated app.config feature-flag schema mismatch: expected version 1.');
  }
  for (const [name, expected] of Object.entries(runtime.featureFlags)) {
    const actual = extra.featureFlags?.flags?.[name];
    if (actual !== expected) {
      throw new Error(
        `Generated app.config feature flag ${name} mismatch: expected ${expected}; found ${actual}.`
      );
    }
  }
  if (
    stableJson(extra.locationCapabilities)
    !== stableJson(runtime.locationCapabilities)
  ) {
    throw new Error('Generated app.config location-capability contract mismatch.');
  }

  if (typeof bundleSource !== 'string' || !bundleSource.trim()) {
    throw new Error('Generated Android JavaScript bundle is empty.');
  }
  const expectedOrigin = new URL(runtime.apiBaseUrl).origin;
  const embeddedOrigins = [
    ...new Set(
      [...bundleSource.matchAll(
        /\bhttps?:\/\/(?:localhost|\[[0-9a-f:]+\]|[a-z0-9](?:[a-z0-9.-]*[a-z0-9])?)(?::\d{1,5})?/gi
      )].map((match) => new URL(match[0]).origin)
    ),
  ];
  const staleOrigins = embeddedOrigins.filter((origin) =>
    origin !== expectedOrigin && !REVIEWED_NON_API_ORIGINS.has(origin)
  );
  if (staleOrigins.length > 0) {
    throw new Error(
      'Android bundle contains a stale or unreviewed runtime origin: ' +
      `${staleOrigins.join(', ')}; expected ${expectedOrigin}.`
    );
  }
}

function assertGeneratedRuntimeAssets(context, androidRoot) {
  const appConfigPath = requireFile(
    path.join(
      androidRoot,
      'app',
      'build',
      'intermediates',
      'assets',
      'release',
      'mergeReleaseAssets',
      'app.config'
    ),
    'Gradle did not merge the generated Expo app.config asset.'
  );
  const bundlePath = requireFile(
    path.join(
      androidRoot,
      'app',
      'build',
      'generated',
      'assets',
      'createBundleReleaseJsAndAssets',
      'index.android.bundle'
    ),
    'Gradle did not generate the Android JavaScript bundle.'
  );
  assertRuntimeAssetMetadata(
    fs.readFileSync(appConfigPath, 'utf8'),
    fs.readFileSync(bundlePath, 'utf8'),
    context.runtime
  );
}

function buildApk(context, sourceCommit) {
  const androidRoot = path.join(mobileRoot, 'android');
  const gradleWrapper = requireFile(
    path.join(androidRoot, process.platform === 'win32' ? 'gradlew.bat' : 'gradlew'),
    'Expo prebuild did not create the Android Gradle wrapper.'
  );
  const gradleArgs = [
    ':app:assembleRelease',
    '--no-daemon',
    '--stacktrace',
    `-Pandroid.buildToolsVersion=${REQUIRED_BUILD_TOOLS_VERSION}`,
    `-Pandroid.compileSdkVersion=${REQUIRED_COMPILE_SDK_VERSION}`,
    `-Pandroid.minSdkVersion=${REQUIRED_MIN_SDK_VERSION}`,
    `-Pandroid.targetSdkVersion=${REQUIRED_TARGET_SDK_VERSION}`,
    `-PreactNativeArchitectures=${context.abis.join(',')}`,
  ];
  run(gradleWrapper, gradleArgs, {
    cwd: androidRoot,
    env: context.environment,
    shell: process.platform === 'win32',
  });
  assertGeneratedRuntimeAssets(context, androidRoot);

  const gradleApk = requireFile(
    path.join(androidRoot, 'app', 'build', 'outputs', 'apk', 'release', 'app-release.apk'),
    'Gradle did not produce app-release.apk.'
  );
  const runtimeConfig = createSafeRuntimeContract(context.runtime);
  const runtimeConfigSha256 = fingerprintRuntimeContract(runtimeConfig);
  const artifactBaseName = createArtifactBaseName({
    ...context.identity,
    abis: context.abis,
    configClass: context.runtime.configClass,
    runtimeConfigSha256,
    sourceCommit,
  });
  const outputRoot = path.join(mobileRoot, 'dist', 'apk');
  fs.mkdirSync(outputRoot, { recursive: true });
  const artifactPath = path.join(outputRoot, `${artifactBaseName}.apk`);
  const manifestPath = path.join(outputRoot, `${artifactBaseName}.manifest.json`);
  for (const generatedPath of [artifactPath, `${artifactPath}.idsig`, manifestPath]) {
    removeGeneratedFile(generatedPath, outputRoot);
  }
  const quarantineRoot = fs.mkdtempSync(path.join(outputRoot, '.candidate-'));
  const alignedApk = path.join(quarantineRoot, 'aligned.apk');
  const inspectedApk = path.join(quarantineRoot, 'candidate.apk');
  const inspectedManifest = path.join(quarantineRoot, 'candidate.manifest.json');

  try {
    run(
      context.toolchain.zipalign,
      ['-P', '16', '-f', '-v', '4', gradleApk, alignedApk],
      { env: context.environment }
    );

    const signingEnvironment = { ...context.environment };
    if (context.signing.mode === 'generated-debug') {
      signingEnvironment.TOGT_INTERNAL_DEBUG_STORE_PASSWORD = 'android';
      signingEnvironment.TOGT_INTERNAL_DEBUG_KEY_PASSWORD = 'android';
    }
    run(
      context.toolchain.apksigner,
      [
        'sign',
        '--ks', context.signing.keystorePath,
        '--ks-key-alias', context.signing.alias,
        '--ks-pass', `env:${context.signing.storePasswordEnvironmentName}`,
        '--key-pass', `env:${context.signing.keyPasswordEnvironmentName}`,
        '--min-sdk-version', REQUIRED_MIN_SDK_VERSION,
        '--out', inspectedApk,
        alignedApk,
      ],
      { env: signingEnvironment, shell: process.platform === 'win32' }
    );
    removeGeneratedFile(alignedApk, quarantineRoot);

    run(context.toolchain.zipalign, ['-c', '-P', '16', '-v', '4', inspectedApk], {
      capture: true,
      env: context.environment,
    });
    const signerOutput = run(
      context.toolchain.apksigner,
      ['verify', '--verbose', '--print-certs', inspectedApk],
      { capture: true, env: context.environment, shell: process.platform === 'win32' }
    );
    const signer = parseSignerFingerprints(signerOutput);
    if (signer.sha256 !== context.signing.expectedSignerSha256) {
      throw new Error(
        `Signer SHA-256 mismatch: expected ${context.signing.expectedSignerSha256}; found ${signer.sha256}.`
      );
    }
    if (signer.sha1 !== context.signing.expectedSignerSha1) {
      throw new Error(
        `Signer SHA-1 mismatch: expected ${context.signing.expectedSignerSha1}; found ${signer.sha1}.`
      );
    }

    const badging = parseAaptBadging(
      run(context.toolchain.aapt, ['dump', 'badging', inspectedApk], {
        capture: true,
        env: context.environment,
      })
    );
    if (badging.packageName !== context.identity.packageName) {
      throw new Error(`APK package mismatch: ${badging.packageName}.`);
    }
    if (
      badging.versionCode !== context.identity.versionCode ||
      badging.versionName !== context.identity.versionName
    ) {
      throw new Error(
        `APK version mismatch: ${badging.versionName} (${badging.versionCode}).`
      );
    }
    assertApkSdkVersions(badging);
    assertSameValues(badging.abis, context.abis, 'APK ABI');
    const androidPermissions = parseAaptPermissions(
      run(context.toolchain.aapt, ['dump', 'permissions', inspectedApk], {
        capture: true,
        env: context.environment,
      })
    );
    assertAndroidPermissionBoundary(androidPermissions);
    const mapsManifestMetadataVerified = assertGoogleMapsManifestMetadata(
      run(
        context.toolchain.aapt,
        ['dump', 'xmltree', inspectedApk, 'AndroidManifest.xml'],
        {
          capture: true,
          env: context.environment,
          sensitiveValues: [context.runtime.googleMapsAndroidApiKey],
        }
      ),
      context.runtime
    );

    const artifactSha256 = sha256File(inspectedApk);
    const manifest = {
      schemaVersion: 3,
      artifactFile: path.basename(artifactPath),
      artifactSha256,
      artifactSizeBytes: fs.statSync(inspectedApk).size,
      packageName: badging.packageName,
      versionName: badging.versionName,
      versionCode: badging.versionCode,
      sourceCommit,
      appEnvironment: context.runtime.appEnvironment,
      androidCleartextAllowed: context.runtime.androidCleartextAllowed,
      configClass: context.runtime.configClass,
      buildProvider: context.runtime.buildProvider,
      apiOrigin: runtimeConfig.apiOrigin,
      providers: runtimeConfig.providers,
      featureFlags: context.runtime.featureFlags,
      runtimeConfig,
      runtimeConfigSha256,
      abis: badging.abis,
      androidPermissions,
      mapsManifestMetadataVerified,
      minSdkVersion: badging.minSdkVersion,
      targetSdkVersion: badging.targetSdkVersion,
      compileSdkVersion: context.sdkEvidence.compileSdkVersion,
      androidSdkEvidence: context.sdkEvidence,
      enforcedAndroidGradleProperties: {
        buildToolsVersion: REQUIRED_BUILD_TOOLS_VERSION,
        compileSdkVersion: REQUIRED_COMPILE_SDK_VERSION,
        minSdkVersion: REQUIRED_MIN_SDK_VERSION,
        targetSdkVersion: REQUIRED_TARGET_SDK_VERSION,
      },
      signerSha1: signer.sha1,
      signerSha256: signer.sha256,
      expectedSignerSha1: context.signing.expectedSignerSha1,
      expectedSignerSha256: context.signing.expectedSignerSha256,
      signingMode: context.signing.mode,
      aligned: true,
      signatureVerified: true,
    };
    fs.writeFileSync(inspectedManifest, `${JSON.stringify(manifest, null, 2)}\n`, 'utf8');
    let apkPublished = false;
    try {
      fs.copyFileSync(inspectedApk, artifactPath, fs.constants.COPYFILE_EXCL);
      apkPublished = true;
      fs.copyFileSync(inspectedManifest, manifestPath, fs.constants.COPYFILE_EXCL);
    } catch (error) {
      if (apkPublished) removeGeneratedFile(artifactPath, outputRoot);
      throw error;
    }

    console.log(`APK: ${artifactPath}`);
    console.log(`Manifest: ${manifestPath}`);
    console.log(`SHA-256: ${artifactSha256}`);
    return { artifactPath, manifest, manifestPath };
  } finally {
    removeGeneratedDirectory(quarantineRoot, outputRoot);
  }
}

function main() {
  const command = process.argv[2];
  const environment = buildEnvironment(process.env);
  if (!['preflight', 'prebuild', 'export', 'build'].includes(command)) {
    throw new Error('Usage: node scripts/android-build.cjs <preflight|prebuild|export|build>');
  }

  if (command === 'build') {
    const sourceCommit = assertCleanSource();
    const context = runPrebuild(preflight(environment));
    const postPrebuildCommit = assertCleanSource();
    if (postPrebuildCommit !== sourceCommit) {
      throw new Error('Expo prebuild changed the source commit unexpectedly.');
    }
    buildApk(context, sourceCommit);
    return;
  }

  if (command === 'export') {
    runExport(preflight(environment, { requireSigning: false, requireToolchain: false }));
    return;
  }

  const context = preflight(environment);
  if (command === 'prebuild') runPrebuild(context);
}

if (require.main === module) {
  try {
    main();
  } catch (error) {
    console.error(`Android build failed: ${error.message}`);
    process.exitCode = 1;
  }
}

module.exports = {
  BASELINE_SIGNER_SHA1,
  BASELINE_SIGNER_SHA256,
  BLOCKED_ANDROID_PERMISSIONS,
  REQUIRED_COMPILE_SDK_VERSION,
  REQUIRED_MIN_SDK_VERSION,
  REQUIRED_TARGET_SDK_VERSION,
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
};
