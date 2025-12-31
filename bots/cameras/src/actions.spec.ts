import path from 'path';
import { exec } from '@libs/command';
import { DeleteFile, PrepareFilePath, RecordRoom, UploadVideo } from './actions.js';

jest.mock('./config.js', () => ({
  swapDir: '/swap',
  cameraCorridorUrl: 'http://camera/stream',
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

jest.mock('grammy', () => ({
  InputFile: class InputFile {
    path: string;
    constructor(pathValue: string) {
      this.path = pathValue;
    }
  },
}));

describe('cameras actions', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('PrepareFilePath builds file path and extends context', async () => {
    jest.spyOn(Date, 'now').mockReturnValue(12345);

    const action = new PrepareFilePath();
    const extend = jest.fn();
    const logger = { info: jest.fn() };
    const context = { room: 'corridor', extend, logger } as any;

    await action.execute(context);

    expect(extend).toHaveBeenCalledWith({
      filePath: path.join('/swap', 'corridor_12345.mp4'),
    });
    expect(logger.info).toHaveBeenCalled();

    (Date.now as jest.Mock).mockRestore();
  });

  it('RecordRoom executes ffmpeg command', async () => {
    const action = new RecordRoom();
    const tlog = jest.fn();
    const logger = { info: jest.fn() };
    const context = { filePath: '/swap/test.mp4', tlog, logger } as any;

    await action.execute(context);

    expect(exec).toHaveBeenCalledWith(expect.stringContaining('ffmpeg'));
    expect(exec).toHaveBeenCalledWith(expect.stringContaining('http://camera/stream'));
    expect(tlog).toHaveBeenCalledWith('Room recorded');
  });

  it('DeleteFile removes the file', async () => {
    const action = new DeleteFile();
    await action.execute({ filePath: '/swap/test.mp4' } as any);

    const { deleteAsync } = jest.requireMock('del') as { deleteAsync: jest.Mock };
    expect(deleteAsync).toHaveBeenCalledWith('/swap/test.mp4', { force: true });
  });

  it('UploadVideo sends video to telegram', async () => {
    const action = new UploadVideo();
    const bot = { api: { sendVideo: jest.fn() } };
    const tlog = jest.fn();
    const logger = { info: jest.fn() };
    const context = {
      filePath: '/swap/test.mp4',
      chatId: 1,
      width: 640,
      height: 480,
      bot,
      tlog,
      logger,
    } as any;

    await action.execute(context);

    expect(bot.api.sendVideo).toHaveBeenCalled();
    expect(tlog).toHaveBeenCalledWith('Video uploaded');
  });
});
