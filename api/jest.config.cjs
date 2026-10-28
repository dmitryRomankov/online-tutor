module.exports = {
  testEnvironment: 'node',
  testRegex: 'test/.*\\.e2e-spec\\.ts$',
  extensionsToTreatAsEsm: ['.ts'],
  moduleNameMapper: { '^(\\.{1,2}/.*)\\.js$': '$1' },
  transform: { '^.+\\.ts$': ['ts-jest', { tsconfig: 'tsconfig.json', useESM: true }] },
  collectCoverageFrom: ['src/**/*.ts', '!src/main.ts', '!src/generated/**'],
};
