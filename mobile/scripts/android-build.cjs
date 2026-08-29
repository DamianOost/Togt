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
const DEFAULT_ABIS = ['arm64-v8a'];
const SUPPORTED_ABIS = new Set(['arm64-v8a', 'armeabi-v7a', 'x86', 'x86_64']);
const SIGNING_MODES = new Set(['generated-debug', 'keystore']);
const REQUIRED_ANDROID_PLATFORM = 'android-36';
const REQUIRED_BUILD_TOOLS_VERSION = '36.0.0';
const REQUIRED_NDK_VERSION = '27.1.12297006';

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

function createArtifactBaseName({ configClass, versionName, versionCode, sourceCommit, abis }) {
  const abiLabel = abis.map(sanitizeArtifactPart).join('+');
  return [
    'TOGT',
    sanitizeArtifactPart(configClass),
    sanitizeArtifactPart(versionName),
    `vc${versionCode}`,
    sanitizeArtifactPart(sourceCommit.slice(0, 12)),
    abiLabel,
  ].join('-');
}

function parseAaptBadging(output) {
  const packageMatch = output.match(
    /^package: name='([^']+)' versionCode='([^']+)' versionName='([^']+)'(?:.*compileSdkVersion='([^']+)')?/m
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
    compileSdkVersion: packageMatch[4] || null,
    packageName: packageMatch[1],
    targetSdkVersion: targetSdkMatch?.[1] || null,
    minSdkVersion: sdkMatch?.[1] || null,
    versionCode: Number(packageMatch[2]),
    versionName: packageMatch[3],
  };
}

function parseSignerFingerprint(output) {
  const match = output.match(/Signer #1 certificate SHA-256 digest:\s*([a-fA-F0-9:]+)/i);
  if (!match) throw new Error('apksigner did not report a signer SHA-256 digest.');
  return normalizeFingerprint(match[1], 'APK signer fingerprint');
}

function isPathInside(parent, candidate) {
  const relative = path.relative(path.resolve(parent), path.resolve(candidate));
  return relative !== '' && !relative.startsWith(`..${path.sep}`) && relative !== '..' && !path.isAbsolute(relative);
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
    const detail = capture
      ? `${result.stdout || ''}${result.stderr || ''}`.trim()
      : '';
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
  const keystorePath = requireFile(
    path.resolve(keystoreValue),
    'TOGT_ANDROID_KEYSTORE_PATH must point to a readable keystore outside the repository.'
  );
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
  if (expo.android?.versionCode !== 2) {
    throw new Error('The P0 successor must use Android versionCode 2.');
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

function preflight(
  environment = buildEnvironment(),
  { requireSigning = true, requireToolchain = true } = {}
) {
  const runtime = resolveBuildConfiguration(environment);
  if (runtime.buildProvider !== 'local_gradle') {
    throw new Error('The local APK command requires ANDROID_BUILD_PROVIDER=local_gradle.');
  }
  const identity = verifyReleaseIdentity(runtime);
  const abis = parseAbiList(environment.TOGT_ANDROID_ABIS);
  const signing = requireSigning ? resolveSigningConfiguration(environment, runtime) : null;
  const toolchain = requireToolchain ? resolveToolchain(environment) : null;
  const expoCli = expoCliPath();

  run(process.execPath, [expoCli, 'config', '--type', 'public', '--json'], {
    capture: true,
    env: environment,
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

  return { abis, environment, identity, runtime, signing, toolchain };
}

function runPrebuild(context) {
  const expoCli = expoCliPath();
  run(process.execPath, [expoCli, 'prebuild', '--platform', 'android', '--clean', '--no-install'], {
    env: context.environment,
  });
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
    `-PreactNativeArchitectures=${context.abis.join(',')}`,
  ];
  run(gradleWrapper, gradleArgs, {
    cwd: androidRoot,
    env: context.environment,
    shell: process.platform === 'win32',
  });

  const gradleApk = requireFile(
    path.join(androidRoot, 'app', 'build', 'outputs', 'apk', 'release', 'app-release.apk'),
    'Gradle did not produce app-release.apk.'
  );
  const artifactBaseName = createArtifactBaseName({
    ...context.identity,
    abis: context.abis,
    configClass: context.runtime.configClass,
    sourceCommit,
  });
  const outputRoot = path.join(mobileRoot, 'dist', 'apk');
  fs.mkdirSync(outputRoot, { recursive: true });
  const alignedApk = path.join(outputRoot, `${artifactBaseName}.aligned.apk`);
  const artifactPath = path.join(outputRoot, `${artifactBaseName}.apk`);
  const manifestPath = path.join(outputRoot, `${artifactBaseName}.manifest.json`);
  for (const generatedPath of [alignedApk, artifactPath, manifestPath]) {
    removeGeneratedFile(generatedPath, outputRoot);
  }

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
      '--min-sdk-version', '24',
      '--out', artifactPath,
      alignedApk,
    ],
    { env: signingEnvironment, shell: process.platform === 'win32' }
  );
  removeGeneratedFile(alignedApk, outputRoot);

  run(context.toolchain.zipalign, ['-c', '-P', '16', '-v', '4', artifactPath], {
    capture: true,
    env: context.environment,
  });
  const signerOutput = run(
    context.toolchain.apksigner,
    ['verify', '--verbose', '--print-certs', artifactPath],
    { capture: true, env: context.environment, shell: process.platform === 'win32' }
  );
  const signerSha256 = parseSignerFingerprint(signerOutput);
  if (signerSha256 !== context.signing.expectedSignerSha256) {
    throw new Error(
      `Signer mismatch: expected ${context.signing.expectedSignerSha256}; found ${signerSha256}.`
    );
  }

  const badging = parseAaptBadging(
    run(context.toolchain.aapt, ['dump', 'badging', artifactPath], {
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
  assertSameValues(badging.abis, context.abis, 'APK ABI');

  const artifactSha256 = sha256File(artifactPath);
  const manifest = {
    schemaVersion: 1,
    artifactFile: path.basename(artifactPath),
    artifactSha256,
    artifactSizeBytes: fs.statSync(artifactPath).size,
    packageName: badging.packageName,
    versionName: badging.versionName,
    versionCode: badging.versionCode,
    sourceCommit,
    appEnvironment: context.runtime.appEnvironment,
    configClass: context.runtime.configClass,
    buildProvider: context.runtime.buildProvider,
    abis: badging.abis,
    minSdkVersion: badging.minSdkVersion,
    targetSdkVersion: badging.targetSdkVersion,
    compileSdkVersion: badging.compileSdkVersion,
    signerSha256,
    expectedSignerSha256: context.signing.expectedSignerSha256,
    signingMode: context.signing.mode,
    aligned: true,
    signatureVerified: true,
  };
  fs.writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, 'utf8');

  console.log(`APK: ${artifactPath}`);
  console.log(`Manifest: ${manifestPath}`);
  console.log(`SHA-256: ${artifactSha256}`);
  return { artifactPath, manifest, manifestPath };
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
  BASELINE_SIGNER_SHA256,
  createArtifactBaseName,
  normalizeFingerprint,
  parseAaptBadging,
  parseAbiList,
  parseSignerFingerprint,
};
