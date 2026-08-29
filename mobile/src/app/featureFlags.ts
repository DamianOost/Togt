/**
 * Build-packaged rollout flags for the additive Grounded Momentum migration.
 *
 * This policy deliberately does not read environment variables or remote data.
 * The app entry point must pass the public, packaged `extra.featureFlags` value
 * to `resolvePackagedFeatureFlags`. Provider availability remains a separate,
 * server-authoritative capability decision.
 */

export const PACKAGED_FEATURE_FLAG_SCHEMA_VERSION = 1 as const;

export const PACKAGED_FEATURE_FLAG_NAMES = Object.freeze([
  'groundedMomentumShell',
  'customerFlagship',
  'workerExperience',
  'relationships',
  'aiAssistedIntake',
  'explainableRecommendations',
  'livePlatformStatus',
  'contextualSafetyEducation',
  'darkTheme',
] as const);

export type PackagedFeatureFlagName = (typeof PACKAGED_FEATURE_FLAG_NAMES)[number];

/** Every new path is off unless this exact APK explicitly packages it on. */
export const PACKAGED_FEATURE_FLAG_DEFAULTS: Readonly<
  Record<PackagedFeatureFlagName, boolean>
> = Object.freeze({
  groundedMomentumShell: false,
  customerFlagship: false,
  workerExperience: false,
  relationships: false,
  aiAssistedIntake: false,
  explainableRecommendations: false,
  livePlatformStatus: false,
  contextualSafetyEducation: false,
  darkTheme: false,
});

export interface PackagedFeatureFlags {
  readonly schemaVersion: typeof PACKAGED_FEATURE_FLAG_SCHEMA_VERSION;
  readonly valid: boolean;
  readonly reasonCode: 'packaged_flags_valid' | 'packaged_flags_unavailable' | 'unsupported_flag_schema';
  readonly flags: Readonly<Record<PackagedFeatureFlagName, boolean>>;
  readonly invalidFlags: readonly PackagedFeatureFlagName[];
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function failClosed(
  reasonCode: PackagedFeatureFlags['reasonCode'],
): PackagedFeatureFlags {
  return Object.freeze({
    schemaVersion: PACKAGED_FEATURE_FLAG_SCHEMA_VERSION,
    valid: false,
    reasonCode,
    flags: PACKAGED_FEATURE_FLAG_DEFAULTS,
    invalidFlags: Object.freeze([]),
  });
}

/**
 * Resolve the versioned object packaged at `extra.featureFlags`.
 *
 * Only the literal boolean `true` enables a known flag. A malformed value
 * fails closed for that flag without allowing unknown keys into the result.
 */
export function resolvePackagedFeatureFlags(input: unknown): PackagedFeatureFlags {
  if (!isRecord(input)) {
    return failClosed('packaged_flags_unavailable');
  }

  const schemaVersion = input.schemaVersion ?? input.schema_version;
  if (schemaVersion !== PACKAGED_FEATURE_FLAG_SCHEMA_VERSION || !isRecord(input.flags)) {
    return failClosed('unsupported_flag_schema');
  }

  const flags: Record<PackagedFeatureFlagName, boolean> = {
    ...PACKAGED_FEATURE_FLAG_DEFAULTS,
  };
  const invalidFlags: PackagedFeatureFlagName[] = [];

  for (const name of PACKAGED_FEATURE_FLAG_NAMES) {
    const value = input.flags[name];
    if (value === true) {
      flags[name] = true;
    } else if (value !== false && value !== undefined) {
      invalidFlags.push(name);
    }
  }

  return Object.freeze({
    schemaVersion: PACKAGED_FEATURE_FLAG_SCHEMA_VERSION,
    valid: true,
    reasonCode: 'packaged_flags_valid',
    flags: Object.freeze(flags),
    invalidFlags: Object.freeze(invalidFlags),
  });
}

/**
 * Read the generated Expo `extra` object without importing Expo at this policy
 * boundary. The current `extra.features.groundedMomentum` field is treated as
 * a legacy packaged alias for the versioned master-shell flag; future fields
 * must use the versioned `extra.featureFlags` shape.
 */
export function resolvePackagedFeatureFlagsFromExtra(extra: unknown): PackagedFeatureFlags {
  if (!isRecord(extra)) return failClosed('packaged_flags_unavailable');
  if (isRecord(extra.featureFlags)) {
    return resolvePackagedFeatureFlags(extra.featureFlags);
  }
  if (!isRecord(extra.features)) return failClosed('packaged_flags_unavailable');

  const legacyShellFlag = extra.features.groundedMomentum;
  if (legacyShellFlag !== true && legacyShellFlag !== false) {
    return failClosed('packaged_flags_unavailable');
  }
  return resolvePackagedFeatureFlags({
    schemaVersion: PACKAGED_FEATURE_FLAG_SCHEMA_VERSION,
    flags: { groundedMomentumShell: legacyShellFlag },
  });
}

export function isPackagedFeatureEnabled(
  snapshot: PackagedFeatureFlags,
  name: PackagedFeatureFlagName,
): boolean {
  if (snapshot.valid !== true || snapshot.flags[name] !== true) return false;
  return name === 'groundedMomentumShell' || snapshot.flags.groundedMomentumShell === true;
}

export function isGroundedMomentumShellEnabled(snapshot: PackagedFeatureFlags): boolean {
  return isPackagedFeatureEnabled(snapshot, 'groundedMomentumShell');
}
