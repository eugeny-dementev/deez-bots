/* eslint-disable */
export default {
  displayName: 'yt-dlp',
  extends: '../../jest.config.ts',
  testEnvironment: 'node',
  transform: {
    '^.+\\.[tj]s$': ['ts-jest', { tsconfig: '<rootDir>/tsconfig.spec.json' }],
  },
  moduleFileExtensions: ['ts', 'js', 'html'],
  coverageDirectory: '../../coverage/bots/yt-dlp',
};
