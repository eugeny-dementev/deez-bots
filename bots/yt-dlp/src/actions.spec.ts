import path from 'path';
import { exec } from '@libs/command';
import {
  CleanUpUrl,
  ConvertVideo,
  DeleteFile,
  ExtractVideoDimensions,
  FindFile,
  PrepareYtDlpMaxRes,
  PrepareYtDlpMinRes,
  PrepareYtDlpName,
  SetChatIdToChannelId,
  UploadVideo,
} from './actions.js';

jest.mock('./config.js', () => ({
  homeDir: '~/home',
  storageDir: '/storage',
  maxRes: 720,
  minRes: 480,
}), { virtual: true });

jest.mock('@libs/command', () => {
  const actual = jest.requireActual('@libs/command');
  return {
    ...actual,
    exec: jest.fn(),
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
  url: 'https://example.com',
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

describe('yt-dlp bot actions', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('CleanUpUrl strips query', async () => {
    const context = createContext({ url: 'https://site/path?q=1#hash' });

    await new CleanUpUrl().execute(context as any);

    expect(context.extend).toHaveBeenCalledWith({ url: 'https://site/path' });
  });

  it('PrepareYtDlpMaxRes chooses max bounded by config', async () => {
    const context = createContext({ sizes: [{ res: 360, size: 1 }, { res: 1080, size: 2 }] });

    await new PrepareYtDlpMaxRes().execute(context as any);

    expect(context.extend).toHaveBeenCalledWith({ ydres: 720 });
  });

  it('PrepareYtDlpMinRes aborts when no suitable sizes', async () => {
    const context = createContext({ sizes: [{ res: 360, size: 80 }] , abort: jest.fn()});

    await new PrepareYtDlpMinRes().execute(context as any);

    expect(context.tlog).toHaveBeenCalledWith('No suitable file sizes for desired resolution');
    expect(context.abort).toHaveBeenCalled();
  });

  it('PrepareYtDlpMinRes extends when sizes are available', async () => {
    const context = createContext({ sizes: [{ res: 480, size: 10 }, { res: 720, size: 20 }] });

    await new PrepareYtDlpMinRes().execute(context as any);

    expect(context.extend).toHaveBeenCalledWith({ ydres: 480 });
  });

  it('PrepareYtDlpName sets ydname', async () => {
    const context = createContext({ destFileName: 'file' });

    await new PrepareYtDlpName().execute(context as any);

    expect(context.extend).toHaveBeenCalledWith({ ydname: 'file' });
  });

  it('FindFile returns when no files found', async () => {
    globMock.mockResolvedValueOnce([]);
    const context = createContext({ destFileName: 'file' });

    await new FindFile().execute(context as any);

    expect(context.extend).not.toHaveBeenCalled();
  });

  it('FindFile extends when files exist', async () => {
    const filePath = path.join('/expanded/home', 'file.mp4');
    globMock.mockResolvedValueOnce([filePath]);
    const context = createContext({ destFileName: 'file' });

    await new FindFile().execute(context as any);

    expect(context.extend).toHaveBeenCalledWith({ lastFile: filePath });
  });

  it('ConvertVideo runs ffmpeg, deletes original, and updates lastFile', async () => {
    const lastFile = path.join('/expanded/home', 'file.mp4');
    const context = createContext({ lastFile });

    await new ConvertVideo().execute(context as any);

    const { deleteAsync } = jest.requireMock('del') as { deleteAsync: jest.Mock };
    expect(exec).toHaveBeenCalled();
    expect(deleteAsync).toHaveBeenCalledWith(lastFile, { force: true });
    expect(context.extend).toHaveBeenCalledWith({ lastFile: path.join('/expanded/home', 'file.new.mp4') });
  });

  it('ConvertVideo onError logs and aborts', async () => {
    const context = createContext({ terr: jest.fn(), abort: jest.fn() });

    await new ConvertVideo().onError(new Error('fail'), context as any);

    expect(context.tlog).toHaveBeenCalledWith('Failed to download video');
    expect(context.terr).toHaveBeenCalled();
    expect(context.abort).toHaveBeenCalled();
  });

  it('ExtractVideoDimensions parses output', async () => {
    (exec as jest.Mock).mockResolvedValueOnce('width=720\nheight=1280');
    const lastFile = path.join('/expanded/home', 'file.mp4');
    const context = createContext({ lastFile });

    await new ExtractVideoDimensions().execute(context as any);

    expect(context.extend).toHaveBeenCalledWith({ width: 720, height: 1280 });
  });

  it('ExtractVideoDimensions onError logs and aborts', async () => {
    const context = createContext({ terr: jest.fn(), abort: jest.fn() });

    await new ExtractVideoDimensions().onError(new Error('fail'), context as any);

    expect(context.tlog).toHaveBeenCalledWith('Failed to extract video dimensions');
    expect(context.terr).toHaveBeenCalled();
    expect(context.abort).toHaveBeenCalled();
  });

  it('DeleteFile removes file', async () => {
    const { deleteAsync } = jest.requireMock('del') as { deleteAsync: jest.Mock };

    const lastFile = path.join('/expanded/home', 'file.mp4');
    await new DeleteFile().execute({ lastFile } as any);

    expect(deleteAsync).toHaveBeenCalledWith(lastFile, { force: true });
  });

  it('UploadVideo sends to telegram', async () => {
    const lastFile = path.join('/expanded/home', 'file.mp4');
    const context = createContext({ lastFile, width: 640, height: 480 });

    await new UploadVideo().execute(context as any);

    expect(context.bot.api.sendVideo).toHaveBeenCalled();
  });

  it('SetChatIdToChannelId sets channelId', async () => {
    const context = createContext({ chatId: 99 });

    await new SetChatIdToChannelId().execute(context as any);

    expect(context.extend).toHaveBeenCalledWith({ channelId: 99 });
  });
});
