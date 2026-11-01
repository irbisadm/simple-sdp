module.exports = {
  roots: ['<rootDir>/src', '<rootDir>/test'],
  transform: {'^.+\\.tsx?$':'ts-jest'},
  preset: 'ts-jest',
  moduleFileExtensions: ['ts','tsx','js','jsx','json','node'],
  testEnvironment: 'node',
};