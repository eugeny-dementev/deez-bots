import { parseError, parseFormatsListing } from './yt-dlp.js';

describe('libs/actions', () => {
  describe('yt-dlp', () => {
    describe('parseError', () => {
      it('should remove ERROR: from error message', () => {
        const stderr = `
          ERROR: [some] someId: Unable to some some
        `
        expect(parseError(stderr)).toEqual('[some] someId: Unable to some some');
      });
    });

    describe('parseFormatsListings', () => {
      it('should extract sizes and resolutions from --list-formats output', () => {
        const stdout = `
          [info] Available formats for hcmbddob550:
          ID       EXT RESOLUTION │  FILESIZE   TBR PROTO │ VCODEC  ACODEC
          ─────────────────────────────────────────────────────────────────
          mp4-low  mp4 unknown    │                 https │ unknown unknown
          mp4-high mp4 unknown    │                 https │ unknown unknown
          hls-360p mp4 640x360    │ ~ 7.08MiB  424k m3u8  │ unknown unknown
          hls-720p mp4 1280x720   │ ~22.15MiB 1327k m3u8  │ unknown unknown
        `;

        const expectedResult = [
          { res: 720, size: 22.15 },
          { res: 360, size: 7.08 },
        ];

        expect(parseFormatsListing(stdout)).toEqual(expectedResult);
      });
    });
  });
});
