const { resolveApiBaseUrl } = require('./src/config/apiBaseUrl.cjs');

module.exports = ({ config }) => {
  const buildProfile = process.env.EAS_BUILD_PROFILE?.trim();
  const apiUrl = resolveApiBaseUrl({
    configuredUrl: process.env.EXPO_PUBLIC_API_BASE_URL,
    isDevelopment: !buildProfile,
    isExpoGo: !buildProfile,
  });

  return {
    ...config,
    extra: {
      ...(config.extra || {}),
      apiUrl,
      buildProfile: buildProfile || 'development',
    },
  };
};
