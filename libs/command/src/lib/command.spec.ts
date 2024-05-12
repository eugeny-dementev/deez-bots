import { prepare, exec } from './command';

describe('libs/command', () => {
  describe('prepare', () => {
    it('should prepare commoand line for yt-dlp', () => {
      expect(prepare('yt-dlp').toString()).toEqual('yt-dlp');
    });

    it('should prepare command line for yt-dlp with args', () => {
      expect(prepare('yt-dlp').add('-S "res:720"').toString()).toEqual('yt-dlp -S "res:720"');
    });
  });

  describe('exec', () => {
    it('should execute commoand and return stdout', async () => {
      const stdout = await exec('echo hello');

      expect(stdout.trim()).toEqual('hello');
    });
  })
});
