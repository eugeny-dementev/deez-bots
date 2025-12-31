import path from 'path';
import { ExecuteCommand, ExtractVideoDimentions, FindLastFile, GetLinkType, Notification, PrepareConvertCommand, PrepareYtDlpCommand, PreapreVideoDimentionsCommand, CleanUpUrl, DeleteLastFile, DeleteLimitStatus, CalcTimeLeft, SetLimitStatus, UploadVideo, SetChatIdToChannelId, RindLadstFile, Log } from './actions.js';
import { UserRole } from './types.js';

jest.mock('./config.js', () => ({
  homeDir: '~/home',
  swapDir: '/swap',
}), { virtual: true });

jest.mock('del', () => ({
  __esModule: true,
  deleteAsync: jest.fn(),
}), { virtual: true });

jest.mock('glob', () => ({
  glob: { glob: jest.fn() },
}));
const globMock = (jest.requireMock('glob') as { glob: { glob: jest.Mock } }).glob.glob;

jest.mock('expand-tilde', () => jest.fn((value: string) => value.replace('~', '/expanded')));

jest.mock('fs/promises', () => ({
  stat: jest.fn(),
}));

jest.mock('shelljs', () => ({
  exec: jest.fn(),
}));

jest.mock('./helpers.js', () => ({
  getLinkType: jest.fn(() => 'short'),
  omit: jest.fn((obj: object) => obj),
}));

jest.mock('grammy', () => ({
  InputFile: class InputFile {
    path: string;
    constructor(pathValue: string) {
      this.path = pathValue;
    }
  },
}));

const createContext = (overrides: Record<string, unknown> = {}) => ({
  userId: 1,
  role: UserRole.admin,
  limitsStatus: {},
  extend: jest.fn(),
  tlog: jest.fn(),
  tadd: jest.fn(),
  bot: { api: { sendVideo: jest.fn(), sendMessage: jest.fn() } },
  chatId: 10,
  channelId: 20,
  url: 'https://site',
  ...overrides,
});

describe('shorts actions', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('Notification sends message with string', async () => {
    const action = new Notification('hello', false);
    const context = createContext();

    await action.execute(context as any);

    expect(context.bot.api.sendMessage).toHaveBeenCalledWith(10, 'hello', { disable_notification: false });
  });

  it('Notification sends message from function', async () => {
    const action = new Notification(async () => 'dynamic');
    const context = createContext();

    await action.execute(context as any);

    expect(context.bot.api.sendMessage).toHaveBeenCalledWith(10, 'dynamic', { disable_notification: true });
  });

  it('CalcTimeLeft uses time thresholds', async () => {
    jest.spyOn(Date, 'now').mockReturnValue(2000);
    const limitsStatus = { 1: 1000 };
    const context = createContext({ limitsStatus });

    await new CalcTimeLeft().execute(context as any);

    expect(context.extend).toHaveBeenCalledWith({ timeLimitLeft: 0 });
    (Date.now as jest.Mock).mockRestore();
  });

  it('CalcTimeLeft keeps remaining time when above threshold', async () => {
    jest.spyOn(Date, 'now').mockReturnValue(2000);
    const limitsStatus = { 1: 1 };
    const context = createContext({ limitsStatus, role: UserRole.subscriber });

    await new CalcTimeLeft().execute(context as any);

    expect(context.extend).toHaveBeenCalledWith({ timeLimitLeft: expect.any(Number) });
    const value = (context.extend as jest.Mock).mock.calls[0][0].timeLimitLeft as number;
    expect(value).toBeGreaterThan(1000);
    (Date.now as jest.Mock).mockRestore();
  });

  it('GetLinkType uses helper', async () => {
    const context = createContext();

    await new GetLinkType().execute(context as any);

    expect(context.extend).toHaveBeenCalledWith({ type: 'short' });
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

  it('PrepareYtDlpCommand builds command with cookies for reels', async () => {
    const context = createContext({
      type: 'reel',
      cookiesPath: '/cookies.txt',
      url: 'https://example.com',
    });

    await new PrepareYtDlpCommand().execute(context as any);

    expect(context.extend).toHaveBeenCalledWith({
      command: expect.stringContaining('--cookies /cookies.txt'),
    });
  });

  it('PrepareYtDlpCommand skips cookies for non-reels', async () => {
    const context = createContext({
      type: 'short',
      cookiesPath: '/cookies.txt',
      url: 'https://example.com',
    });

    await new PrepareYtDlpCommand().execute(context as any);

    const command = (context.extend as jest.Mock).mock.calls[0][0].command as string;
    expect(command).not.toContain('--cookies /cookies.txt');
  });

  it('FindLastFile selects newest file', async () => {
    const firstFile = path.join('/expanded/home', '1', 'a.mp4');
    const secondFile = path.join('/expanded/home', '1', 'b.mp4');
    globMock.mockResolvedValueOnce([firstFile, secondFile]);
    const { stat } = jest.requireMock('fs/promises') as { stat: jest.Mock };
    stat.mockResolvedValueOnce({ ctime: new Date(1) });
    stat.mockResolvedValueOnce({ ctime: new Date(2) });

    const context = createContext();
    await new FindLastFile().execute(context as any);

    expect(context.extend).toHaveBeenCalledWith({ lastFile: secondFile });
  });

  it('FindLastFile returns when no files', async () => {
    globMock.mockResolvedValueOnce([]);
    const context = createContext();

    await new FindLastFile().execute(context as any);

    expect(context.extend).not.toHaveBeenCalled();
  });

  it('RindLadstFile is a no-op', async () => {
    const context = createContext();

    await new RindLadstFile().execute(context as any);

    expect(context.extend).not.toHaveBeenCalled();
  });

  it('PrepareConvertCommand sets ffmpeg command', async () => {
    const lastFile = path.join('/expanded/home', '1', 'file.mp4');
    const context = createContext({ lastFile });

    await new PrepareConvertCommand().execute(context as any);

    expect(context.extend).toHaveBeenCalledWith({
      command: `ffmpeg -i ${lastFile} ${path.join('/expanded/home/1', 'new_file.mp4')}`,
    });
  });

  it('PreapreVideoDimentionsCommand sets ffprobe command', async () => {
    const lastFile = path.join('/expanded/home', '1', 'file.mp4');
    const context = createContext({ lastFile });

    await new PreapreVideoDimentionsCommand().execute(context as any);

    expect(context.extend).toHaveBeenCalledWith({
      command: `ffprobe -v error -show_entries stream=width,height -of default=noprint_wrappers=1 ${lastFile}`,
    });
  });

  it('ExtractVideoDimentions parses output', async () => {
    const context = createContext({ stdout: 'width=720\nheight=1280' });

    await new ExtractVideoDimentions().execute(context as any);

    expect(context.extend).toHaveBeenCalledWith({ width: 720, height: 1280 });
  });

  it('ExecuteCommand rejects when command is missing', async () => {
    const context = createContext();

    await expect(new ExecuteCommand().execute(context as any)).rejects.toBe('Command not found in the context');
  });

  it('ExecuteCommand runs shell command and extends stdout', async () => {
    const shelljs = jest.requireMock('shelljs') as { exec: jest.Mock };
    (shelljs.exec as jest.Mock).mockImplementation((_cmd, _opts, cb) => cb(0, 'out', ''));

    const context = createContext({ command: 'echo ok' });
    await new ExecuteCommand().execute(context as any);

    expect(context.extend).toHaveBeenCalledWith({ stdout: 'out' });
    expect((context as any).command).toBeUndefined();
  });

  it('ExecuteCommand rejects on non-zero exit', async () => {
    const shelljs = jest.requireMock('shelljs') as { exec: jest.Mock };
    (shelljs.exec as jest.Mock).mockImplementation((_cmd, _opts, cb) => cb(1, '', 'fail'));

    const context = createContext({ command: 'exit 1' });

    await expect(new ExecuteCommand().execute(context as any)).rejects.toBe('fail');
  });

  it('DeleteLastFile removes file', async () => {
    const { deleteAsync } = jest.requireMock('del') as { deleteAsync: jest.Mock };

    const lastFile = path.join('/expanded/home', '1', 'file.mp4');
    await new DeleteLastFile().execute({ lastFile } as any);

    expect(deleteAsync).toHaveBeenCalledWith(lastFile, { force: true });
  });

  it('UploadVideo sends to telegram', async () => {
    const lastFile = path.join('/expanded/home', '1', 'file.mp4');
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
