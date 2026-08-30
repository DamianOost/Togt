const { resolveBuildConfiguration } = require('./src/config/buildConfig.cjs');

module.exports = ({ config }) => {
  const runtime = resolveBuildConfiguration(process.env);
  const isDevelopmentBuild = runtime.appEnvironment === 'development';

  const android = {
    ...(config.android || {}),
    package: runtime.packageName,
  };

  if (runtime.mapsProvider === 'google') {
    android.config = {
      ...(android.config || {}),
      googleMaps: {
        ...((android.config && android.config.googleMaps) || {}),
        apiKey: runtime.googleMapsAndroidApiKey,
      },
    };
  }

  if (runtime.pushProvider === 'fcm') {
    android.googleServicesFile = runtime.googleServicesFile;
  }

  const easExtra = runtime.easProjectId
    ? { eas: { projectId: runtime.easProjectId } }
    : {};

  return {
    ...config,
    name: isDevelopmentBuild ? 'TOGT Development' : config.name,
    scheme: runtime.scheme,
    android,
    plugins: [
      ...(config.plugins || []),
      [
        './plugins/withAndroidCleartextPolicy.cjs',
        { configClass: runtime.configClass },
      ],
    ],
    extra: {
      ...(config.extra || {}),
      ...easExtra,
      apiUrl: runtime.apiBaseUrl,
      appEnvironment: runtime.appEnvironment,
      androidCleartextAllowed: runtime.androidCleartextAllowed,
      buildProfile: process.env.EAS_BUILD_PROFILE?.trim() || runtime.buildProvider,
      buildProvider: runtime.buildProvider,
      configClass: runtime.configClass,
      providers: {
        maps: runtime.mapsProvider,
        peach: runtime.peachAllowed,
        push: runtime.pushProvider,
      },
      features: {
        groundedMomentum: runtime.groundedMomentumEnabled,
      },
      featureFlags: {
        schemaVersion: 1,
        flags: runtime.featureFlags,
      },
      locationCapabilities: runtime.locationCapabilities,
    },
  };
};
