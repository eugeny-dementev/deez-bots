import { exec } from '@libs/command';
import { YtDlpDownload, YtDlpSizes } from './yt-dlp.js';

jest.mock('@libs/command', () => {
  const actual = jest.requireActual('@libs/command');
  return {
    ...actual,
    exec: jest.fn(),
  };
});

beforeEach(() => {
  jest.clearAllMocks();
});

describe('YtDlpDownload', () => {
  it('builds command, logs, and clears temp fields', async () => {
    const execMock = exec as jest.Mock;
    execMock.mockResolvedValue('');

    const tlog = jest.fn();
    const logger = { info: jest.fn(), error: jest.fn() } as any;
    const context = {
      url: 'https://example.com/video',
      ydhome: '/home',
      ydtemp: '/tmp',
      ydres: 720,
      ydname: 'file.%(ext)s',
      tlog,
      logger,
    } as any;

    const action = new YtDlpDownload();
    await action.execute(context);

    const calledWith = execMock.mock.calls[0][0] as string;
    expect(calledWith).toContain('yt-dlp');
    expect(calledWith).toContain('-S res:720');
    expect(calledWith).toContain('--paths home:/home');
    expect(calledWith).toContain('--paths temp:/tmp');
    expect(calledWith).toContain('--output file.%(ext)s');
    expect(calledWith).toContain('https://example.com/video');
    expect(tlog).toHaveBeenCalledWith('Downloading video');
    expect(tlog).toHaveBeenCalledWith('Video downloaded');
    expect(logger.info).toHaveBeenCalled();
    expect(context.ydhome).toBeUndefined();
    expect(context.ydtemp).toBeUndefined();
    expect(context.ydres).toBeUndefined();
    expect(context.ydname).toBeUndefined();
  });

  it('routes errors through onError with parsed message', async () => {
    const action = new YtDlpDownload();
    const logger = { error: jest.fn() };
    const terr = jest.fn();
    const abort = jest.fn();

    await action.onError(new Error('ERROR: fail'), { logger, terr, abort } as any);

    expect(logger.error).toHaveBeenCalled();
    expect(terr).toHaveBeenCalled();
    expect(abort).toHaveBeenCalled();
  });
});

describe('YtDlpSizes', () => {
  it('parses sizes and extends context', async () => {
    const execMock = exec as jest.Mock;
    execMock.mockResolvedValue('hls-360p mp4 640x360 │ ~ 7.08MiB  424k m3u8');

    const extend = jest.fn();
    const logger = { info: jest.fn(), error: jest.fn() } as any;
    const context = { url: 'https://example.com', extend, logger } as any;

    const action = new YtDlpSizes();
    await action.execute(context);

    const calledWith = execMock.mock.calls[0][0] as string;
    expect(calledWith).toContain('yt-dlp');
    expect(calledWith).toContain('--no-download');
    expect(calledWith).toContain('--list-formats');
    expect(calledWith).toContain('https://example.com');
    expect(extend).toHaveBeenCalledWith({ sizes: [{ res: 360, size: 7.08 }] });
  });

  it('routes errors through onError with parsed message', async () => {
    const action = new YtDlpSizes();
    const logger = { error: jest.fn() };
    const terr = jest.fn();
    const abort = jest.fn();

    await action.onError(new Error('ERROR: bad'), { logger, terr, abort } as any);

    expect(logger.error).toHaveBeenCalled();
    expect(terr).toHaveBeenCalled();
    expect(abort).toHaveBeenCalled();
  });
});
