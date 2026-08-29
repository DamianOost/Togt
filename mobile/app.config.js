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
    name: isDevelopmentBuild ? 'Togt Development' : config.name,
    android,
    extra: {
      ...(config.extra || {}),
      ...easExtra,
      apiUrl: runtime.apiBaseUrl,
      appEnvironment: runtime.appEnvironment,
      buildProfile: process.env.EAS_BUILD_PROFILE?.trim() || runtime.buildProvider,
      buildProvider: runtime.buildProvider,
      configClass: runtime.configClass,
      providers: {
        maps: runtime.mapsProvider,
        peach: runtime.peachAllowed,
        push: runtime.pushProvider,
      },
    },
  };
};
