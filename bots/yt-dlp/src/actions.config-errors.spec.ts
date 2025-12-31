import { FindFile } from './actions.js';

jest.mock('./config.js', () => ({
  homeDir: '',
}), { virtual: true });

jest.mock('del', () => ({
  __esModule: true,
  deleteAsync: jest.fn(),
}), { virtual: true });

jest.mock('glob', () => ({
  glob: { glob: jest.fn() },
}));

jest.mock('expand-tilde', () => jest.fn());

describe('yt-dlp bot actions config errors', () => {
  it('FindFile throws when HOME_DIR missing', async () => {
    const context = { destFileName: 'file', extend: jest.fn(), logger: { info: jest.fn() } } as any;

    await expect(new FindFile().execute(context)).rejects.toThrow('No home dir found');
  });
});
