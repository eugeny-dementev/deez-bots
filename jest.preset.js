const nxPreset = require('@nx/jest/preset').default;

module.exports = {
  ...nxPreset,
  moduleNameMapper: {
    '^@libs/(.*)$': '<rootDir>/../../libs/$1/src/index.ts',
  },
};
