module.exports = {
  testEnvironment: 'node',
  setupFiles: ['<rootDir>/jest.setup.js'],
  globalSetup: '<rootDir>/jest.globalSetup.js',
  globalTeardown: '<rootDir>/jest.globalTeardown.js',
  testPathIgnorePatterns: ['/node_modules/', '/tests/smoke/'],
  testMatch: ['<rootDir>/tests/**/*.test.js'],
  testTimeout: 15000,
  forceExit: true,
  moduleNameMapper: {
    'expo-server-sdk': '<rootDir>/tests/__mocks__/expo-server-sdk.js',
    '^resend$': '<rootDir>/tests/__mocks__/resend.js',
  },

};
