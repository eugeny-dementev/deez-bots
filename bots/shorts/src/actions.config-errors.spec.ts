import { FindLastFile, PrepareYtDlpCommand } from './actions.js';

jest.mock('./config.js', () => ({
  homeDir: '',
  swapDir: '/swap',
}), { virtual: true });

jest.mock('del', () => ({
  __esModule: true,
  deleteAsync: jest.fn(),
}), { virtual: true });

jest.mock('glob', () => ({
  glob: { glob: jest.fn() },
}));

jest.mock('./helpers.js', () => ({
  getLinkType: jest.fn(() => 'short'),
  omit: jest.fn((obj: object) => obj),
}));

describe('shorts actions config errors', () => {
  it('PrepareYtDlpCommand throws when HOME_DIR missing', async () => {
    const context = { url: 'https://example.com', type: 'short', extend: jest.fn(), userId: 1 } as any;

    await expect(new PrepareYtDlpCommand().execute(context)).rejects.toThrow('No HOME_DIR specified');
  });

  it('FindLastFile throws when HOME_DIR missing', async () => {
    const context = { userId: 1, extend: jest.fn() } as any;

    await expect(new FindLastFile().execute(context)).rejects.toThrow('No home dir found');
  });
});
