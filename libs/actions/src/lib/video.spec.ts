import { exec, prepare } from '@libs/command';
import { ExtractVideoDimensions } from './video.js';

jest.mock('@libs/command', () => {
  const actual = jest.requireActual('@libs/command');
  return {
    ...actual,
    exec: jest.fn(),
  };
});

describe('ExtractVideoDimensions', () => {
  it('parses dimensions and extends context', async () => {
    const execMock = exec as jest.Mock;
    execMock.mockResolvedValue('width=720\nheight=1280\n');

    const action = new ExtractVideoDimensions();
    const extend = jest.fn();
    const context = { filePath: '/tmp/video.mp4', extend } as any;

    await action.execute(context);

    expect(execMock).toHaveBeenCalledWith(
      prepare('ffprobe')
        .add('-v error')
        .add('-show_entries stream=width,height')
        .add('-of default=noprint_wrappers=1')
        .add('/tmp/video.mp4')
        .toString()
    );
    expect(extend).toHaveBeenCalledWith({ width: 720, height: 1280 });
  });
});
