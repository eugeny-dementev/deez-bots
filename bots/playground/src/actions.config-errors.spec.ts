import { FindFile, FindMainFile } from './actions.js';

jest.mock('./config.js', () => ({
  homeDir: '',
  storageDir: '',
  swapDir: '/swap',
}), { virtual: true });

jest.mock('del', () => ({
  __esModule: true,
  deleteAsync: jest.fn(),
}), { virtual: true });

jest.mock('glob', () => ({
  glob: { glob: jest.fn() },
}));

jest.mock('expand-tilde', () => jest.fn());

describe('playground actions config errors', () => {
  it('FindMainFile throws when STORAGE_DIR missing', async () => {
    const context = { destFileName: 'file', extend: jest.fn() } as any;

    await expect(new FindMainFile().execute(context)).rejects.toThrow('No storage dir found');
  });

  it('FindFile throws when HOME_DIR missing', async () => {
    const context = { destFileName: 'file', extend: jest.fn() } as any;

    await expect(new FindFile().execute(context)).rejects.toThrow('No home dir found');
  });
});
