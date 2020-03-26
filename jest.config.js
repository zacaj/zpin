const { defaults } = require('jest-config');

module.exports = {
  ...defaults,
  preset: 'ts-jest',
  testEnvironment: 'node',
  transform: {
    '^.ts?$': 'babel-jest',
    '^.spec.ts?$': 'babel-jest',
  },
  testMatch: [
    '**/*.spec.ts',
  ],
  automock: false,
  bail: 1,
  clearMocks: true,
  collectCoverage: true,
  collectCoverageFrom: [
    '**/*.ts',
  ],
  coverageDirectory: './coverage/',
  coveragePathIgnorePatterns: [
    '/node_modules/',
  ],
  coverageThreshold: {
    global: {
      branches: 90,
      functions: 95,
      lines: 95,
      statements: 95,
    },
  },
  errorOnDeprecated: true,
  moduleFileExtensions: ['ts', 'js', 'json'],
  restoreMocks: true,
  setupFilesAfterEnv: [
    './jest.ts',
  ],
  testPathIgnorePatterns: [
      '/node_modules/',
      './jserver/',
  ],
  globals: {
    'ts-jest': {
      tsConfig: './tsconfig.json',
    },
  },
  verbose: false, // default is false, included it to switch to true for easy debugging
};
