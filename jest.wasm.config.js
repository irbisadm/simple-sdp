// Runs the public-API test suites against the WebAssembly build (see test-wasm/adapter.ts).
module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  roots: ['<rootDir>/src', '<rootDir>/test', '<rootDir>/test-wasm'],
  testMatch: [
    '<rootDir>/test/*.spec.ts',
    '<rootDir>/test-wasm/*.spec.ts',
    '<rootDir>/src/services/sdp-reader/direction.spec.ts',
    '<rootDir>/src/services/sdp-writer/index.spec.ts',
  ],
  moduleNameMapper: {
    '^\\.\\./src$': '<rootDir>/test-wasm/adapter.ts',
    '^\\./index$': '<rootDir>/test-wasm/adapter.ts',
    '^\\.\\./sdp-reader$': '<rootDir>/test-wasm/adapter.ts',
  },
};
