import path from 'path';
import { getDestination } from './torrent.js';

jest.mock('./config.js', () => ({
  moviesDir: '/movies',
  tvshowsDir: '/tv',
  qMoviesDir: '/qmovies',
  qTvshowsDir: '/qtv',
}), { virtual: true });

const makeFile = (filePath: string) => ({
  path: filePath,
  name: path.basename(filePath),
  length: 0,
  offset: 0,
});

describe('getDestination', () => {
  it('accepts single mkv movie in root', () => {
    const dest = getDestination([makeFile('Movie.mkv')]);

    expect(dest).toEqual({ qdir: '/qmovies', fdir: '/movies' });
  });

  it('accepts mkv files in one folder as tv shows', () => {
    const files = [
      makeFile(path.join('Show', 'ep1.mkv')),
      makeFile(path.join('Show', 'ep2.mkv')),
    ];
    const dest = getDestination(files);

    expect(dest).toEqual({ qdir: '/qtv', fdir: '/tv' });
  });

  it('accepts single mkv tv show in root by pattern', () => {
    const dest = getDestination([makeFile('Show.S01E01.mkv')]);

    expect(dest).toEqual({ qdir: '/qtv', fdir: '/tv' });
  });

  it('accepts single mp4 movie in root', () => {
    const dest = getDestination([makeFile('Movie.mp4')]);

    expect(dest).toEqual({ qdir: '/qmovies', fdir: '/movies' });
  });

  it('accepts multiple mp4 files in root as tv shows', () => {
    const files = [
      makeFile('Show.S01E01.mp4'),
      makeFile('Show.S01E02.mp4'),
    ];
    const dest = getDestination(files);

    expect(dest).toEqual({ qdir: '/qtv', fdir: '/tv' });
  });

  const invalidCases = [
    {
      name: 'rejects mp4 files stored in folders',
      files: [makeFile(path.join('Show', 'ep1.mp4'))],
      message: 'MP4 torrents should contain files in the root folder only',
    },
    {
      name: 'rejects mixed mkv and mp4 files',
      files: [makeFile('Movie.mp4'), makeFile('Movie.mkv')],
      message: 'Torrent should not mix *.mkv and *.mp4 files',
    },
    {
      name: 'rejects mp4 torrents with subtitle sidecars',
      files: [makeFile('Movie.mp4'), makeFile('Movie.srt')],
      message: 'Torrent should contain only *.mkv or *.mp4 files',
    },
    {
      name: 'rejects mp4 torrents with audio sidecars',
      files: [makeFile('Movie.mp4'), makeFile('Movie.mka')],
      message: 'Torrent should contain only *.mkv or *.mp4 files',
    },
    {
      name: 'rejects mkv torrents with subtitle sidecars',
      files: [
        makeFile(path.join('Show', 'ep1.mkv')),
        makeFile(path.join('Show', 'ep1.ass')),
      ],
      message: 'Torrent should contain only *.mkv or *.mp4 files',
    },
    {
      name: 'rejects mkv torrents with nested folders',
      files: [makeFile(path.join('Show', 'Season1', 'ep1.mkv'))],
      message: 'torrent should contain no more than one directory with *.mkv files in it',
    },
    {
      name: 'rejects mp4 torrents with nested folders',
      files: [makeFile(path.join('Show', 'Season1', 'ep1.mp4'))],
      message: 'MP4 torrents should contain files in the root folder only',
    },
    {
      name: 'rejects files missing extensions',
      files: [makeFile('Movie')],
      message: 'Torrent should contain only *.mkv or *.mp4 files',
    },
    {
      name: 'rejects mp4 torrents with extra non-video files',
      files: [makeFile('Movie.mp4'), makeFile('readme.nfo')],
      message: 'Torrent should contain only *.mkv or *.mp4 files',
    },
  ];

  it.each(invalidCases)('$name', ({ files, message }) => {
    expect(() => getDestination(files)).toThrow(message);
  });
});
