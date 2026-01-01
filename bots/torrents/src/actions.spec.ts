import path from 'path';
import { exec } from '@libs/command';
import {
  AddUploadToQBitTorrent,
  CheckTopicInDB,
  CheckTorrentFile,
  ClearSearchResults,
  DeleteFile,
  DownloadFile,
  DownloadSearchResultFile,
  DownloadTopicFile,
  ExtractTorrentPattern,
  Log,
  MonitorDownloadingProgress,
  ReadTorrentFile,
  RemoveOldTorrentItem,
  RenameFile,
  ReplySearchResults,
  ResolveSearchResult,
  ScheduleNextCheck,
  SearchByQuery,
  SearchTopic,
  SendTorrentFile,
  SetLastCheckedDate,
  StoreSearchResults,
  UpdateSearchResultTitles,
  ConvertMultiTrack,
} from './actions.js';

jest.mock('./config.js', () => ({
  qBitTorrentHost: 'http://qb',
  downloadsDir: '/downloads',
  jackettHost: 'http://jackett',
  jackettKey: 'key',
  moviesDir: '/movies',
  tvshowsDir: '/tv',
  rawShowsDir: '/raw',
  qRawShowsDir: '/qraw',
}), { virtual: true });

jest.mock('@libs/command', () => {
  const actual = jest.requireActual('@libs/command');
  return {
    ...actual,
    exec: jest.fn(),
  };
});

jest.mock('fs', () => ({
  readFile: jest.fn(),
  unlink: jest.fn(),
  createWriteStream: jest.fn(),
}));

jest.mock('node:stream', () => {
  const actual = jest.requireActual('node:stream');
  return {
    ...actual,
    Readable: {
      ...actual.Readable,
      fromWeb: jest.fn(() => ({
        pipe: jest.fn(() => ({})),
      })),
    },
  };
});

jest.mock('node:stream/promises', () => ({
  finished: jest.fn().mockResolvedValue(undefined),
}));

jest.mock('parse-torrent', () => ({
  __esModule: true,
  default: jest.fn(),
}), { virtual: true });


jest.mock('./multi-track.js', () => ({
  __esModule: true,
  default: jest.fn(),
}));

jest.mock('./search-store.js', () => ({
  setSearchResults: jest.fn(),
  getSearchResults: jest.fn(),
  clearSearchResults: jest.fn(),
}));

jest.mock('./db.js', () => ({
  DB: jest.fn(),
}));

jest.mock('./torrent.js', () => ({
  getDestination: jest.fn(),
}));

jest.mock('glob', () => ({
  glob: { glob: jest.fn() },
}));

jest.mock('./helpers.js', () => ({
  fileExists: jest.fn(),
  getDirMaps: jest.fn(),
  omit: jest.fn((obj: object) => obj),
  russianLetters: new Set(['а']),
  russianToEnglish: { а: 'a' },
  sleep: jest.fn(() => Promise.resolve()),
  wildifySquareBrackets: jest.fn((value: string) => value),
}));

jest.mock('grammy', () => {
  class InlineKeyboardMock {
    static instances: InlineKeyboardMock[] = [];
    texts: string[] = [];

    constructor() {
      InlineKeyboardMock.instances.push(this);
    }

    text(label: string) {
      this.texts.push(label);
      return this;
    }

    row() {
      return this;
    }
  }

  class InputFileMock {
    path: string;
    constructor(pathValue: string) {
      this.path = pathValue;
    }
  }

  return { InlineKeyboard: InlineKeyboardMock, InputFile: InputFileMock };
});

const InlineKeyboardMock = (jest.requireMock('grammy') as { InlineKeyboard: any }).InlineKeyboard;

type Logger = { info: jest.Mock; warn: jest.Mock; error: jest.Mock; debug: jest.Mock; verbose: jest.Mock };

const createLogger = (): Logger => ({
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
  debug: jest.fn(),
  verbose: jest.fn(),
});

const createContext = (overrides: Record<string, unknown> = {}) => ({
  extend: jest.fn(),
  abort: jest.fn(),
  tlog: jest.fn(),
  tadd: jest.fn(),
  terr: jest.fn(),
  logger: createLogger(),
  bot: { api: { sendMessage: jest.fn(), sendDocument: jest.fn(), editMessageReplyMarkup: jest.fn() } },
  chatId: 1,
  adminId: 2,
  ...overrides,
});

const getFetchMock = () => (globalThis as any).fetch as jest.Mock;

const mockFetchResponse = (overrides: Record<string, unknown> = {}) => ({
  ok: true,
  status: 200,
  statusText: 'OK',
  type: 'basic',
  json: jest.fn().mockResolvedValue({}),
  text: jest.fn().mockResolvedValue(''),
  ...overrides,
});

describe('torrents actions', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (global as any).fetch = jest.fn();
    InlineKeyboardMock.instances = [];
  });

  it('RenameFile sanitizes filename and extends context', async () => {
    const context = createContext({ fileName: 'My File.torrent' });

    await new RenameFile().execute(context as any);

    expect(context.extend).toHaveBeenCalledWith({ fileName: 'my_file..torrent' });
  });

  it('RenameFile transliterates russian letters', async () => {
    const context = createContext({ fileName: 'А test.torrent' });

    await new RenameFile().execute(context as any);

    expect(context.extend).toHaveBeenCalledWith({ fileName: 'a_test..torrent' });
  });

  it('DownloadFile downloads to downloads dir', async () => {
    const file = { download: jest.fn() };
    const context = createContext({ fileName: 'file.torrent', file });

    await new DownloadFile().execute(context as any);

    expect(file.download).toHaveBeenCalledWith(path.join('/downloads', 'file.torrent'));
    expect(context.extend).toHaveBeenCalledWith({ filePath: path.join('/downloads', 'file.torrent') });
  });

  it('AddUploadToQBitTorrent uploads torrent through API with savepath and category', async () => {
    const fetchMock = getFetchMock();
    fetchMock.mockResolvedValueOnce(mockFetchResponse({ ok: true }));

    const fs = jest.requireMock('fs') as { readFile: jest.Mock };
    fs.readFile.mockImplementation((_path, cb) => cb(null, Buffer.from('torrent')));

    const context = createContext({
      qdir: '/qtv',
      fdir: '/tv',
      filePath: '/downloads/file.torrent',
    });

    await new AddUploadToQBitTorrent().execute(context as any);

    expect(fetchMock).toHaveBeenCalledWith('http://qb/api/v2/torrents/add', expect.anything());
    const request = fetchMock.mock.calls[0][1] as { body: unknown; method: string };
    expect(request.method).toBe('POST');

    const entries = Array.from((request.body as any).entries());
    const savepathEntry = entries.find(([key]) => key === 'savepath');
    const categoryEntry = entries.find(([key]) => key === 'category');

    expect(savepathEntry?.[1]).toBe('/qtv');
    expect(categoryEntry?.[1]).toBe('TV Show');
    expect(context.tlog).toHaveBeenCalledWith('Torrent file submitted');
  });

  it('AddUploadToQBitTorrent sets raw tv show category', async () => {
    const fetchMock = getFetchMock();
    fetchMock.mockResolvedValueOnce(mockFetchResponse({ ok: true }));

    const fs = jest.requireMock('fs') as { readFile: jest.Mock };
    fs.readFile.mockImplementation((_path, cb) => cb(null, Buffer.from('torrent')));

    const context = createContext({
      qdir: '/qraw',
      fdir: '/raw',
      filePath: '/downloads/file.torrent',
    });

    await new AddUploadToQBitTorrent().execute(context as any);

    const request = fetchMock.mock.calls[0][1] as { body: unknown };
    const entries = Array.from((request.body as any).entries());
    const categoryEntry = entries.find(([key]) => key === 'category');

    expect(categoryEntry?.[1]).toBe('RAW TV Show');
  });

  it('AddUploadToQBitTorrent sets raw movie category when qdir matches', async () => {
    const fetchMock = getFetchMock();
    fetchMock.mockResolvedValueOnce(mockFetchResponse({ ok: true }));

    const fs = jest.requireMock('fs') as { readFile: jest.Mock };
    fs.readFile.mockImplementation((_path, cb) => cb(null, Buffer.from('torrent')));

    const context = createContext({
      qdir: '/raw-movies',
      fdir: '/raw-movies',
      filePath: '/downloads/file.torrent',
    });

    await new AddUploadToQBitTorrent().execute(context as any);

    const request = fetchMock.mock.calls[0][1] as { body: unknown };
    const entries = Array.from((request.body as any).entries());
    const categoryEntry = entries.find(([key]) => key === 'category');

    expect(categoryEntry?.[1]).toBe('RAW Movie');
  });

  it('AddUploadToQBitTorrent onError reports failure', async () => {
    const context = createContext();

    await new AddUploadToQBitTorrent().onError(new Error('boom'), context as any);

    expect(context.tlog).toHaveBeenCalledWith('Failed to add torrent to download');
    expect(context.abort).toHaveBeenCalled();
  });

  it('CheckTorrentFile skips for multi-track', async () => {
    const parseTorrent = jest.fn();
    const context = createContext({ type: 'multi-track', filePath: '/downloads/file.torrent', parseTorrent });

    await new CheckTorrentFile().execute(context as any);

    expect(parseTorrent).not.toHaveBeenCalled();
  });

  it('CheckTorrentFile detects TV show', async () => {
    const fs = jest.requireMock('fs') as { readFile: jest.Mock };
    fs.readFile.mockImplementation((_path, cb) => cb(null, Buffer.from('torrent')));

    const parseTorrent = jest.fn().mockReturnValue({ files: [] });

    const { getDestination } = jest.requireMock('./torrent.js') as { getDestination: jest.Mock };
    getDestination.mockReturnValue({ qdir: '/q', fdir: '/tv' });

    const context = createContext({ filePath: '/downloads/file.torrent', parseTorrent });

    await new CheckTorrentFile().execute(context as any);

    expect(context.tlog).toHaveBeenCalledWith('Torrent parsed, TV Show detected');
    expect(context.extend).toHaveBeenCalledWith({ qdir: '/q', fdir: '/tv' });
  });

  it('CheckTorrentFile detects Movie', async () => {
    const fs = jest.requireMock('fs') as { readFile: jest.Mock };
    fs.readFile.mockImplementation((_path, cb) => cb(null, Buffer.from('torrent')));

    const parseTorrent = jest.fn().mockReturnValue({ files: [] });

    const { getDestination } = jest.requireMock('./torrent.js') as { getDestination: jest.Mock };
    getDestination.mockReturnValue({ qdir: '/q', fdir: '/movies' });

    const context = createContext({ filePath: '/downloads/file.torrent', parseTorrent });

    await new CheckTorrentFile().execute(context as any);

    expect(context.tlog).toHaveBeenCalledWith('Torrent parsed, Movie detected');
  });

  it('CheckTorrentFile reports unsupported type', async () => {
    const fs = jest.requireMock('fs') as { readFile: jest.Mock };
    fs.readFile.mockImplementation((_path, cb) => cb(null, Buffer.from('torrent')));

    const parseTorrent = jest.fn().mockReturnValue({ files: [] });

    const { getDestination } = jest.requireMock('./torrent.js') as { getDestination: jest.Mock };
    getDestination.mockReturnValue({ qdir: '/q', fdir: '/unknown' });

    const context = createContext({ filePath: '/downloads/file.torrent', parseTorrent });

    await new CheckTorrentFile().execute(context as any);

    expect(context.tlog).toHaveBeenCalledWith('Unsupported torrent detected');
  });

  it('CheckTorrentFile onError reports failure', async () => {
    const context = createContext();

    await new CheckTorrentFile().onError(new Error('boom'), context as any);

    expect(context.tlog).toHaveBeenCalledWith('Torrent file parsing failed');
    expect(context.abort).toHaveBeenCalled();
  });

  it('ExtractTorrentPattern extends torrent name and tracks', async () => {
    const fs = jest.requireMock('fs') as { readFile: jest.Mock };
    fs.readFile.mockImplementation((_path, cb) => cb(null, Buffer.from('torrent')));

    const parseTorrent = jest.fn().mockReturnValue({
      name: 'Show',
      files: [{ path: path.join('Show', 'ep1.mkv') }],
    });

    const multiTrack = (jest.requireMock('./multi-track.js') as { default: jest.Mock }).default;
    multiTrack.mockReturnValue({ video: 'Show/*.mkv', audio: null, subs: null });

    const context = createContext({ filePath: '/downloads/file.torrent', parseTorrent });

    await new ExtractTorrentPattern().execute(context as any);

    expect(context.extend).toHaveBeenCalledWith({ torrentName: 'Show' });
  });

  it('ExtractTorrentPattern marks multi-track torrents', async () => {
    const fs = jest.requireMock('fs') as { readFile: jest.Mock };
    fs.readFile.mockImplementation((_path, cb) => cb(null, Buffer.from('torrent')));

    const parseTorrent = jest.fn().mockReturnValue({
      name: 'Show',
      files: [{ path: path.join('Show', 'ep1.mkv') }],
    });

    const multiTrack = (jest.requireMock('./multi-track.js') as { default: jest.Mock }).default;
    multiTrack.mockReturnValue({ video: 'Show/*.mkv', audio: 'Show/*.mka', subs: null });

    const context = createContext({ filePath: '/downloads/file.torrent', parseTorrent });

    await new ExtractTorrentPattern().execute(context as any);

    expect(context.extend).toHaveBeenCalledWith({ torrentName: 'Show' });
    expect(context.extend).toHaveBeenCalledWith({
      qdir: '/qraw',
      fdir: '/raw',
      type: 'multi-track',
      tracks: { video: 'Show/*.mkv', audio: 'Show/*.mka', subs: null },
      torrentDirName: 'Show',
    });
  });

  it('ConvertMultiTrack skips existing output', async () => {
    const helpers = jest.requireMock('./helpers.js') as { fileExists: jest.Mock; getDirMaps: jest.Mock };
    helpers.fileExists.mockResolvedValue(true);
    helpers.getDirMaps.mockResolvedValue([]);

    const globModule = jest.requireMock('glob') as { glob: { glob: jest.Mock } };
    globModule.glob.glob
      .mockResolvedValueOnce([path.join('/tv', 'Show', 'ep1.mkv')])
      .mockResolvedValueOnce([path.join('/tv', 'Show', 'ep1.mka')])
      .mockResolvedValueOnce([path.join('/tv', 'Show', 'ep1.ass')]);

    const context = createContext({
      fdir: '/tv',
      tracks: { video: 'Show/*.mkv', audio: 'Show/*.mka', subs: 'Show/*.ass' },
      torrentDirName: 'Show',
    });

    await new ConvertMultiTrack().execute(context as any);

    expect(exec).not.toHaveBeenCalled();
    expect(context.tlog).toHaveBeenCalled();
  });

  it('ConvertMultiTrack skips files missing audio when required', async () => {
    const helpers = jest.requireMock('./helpers.js') as { fileExists: jest.Mock; getDirMaps: jest.Mock };
    helpers.fileExists.mockResolvedValue(false);
    helpers.getDirMaps.mockResolvedValue([{ from: 'Show', to: 'ShowName' }]);

    const globModule = jest.requireMock('glob') as { glob: { glob: jest.Mock } };
    globModule.glob.glob
      .mockResolvedValueOnce([
        path.join('/tv', 'Show', 'ep1.mkv'),
        path.join('/tv', 'Show', 'ep2.mkv'),
      ])
      .mockResolvedValueOnce([path.join('/tv', 'Show', 'ep1.mka')])
      .mockResolvedValueOnce([path.join('/tv', 'Show', 'ep1.ass')]);

    const context = createContext({
      fdir: '/tv',
      tracks: { video: 'Show/*.mkv', audio: 'Show/*.mka', subs: 'Show/*.ass' },
      torrentDirName: 'Show',
    });

    await new ConvertMultiTrack().execute(context as any);

    expect(exec).toHaveBeenCalledTimes(1);
    expect(context.tadd).toHaveBeenCalledWith('-');
  });

  it('ReadTorrentFile extends torrent name', async () => {
    const fs = jest.requireMock('fs') as { readFile: jest.Mock };
    fs.readFile.mockImplementation((_path, cb) => cb(null, Buffer.from('torrent')));

    const parseTorrent = jest.fn().mockReturnValue({ name: 'Show' });

    const context = createContext({ filePath: '/downloads/file.torrent', parseTorrent });

    await new ReadTorrentFile().execute(context as any);

    expect(context.tadd).toHaveBeenCalledWith('Torrent name: Show');
    expect(context.extend).toHaveBeenCalledWith({ torrentName: 'Show' });
  });

  it('RemoveOldTorrentItem logs when no torrents found', async () => {
    const fetchMock = getFetchMock();
    fetchMock.mockResolvedValueOnce(mockFetchResponse({ text: jest.fn().mockResolvedValue('[]') }));

    const context = createContext({ torrentName: 'Show', filePath: '/downloads/file.torrent' });

    await new RemoveOldTorrentItem().execute(context as any);

    expect(context.logger.error).toHaveBeenCalled();
  });

  it('RemoveOldTorrentItem returns when single torrent found', async () => {
    const fetchMock = getFetchMock();
    fetchMock.mockResolvedValueOnce(mockFetchResponse({
      text: jest.fn().mockResolvedValue(JSON.stringify([
        { name: 'Show', added_on: 1, progress: 1, hash: 'a' },
      ])),
    }));

    const context = createContext({ torrentName: 'Show', filePath: '/downloads/file.torrent' });

    await new RemoveOldTorrentItem().execute(context as any);

    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('RemoveOldTorrentItem deletes older torrents', async () => {
    const fetchMock = getFetchMock();
    fetchMock
      .mockResolvedValueOnce(mockFetchResponse({
        text: jest.fn().mockResolvedValue(JSON.stringify([
          { name: 'Show', added_on: 2, progress: 1, hash: 'new' },
          { name: 'Show', added_on: 1, progress: 1, hash: 'old' },
        ])),
      }))
      .mockResolvedValueOnce(mockFetchResponse({ ok: true }));

    const context = createContext({ torrentName: 'Show', filePath: '/downloads/file.torrent' });

    await new RemoveOldTorrentItem().execute(context as any);

    expect(fetchMock).toHaveBeenCalledWith('http://qb/api/v2/torrents/delete', expect.anything());
    expect(context.tadd).toHaveBeenCalled();
  });

  it('MonitorDownloadingProgress reports progress and completion', async () => {
    const fetchMock = getFetchMock();
    fetchMock
      .mockResolvedValueOnce(mockFetchResponse({
        text: jest.fn().mockResolvedValue(JSON.stringify([
          { name: 'Show', progress: 0.5 },
        ])),
      }))
      .mockResolvedValueOnce(mockFetchResponse({ text: jest.fn().mockResolvedValue('[]') }));

    const context = createContext({ torrentName: 'Show' });

    await new MonitorDownloadingProgress().execute(context as any);

    expect(context.tlog).toHaveBeenCalledWith('Show progress: 50%');
    expect(context.tlog).toHaveBeenCalledWith('Show downloaded');
  });

  it('MonitorDownloadingProgress exits when torrent is missing', async () => {
    const fetchMock = getFetchMock();
    fetchMock.mockResolvedValueOnce(mockFetchResponse({
      text: jest.fn().mockResolvedValue(JSON.stringify([
        { name: 'Other', progress: 0.2 },
      ])),
    }));

    const context = createContext({ torrentName: 'Show' });

    await new MonitorDownloadingProgress().execute(context as any);

    expect(context.tlog).toHaveBeenCalledWith('Show downloaded');
  });

  it('MonitorDownloadingProgress onError reports failure', async () => {
    const context = createContext();

    await new MonitorDownloadingProgress().onError(new Error('boom'), context as any);

    expect(context.tlog).toHaveBeenCalledWith('Monitoring failed');
    expect(context.abort).toHaveBeenCalled();
  });

  it('DeleteFile unlinks file', async () => {
    const fs = jest.requireMock('fs') as { unlink: jest.Mock };
    fs.unlink.mockImplementation((_path, cb) => cb(null));
    const context = createContext({ filePath: '/downloads/file.torrent' });

    await new DeleteFile().execute(context as any);

    expect(fs.unlink).toHaveBeenCalledWith('/downloads/file.torrent', expect.any(Function));
  });

  it('SearchByQuery aborts on failed response', async () => {
    const fetchMock = getFetchMock();
    fetchMock.mockResolvedValueOnce(mockFetchResponse({ ok: false, statusText: 'Bad' }));

    const context = createContext({ query: 'Show' });

    await new SearchByQuery().execute(context as any);

    expect(context.tlog).toHaveBeenCalledWith('Search failed. Try again later.');
    expect(context.abort).toHaveBeenCalled();
  });

  it('SearchByQuery aborts when no results', async () => {
    const fetchMock = getFetchMock();
    fetchMock.mockResolvedValueOnce(mockFetchResponse({ json: jest.fn().mockResolvedValue({ Results: [] }) }));

    const context = createContext({ query: 'Show 1080p' });

    await new SearchByQuery().execute(context as any);

    expect(context.tlog).toHaveBeenCalledWith('No results for "Show 1080p".');
    expect(context.abort).toHaveBeenCalled();
  });

  it('SearchByQuery dedupes and limits results', async () => {
    const fetchMock = getFetchMock();
    fetchMock.mockResolvedValueOnce(mockFetchResponse({
      json: jest.fn().mockResolvedValue({
        Results: [
          { Guid: '1', Title: 'A' },
          { Guid: '1', Title: 'A' },
          { Guid: '2', Title: 'B' },
        ],
      }),
    }));

    const context = createContext({ query: 'Show 1080p' });

    await new SearchByQuery().execute(context as any);

    expect(context.extend).toHaveBeenCalledWith({ results: [{ Guid: '1', Title: 'A' }, { Guid: '2', Title: 'B' }] });
  });

  it('SearchByQuery tries resolution fallbacks when missing', async () => {
    const fetchMock = getFetchMock();
    fetchMock.mockResolvedValueOnce(mockFetchResponse({
      json: jest.fn().mockResolvedValue({
        Results: [
          { Guid: '1', Title: 'A' },
          { Guid: '2', Title: 'B' },
          { Guid: '3', Title: 'C' },
          { Guid: '4', Title: 'D' },
          { Guid: '5', Title: 'E' },
        ],
      }),
    }));

    const context = createContext({ query: 'Show' });

    await new SearchByQuery().execute(context as any);

    expect(fetchMock.mock.calls[0][0]).toContain('Show%202160p');
  });

  it('SearchByQuery onError reports failure', async () => {
    const context = createContext();

    await new SearchByQuery().onError(new Error('boom'), context as any);

    expect(context.tlog).toHaveBeenCalledWith('Search failed. Try again later.');
    expect(context.abort).toHaveBeenCalled();
  });

  it('UpdateSearchResultTitles uses Wikidata label in user language', async () => {
    const fetchMock = getFetchMock();
    fetchMock
      .mockResolvedValueOnce(mockFetchResponse({
        json: jest.fn().mockResolvedValue({ search: [{ id: 'Q1' }] }),
      }))
      .mockResolvedValueOnce(mockFetchResponse({
        json: jest.fn().mockResolvedValue({
          entities: {
            Q1: { labels: { ru: { value: 'Legenda Hei' }, en: { value: 'The Legend of Hei' } } },
          },
        }),
      }));

    const context = createContext({
      results: [{ Guid: 'g1', Link: 'l1', PublishDate: 'd1', Title: 'The Legend of Hei (2019)' }],
      language: 'ru',
    });

    await new UpdateSearchResultTitles().execute(context as any);

    expect(context.extend).toHaveBeenCalledWith({
      results: [{ Guid: 'g1', Link: 'l1', PublishDate: 'd1', Title: 'Legenda Hei (2019)' }],
    });
  });

  it('UpdateSearchResultTitles keeps title when Wikidata has no match', async () => {
    const fetchMock = getFetchMock();
    fetchMock.mockResolvedValue(mockFetchResponse({
      json: jest.fn().mockResolvedValue({ search: [] }),
    }));

    const context = createContext({
      results: [{ Guid: 'g1', Link: 'l1', PublishDate: 'd1', Title: 'Unknown Movie 2024' }],
      language: 'en',
    });

    await new UpdateSearchResultTitles().execute(context as any);

    expect(context.extend).toHaveBeenCalledWith({
      results: [{ Guid: 'g1', Link: 'l1', PublishDate: 'd1', Title: 'Unknown Movie 2024' }],
    });
  });

  it('StoreSearchResults caches top results', async () => {
    const store = jest.requireMock('./search-store.js') as { setSearchResults: jest.Mock };
    const results = Array.from({ length: 6 }, (_v, index) => ({ Guid: String(index) }));
    const context = createContext({ results, query: 'Show', messageId: 10 });

    await new StoreSearchResults().execute(context as any);

    expect(store.setSearchResults).toHaveBeenCalledWith(1, 'Show', results.slice(0, 5), 10);
    expect(context.extend).toHaveBeenCalledWith({ results: results.slice(0, 5) });
  });

  it('ReplySearchResults sends message with buttons', async () => {
    const results = [
      { Title: 'Short title' },
      { Title: 'Long '.repeat(20) },
    ];
    const context = createContext({
      results,
      query: 'Show',
      bot: { api: { sendMessage: jest.fn().mockResolvedValue({ message_id: 123 }) } },
    });

    await new ReplySearchResults().execute(context as any);

    expect(context.bot.api.sendMessage).toHaveBeenCalled();
    expect(InlineKeyboardMock.instances[0].texts.length).toBe(3);
    expect(InlineKeyboardMock.instances[0].texts[1]).toContain('...');
    expect(context.extend).toHaveBeenCalledWith({ messageId: expect.any(Number) });
  });

  it('ResolveSearchResult aborts when no cache', async () => {
    const store = jest.requireMock('./search-store.js') as { getSearchResults: jest.Mock };
    store.getSearchResults.mockReturnValue(undefined);

    const context = createContext({ index: 1 });

    await new ResolveSearchResult().execute(context as any);

    expect(context.tlog).toHaveBeenCalledWith('No recent search results. Send a text query first.');
    expect(context.abort).toHaveBeenCalled();
  });

  it('ResolveSearchResult aborts on invalid index', async () => {
    const store = jest.requireMock('./search-store.js') as { getSearchResults: jest.Mock };
    store.getSearchResults.mockReturnValue({ results: [{ Title: 'A' }] });

    const context = createContext({ index: 2 });

    await new ResolveSearchResult().execute(context as any);

    expect(context.tlog).toHaveBeenCalledWith('Invalid id. Use /get <1-1> from the latest search.');
    expect(context.abort).toHaveBeenCalled();
  });

  it('ResolveSearchResult extends with selected result', async () => {
    const store = jest.requireMock('./search-store.js') as { getSearchResults: jest.Mock };
    const result = { Title: 'A' };
    store.getSearchResults.mockReturnValue({ results: [result] });

    const context = createContext({ index: 1 });

    await new ResolveSearchResult().execute(context as any);

    expect(context.extend).toHaveBeenCalledWith({ result });
  });

  it('DownloadSearchResultFile aborts when download fails', async () => {
    const fetchMock = getFetchMock();
    fetchMock.mockResolvedValueOnce(mockFetchResponse({ ok: false, statusText: 'Bad' }));

    const context = createContext({ result: { Title: 'Test', Link: 'http://file' } });

    await new DownloadSearchResultFile().execute(context as any);

    expect(context.tlog).toHaveBeenCalledWith('Failed to download torrent file.');
    expect(context.abort).toHaveBeenCalled();
  });

  it('DownloadSearchResultFile downloads and stores file path', async () => {
    const fetchMock = getFetchMock();
    fetchMock.mockResolvedValueOnce(mockFetchResponse({
      body: {},
    }));

    const fs = jest.requireMock('fs') as { createWriteStream: jest.Mock };
    fs.createWriteStream.mockReturnValue({});

    const context = createContext({ result: { Title: 'Test', Link: '/dl/test' } });

    await new DownloadSearchResultFile().execute(context as any);

    expect(context.extend).toHaveBeenCalledWith({ filePath: expect.stringContaining('.torrent') });
  });

  it('DownloadSearchResultFile uses fallback filename when sanitized is empty', async () => {
    jest.spyOn(Date, 'now').mockReturnValue(1000);
    const fetchMock = getFetchMock();
    fetchMock.mockResolvedValueOnce(mockFetchResponse({
      body: {},
    }));

    const fs = jest.requireMock('fs') as { createWriteStream: jest.Mock };
    fs.createWriteStream.mockReturnValue({});

    const context = createContext({ result: { Title: '###', Link: '/dl/test' } });

    await new DownloadSearchResultFile().execute(context as any);

    expect(context.extend).toHaveBeenCalledWith({ filePath: expect.stringContaining('torrent_1000.torrent') });
    (Date.now as jest.Mock).mockRestore();
  });

  it('DownloadSearchResultFile onError reports failure', async () => {
    const context = createContext();

    await new DownloadSearchResultFile().onError(new Error('boom'), context as any);

    expect(context.tlog).toHaveBeenCalledWith('Failed to download torrent file.');
    expect(context.abort).toHaveBeenCalled();
  });

  it('SendTorrentFile sends document', async () => {
    const context = createContext({ filePath: '/downloads/file.torrent' });

    await new SendTorrentFile().execute(context as any);

    expect(context.bot.api.sendDocument).toHaveBeenCalled();
  });

  it('ClearSearchResults clears cache and keyboard', async () => {
    const store = jest.requireMock('./search-store.js') as { getSearchResults: jest.Mock; clearSearchResults: jest.Mock };
    store.getSearchResults.mockReturnValue({ messageId: 5 });
    const context = createContext();

    await new ClearSearchResults().execute(context as any);

    expect(context.bot.api.editMessageReplyMarkup).toHaveBeenCalledWith(1, 5, { reply_markup: { inline_keyboard: [] } });
    expect(store.clearSearchResults).toHaveBeenCalledWith(1);
  });

  it('ClearSearchResults handles missing messageId', async () => {
    const store = jest.requireMock('./search-store.js') as { getSearchResults: jest.Mock; clearSearchResults: jest.Mock };
    store.getSearchResults.mockReturnValue(undefined);
    const context = createContext();

    await new ClearSearchResults().execute(context as any);

    expect(context.bot.api.editMessageReplyMarkup).not.toHaveBeenCalled();
    expect(store.clearSearchResults).toHaveBeenCalledWith(1);
  });

  it('SearchTopic aborts on failed response', async () => {
    const fetchMock = getFetchMock();
    fetchMock.mockResolvedValueOnce(mockFetchResponse({ ok: false, statusText: 'Bad' }));

    const context = createContext({ topicConfig: { query: 'Show', guid: 'g1' } });

    await new SearchTopic().execute(context as any);

    expect(context.abort).toHaveBeenCalled();
  });

  it('SearchTopic reports not found for empty results', async () => {
    const fetchMock = getFetchMock();
    fetchMock.mockResolvedValueOnce(mockFetchResponse({ json: jest.fn().mockResolvedValue({ Results: [] }) }));

    const dbModule = jest.requireMock('./db.js') as { DB: jest.Mock };
    dbModule.DB.mockImplementation(() => ({
      findTopic: jest.fn().mockResolvedValue(undefined),
      addTopic: jest.fn(),
      updateLastCheckDateTopic: jest.fn(),
    }));

    const context = createContext({ topicConfig: { query: 'Show', guid: 'g1' } });

    await new SearchTopic().execute(context as any);

    expect(context.tadd).toHaveBeenCalled();
    expect(context.abort).toHaveBeenCalled();
  });

  it('SearchTopic reports not found for missing guid', async () => {
    const fetchMock = getFetchMock();
    fetchMock.mockResolvedValueOnce(mockFetchResponse({
      json: jest.fn().mockResolvedValue({ Results: [{ Guid: 'g2', Link: 'l', PublishDate: 'd', Title: 't' }] }),
    }));

    const dbModule = jest.requireMock('./db.js') as { DB: jest.Mock };
    dbModule.DB.mockImplementation(() => ({
      findTopic: jest.fn().mockResolvedValue(undefined),
      addTopic: jest.fn(),
      updateLastCheckDateTopic: jest.fn(),
    }));

    const context = createContext({ topicConfig: { query: 'Show', guid: 'g1' } });

    await new SearchTopic().execute(context as any);

    expect(context.tadd).toHaveBeenCalled();
    expect(context.abort).toHaveBeenCalled();
  });

  it('SearchTopic extends topic when found', async () => {
    const fetchMock = getFetchMock();
    fetchMock.mockResolvedValueOnce(mockFetchResponse({
      json: jest.fn().mockResolvedValue({ Results: [{ Guid: 'g1', Link: 'l', PublishDate: 'd', Title: 't' }] }),
    }));

    const context = createContext({ topicConfig: { query: 'Show', guid: 'g1' } });

    await new SearchTopic().execute(context as any);

    expect(context.extend).toHaveBeenCalledWith({
      topic: { guid: 'g1', link: 'l', publishDate: 'd', title: 't' },
    });
  });

  it('CheckTopicInDB adds topic when missing', async () => {
    const dbModule = jest.requireMock('./db.js') as { DB: jest.Mock };
    const dbInstance = {
      findTopic: jest.fn().mockResolvedValue(undefined),
      addTopic: jest.fn(),
    };
    dbModule.DB.mockImplementation(() => dbInstance);

    const context = createContext({ topic: { guid: 'g1', publishDate: 'd' } });

    await new CheckTopicInDB().execute(context as any);

    expect(dbInstance.addTopic).toHaveBeenCalledWith('g1', 'd');
  });

  it('CheckTopicInDB aborts when no updates', async () => {
    const dbModule = jest.requireMock('./db.js') as { DB: jest.Mock };
    const dbInstance = {
      findTopic: jest.fn().mockResolvedValue({ guid: 'g1', publishDate: '2024-01-01' }),
      updatePubDateTopic: jest.fn(),
    };
    dbModule.DB.mockImplementation(() => dbInstance);

    const context = createContext({ topic: { guid: 'g1', publishDate: '2024-01-01' } });

    await new CheckTopicInDB().execute(context as any);

    expect(context.tadd).toHaveBeenCalledWith('No updates found, resheduling');
    expect(context.abort).toHaveBeenCalled();
  });

  it('CheckTopicInDB updates publish date when changed', async () => {
    const dbModule = jest.requireMock('./db.js') as { DB: jest.Mock };
    const dbInstance = {
      findTopic: jest.fn().mockResolvedValue({ guid: 'g1', publishDate: '2024-01-01' }),
      updatePubDateTopic: jest.fn(),
    };
    dbModule.DB.mockImplementation(() => dbInstance);

    const context = createContext({ topic: { guid: 'g1', publishDate: '2024-01-02' } });

    await new CheckTopicInDB().execute(context as any);

    expect(dbInstance.updatePubDateTopic).toHaveBeenCalledWith('g1', '2024-01-02');
  });

  it('DownloadTopicFile aborts when download fails', async () => {
    const fetchMock = getFetchMock();
    fetchMock.mockResolvedValueOnce(mockFetchResponse({ ok: false }));

    const context = createContext({ topic: { title: 'Show', link: 'http://file' } });

    await new DownloadTopicFile().execute(context as any);

    expect(context.abort).toHaveBeenCalled();
  });

  it('DownloadTopicFile downloads torrent and extends filePath', async () => {
    const fetchMock = getFetchMock();
    fetchMock.mockResolvedValueOnce(mockFetchResponse({ body: {} }));

    const fs = jest.requireMock('fs') as { createWriteStream: jest.Mock };
    fs.createWriteStream.mockReturnValue({});

    const context = createContext({ topic: { title: 'Show', link: 'http://file' } });

    await new DownloadTopicFile().execute(context as any);

    expect(context.extend).toHaveBeenCalledWith({ filePath: expect.stringContaining('.torrent') });
  });

  it('SetLastCheckedDate updates DB', async () => {
    const dbModule = jest.requireMock('./db.js') as { DB: jest.Mock };
    const dbInstance = { updateLastCheckDateTopic: jest.fn() };
    dbModule.DB.mockImplementation(() => dbInstance);

    const context = createContext({ topic: { guid: 'g1' } });

    await new SetLastCheckedDate().execute(context as any);

    expect(dbInstance.updateLastCheckDateTopic).toHaveBeenCalledWith('g1', expect.any(String));
  });

  it('ScheduleNextCheck calls scheduler', async () => {
    const scheduleNextCheck = jest.fn();
    const context = createContext({ scheduleNextCheck });

    await new ScheduleNextCheck().execute(context as any);

    expect(scheduleNextCheck).toHaveBeenCalled();
  });

  it('Log outputs context', async () => {
    const context = createContext({ name: () => 'test' });

    await new Log().execute(context as any);

    expect(context.logger.info).toHaveBeenCalled();
  });
});
