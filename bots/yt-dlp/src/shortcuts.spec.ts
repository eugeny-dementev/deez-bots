import { shortcut } from './shortcuts.js';

describe('yt-dlp shortcuts', () => {
  it('extends context with provided object', async () => {
    const action = shortcut.extend({ a: 1 }) as any;
    const extend = jest.fn();

    await action.execute({ extend } as any);

    expect(extend).toHaveBeenCalledWith({ a: 1 });
  });
});
