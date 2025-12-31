import path from 'path';
import { exec } from '@libs/command';
import {
  CalcTimeLeft,
  CleanUpUrl,
  ConvertVideo,
  DeleteFile,
  DeleteLimitStatus,
  DownloadVideo,
  ExtractVideoDimentions,
  FindFile,
  FindMainFile,
  Log,
  SetChatIdToChannelId,
  SetLimitStatus,
  UploadVideo,
} from './actions.js';
import { UserRole } from './types.js';

jest.mock('./config.js', () => ({
  homeDir: '~/home',
  storageDir: '~/storage',
  swapDir: '/swap',
}), { virtual: true });

jest.mock('@libs/command', () => {
  const actual = jest.requireActual('@libs/command');
  return {
    ...actual,
    exec: jest.fn(),
  };
});

jest.mock('@libs/actions', () => {
  const actual = jest.requireActual('@libs/actions');
  return {
    ...actual,
    parseYtDlpError: jest.fn((msg: string) => `parsed:${msg}`),
  };
});

jest.mock('del', () => ({
  __esModule: true,
  deleteAsync: jest.fn(),
}), { virtual: true });

jest.mock('glob', () => ({
  glob: { glob: jest.fn() },
}));
const globMock = (jest.requireMock('glob') as { glob: { glob: jest.Mock } }).glob.glob;

jest.mock('expand-tilde', () => jest.fn((value: string) => value.replace('~', '/expanded')));

jest.mock('grammy', () => ({
  InputFile: class InputFile {
    path: string;
    constructor(pathValue: string) {
      this.path = pathValue;
    }
  },
}));

const createLogger = () => ({
  info: jest.fn(),
  debug: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
  verbose: jest.fn(),
});

const createContext = (overrides: Record<string, unknown> = {}) => ({
  userId: 1,
  role: UserRole.admin,
  limitsStatus: {},
  extend: jest.fn(),
  tlog: jest.fn(),
  tadd: jest.fn(),
  terr: jest.fn(),
  abort: jest.fn(),
  logger: createLogger(),
  bot: { api: { sendVideo: jest.fn() } },
  channelId: 10,
  ...overrides,
});

describe('playground actions', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('CalcTimeLeft sets remaining time', async () => {
    jest.spyOn(Date, 'now').mockReturnValue(2000);
    const limitsStatus = { 1: 1000 };
    const context = createContext({ limitsStatus });

    await new CalcTimeLeft().execute(context as any);

    expect(context.extend).toHaveBeenCalledWith({ timeLimitLeft: 0 });
    (Date.now as jest.Mock).mockRestore();
  });

  it('CalcTimeLeft uses current limit when available', async () => {
    jest.spyOn(Date, 'now').mockReturnValue(2000);
    const limitsStatus = { 1: 1 };
    const context = createContext({ limitsStatus, role: UserRole.subscriber });

    await new CalcTimeLeft().execute(context as any);

    const value = (context.extend as jest.Mock).mock.calls[0][0].timeLimitLeft as number;
    expect(value).toBeGreaterThan(1000);
    (Date.now as jest.Mock).mockRestore();
  });

  it('SetLimitStatus and DeleteLimitStatus mutate limits', async () => {
    jest.spyOn(Date, 'now').mockReturnValue(1234);
    const limitsStatus: Record<number, number> = {};
    const context = createContext({ limitsStatus });

    await new SetLimitStatus().execute(context as any);
    expect(limitsStatus[1]).toBe(1234);

    await new DeleteLimitStatus().execute(context as any);
    expect(limitsStatus[1]).toBeUndefined();

    (Date.now as jest.Mock).mockRestore();
  });

  it('Log outputs context', async () => {
    jest.spyOn(console, 'log').mockImplementation(() => undefined);
    await new Log().execute({ name: () => 'test' } as any);
    expect(console.log).toHaveBeenCalled();
    (console.log as jest.Mock).mockRestore();
  });

  it('CleanUpUrl strips query and hash', async () => {
    const context = createContext({ url: 'https://site/path?q=1#hash' });

    await new CleanUpUrl().execute(context as any);

    expect(context.extend).toHaveBeenCalledWith({ url: 'https://site/path' });
  });

  it('DownloadVideo throws when destDir is missing', async () => {
    const context = createContext({ url: 'https://site', destDir: '' });

    await expect(new DownloadVideo().execute(context as any)).rejects.toThrow('No destDir specified');
  });

  it('DownloadVideo executes command and logs', async () => {
    const context = createContext({
      url: 'https://site',
      destDir: '~/storage',
      cookiesPath: '/cookies.txt',
      destFileName: 'file',
    });

    await new DownloadVideo().execute(context as any);

    expect(exec).toHaveBeenCalled();
    expect(context.tlog).toHaveBeenCalledWith('Video downloaded');
  });

  it('DownloadVideo onError reports parsed error', async () => {
    const action = new DownloadVideo();
    const context = createContext({
      tlog: jest.fn(),
      terr: jest.fn(),
      abort: jest.fn(),
    });

    await action.onError(new Error('ERROR: fail'), context as any);

    expect(context.tlog).toHaveBeenCalledWith('Failed to download video');
    expect(context.terr).toHaveBeenCalled();
    expect(context.abort).toHaveBeenCalled();
  });

  it('FindMainFile returns when no files found', async () => {
    globMock.mockResolvedValueOnce([]);
    const context = createContext({ destFileName: 'file' });

    await new FindMainFile().execute(context as any);

    expect(context.extend).not.toHaveBeenCalled();
  });

  it('FindMainFile extends when files exist', async () => {
    const storageFile = path.join('/expanded/storage', 'file.mp4');
    globMock.mockResolvedValueOnce([storageFile]);
    const context = createContext({ destFileName: 'file' });

    await new FindMainFile().execute(context as any);

    expect(context.extend).toHaveBeenCalledWith({
      globPattern: path.join('/expanded/storage', 'file.*'),
      globFiles: [storageFile],
      mainFile: storageFile,
    });
  });

  it('FindFile returns when no files found', async () => {
    globMock.mockResolvedValueOnce([]);
    const context = createContext({ destFileName: 'file' });

    await new FindFile().execute(context as any);

    expect(context.extend).not.toHaveBeenCalled();
  });

  it('FindFile extends when files exist', async () => {
    const homeFile = path.join('/expanded/home', '1', 'file.mp4');
    globMock.mockResolvedValueOnce([homeFile]);
    const context = createContext({ destFileName: 'file' });

    await new FindFile().execute(context as any);

    expect(context.extend).toHaveBeenCalledWith({
      globPattern: path.join('/expanded/home', '1', 'file.*'),
      globFiles: [homeFile],
      lastFile: homeFile,
    });
  });

  it('ConvertVideo runs ffmpeg and logs', async () => {
    const context = createContext({ lastFile: '/home/1/file.mp4' });

    await new ConvertVideo().execute(context as any);

    expect(exec).toHaveBeenCalled();
    expect(context.tlog).toHaveBeenCalledWith('Video ready for uploading');
  });

  it('ConvertVideo onError logs and aborts', async () => {
    const action = new ConvertVideo();
    const context = createContext({ terr: jest.fn(), abort: jest.fn() });

    await action.onError(new Error('fail'), context as any);

    expect(context.tlog).toHaveBeenCalledWith('Failed to download video');
    expect(context.terr).toHaveBeenCalled();
    expect(context.abort).toHaveBeenCalled();
  });

  it('ExtractVideoDimentions parses output', async () => {
    (exec as jest.Mock).mockResolvedValueOnce('width=720\nheight=1280');
    const context = createContext({ lastFile: '/home/1/file.mp4' });

    await new ExtractVideoDimentions().execute(context as any);

    expect(context.extend).toHaveBeenCalledWith({ width: 720, height: 1280 });
  });

  it('ExtractVideoDimentions onError logs and aborts', async () => {
    const action = new ExtractVideoDimentions();
    const context = createContext({ terr: jest.fn(), abort: jest.fn() });

    await action.onError(new Error('fail'), context as any);

    expect(context.tlog).toHaveBeenCalledWith('Failed to extract video dimensions');
    expect(context.terr).toHaveBeenCalled();
    expect(context.abort).toHaveBeenCalled();
  });

  it('DeleteFile removes last file', async () => {
    const { deleteAsync } = jest.requireMock('del') as { deleteAsync: jest.Mock };
    await new DeleteFile().execute({ lastFile: '/home/1/file.mp4' } as any);

    expect(deleteAsync).toHaveBeenCalledWith('/home/1/file.mp4', { force: true });
  });

  it('UploadVideo sends video to channel', async () => {
    const context = createContext({ lastFile: '/home/1/file.mp4', width: 640, height: 480 });

    await new UploadVideo().execute(context as any);

    expect(context.bot.api.sendVideo).toHaveBeenCalled();
  });

  it('UploadVideo onError logs and aborts', async () => {
    const action = new UploadVideo();
    const context = createContext({ terr: jest.fn(), abort: jest.fn() });

    await action.onError(new Error('fail'), context as any);

    expect(context.tlog).toHaveBeenCalledWith('Failed to upload video to telegram');
    expect(context.terr).toHaveBeenCalled();
    expect(context.abort).toHaveBeenCalled();
  });

  it('SetChatIdToChannelId sets channelId', async () => {
    const context = createContext({ chatId: 42 });

    await new SetChatIdToChannelId().execute(context as any);

    expect(context.extend).toHaveBeenCalledWith({ channelId: 42 });
  });
});
