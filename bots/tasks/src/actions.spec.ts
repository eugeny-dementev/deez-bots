import {
  AppendMdToFile,
  DetectTaskType,
  ExtractMetadata,
  FormatMetadata,
  FormatTextToMd,
  FormatTextWithUrl,
  GetPageHtml,
} from './actions.js';

const openBrowserMock = jest.fn();
const closeBrowserMock = jest.fn();

jest.mock('./helpers', () => ({
  openBrowser: (...args: unknown[]) => openBrowserMock(...args),
  closeBrowser: (...args: unknown[]) => closeBrowserMock(...args),
}));

jest.mock('playwright-extra', () => ({
  chromium: { use: jest.fn() },
}));

jest.mock('puppeteer-extra-plugin-stealth', () => () => ({}));

var metascraperMock: jest.Mock;

jest.mock('metascraper', () => {
  metascraperMock = jest.fn();
  return () => metascraperMock;
});
jest.mock('metascraper-author', () => () => ({}));
jest.mock('metascraper-date', () => () => ({}));
jest.mock('metascraper-description', () => () => ({}));
jest.mock('metascraper-publisher', () => () => ({}));
jest.mock('metascraper-title', () => () => ({}));
jest.mock('metascraper-url', () => () => ({}));
jest.mock('metascraper-youtube', () => () => ({}));

jest.mock('fs', () => ({
  readFile: jest.fn(),
  writeFile: jest.fn(),
}));

describe('tasks actions', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('DetectTaskType detects url-only', async () => {
    const extend = jest.fn();

    await new DetectTaskType().execute({ hasUrl: true, urlOnly: true, extend, logger: { info: jest.fn() } } as any);

    expect(extend).toHaveBeenCalledWith({ type: 'url-only' });
  });

  it('DetectTaskType detects text-with-url', async () => {
    const extend = jest.fn();

    await new DetectTaskType().execute({ hasUrl: true, urlOnly: false, extend, logger: { info: jest.fn() } } as any);

    expect(extend).toHaveBeenCalledWith({ type: 'text-with-url' });
  });

  it('DetectTaskType detects text-only', async () => {
    const extend = jest.fn();

    await new DetectTaskType().execute({ hasUrl: false, urlOnly: false, extend, logger: { info: jest.fn() } } as any);

    expect(extend).toHaveBeenCalledWith({ type: 'text-only' });
  });

  it('GetPageHtml extracts HTML and closes browser', async () => {
    const page = { goto: jest.fn(), content: jest.fn().mockResolvedValue('<html />') };
    const browser = { close: jest.fn() };
    openBrowserMock.mockResolvedValue({ page, browser });

    const extend = jest.fn();
    const context = { url: 'https://site', extend, logger: { info: jest.fn() }, tlog: jest.fn() } as any;

    await new GetPageHtml().execute(context);

    expect(page.goto).toHaveBeenCalledWith('https://site', { waitUntil: 'domcontentloaded' });
    expect(extend).toHaveBeenCalledWith({ html: '<html />' });
    expect(closeBrowserMock).toHaveBeenCalledWith(browser);
  });

  it('ExtractMetadata uses metascraper', async () => {
    metascraperMock.mockResolvedValue({ title: 'Title' });

    const extend = jest.fn();
    const context = { url: 'https://site', html: '<html />', extend, logger: { info: jest.fn() }, tlog: jest.fn() } as any;

    await new ExtractMetadata().execute(context);

    expect(metascraperMock).toHaveBeenCalled();
    expect(extend).toHaveBeenCalledWith({ metadata: { title: 'Title' } });
  });

  it('FormatMetadata builds markdown link', async () => {
    const extend = jest.fn();
    const context = {
      url: 'https://site',
      metadata: { author: 'Author', date: '2024-01-01T12:00:00Z', description: '', publisher: '', title: '' },
      extend,
      logger: { info: jest.fn() },
    } as any;

    await new FormatMetadata().execute(context);

    const text = (extend as jest.Mock).mock.calls[0][0].text as string;
    expect(text).toContain('Author');
    expect(text).toContain('https://site');
  });

  it('FormatTextWithUrl replaces url with markdown link', async () => {
    const extend = jest.fn();
    const context = {
      text: 'Check https://site',
      url: 'https://site',
      metadata: { author: 'Author', title: 'Title', url: 'https://site' },
      extend,
    } as any;

    await new FormatTextWithUrl().execute(context);

    expect(extend).toHaveBeenCalledWith({
      text: 'Check [Author - Title](https://site)',
    });
  });

  it('FormatTextToMd formats single line', async () => {
    const extend = jest.fn();
    const context = { text: 'Task', extend } as any;

    await new FormatTextToMd().execute(context);

    expect(extend).toHaveBeenCalledWith({ markdown: '- Task\n' });
  });

  it('FormatTextToMd formats multiple lines', async () => {
    const extend = jest.fn();
    const context = { text: 'Task\nSub1\nSub2', extend } as any;

    await new FormatTextToMd().execute(context);

    expect(extend).toHaveBeenCalledWith({
      markdown: '- Task\n    - Sub1\n    - Sub2',
    });
  });

  it('AppendMdToFile appends markdown to file', async () => {
    const fs = jest.requireMock('fs') as { readFile: jest.Mock; writeFile: jest.Mock };
    (fs.readFile as jest.Mock).mockImplementation((path, cb) => cb(null, Buffer.from('Existing')));
    (fs.writeFile as jest.Mock).mockImplementation((_path, _content, cb) => cb(null));

    const context = { path: '/file.md', markdown: '- New' } as any;

    await new AppendMdToFile().execute(context);

    expect(fs.writeFile).toHaveBeenCalledWith('/file.md', 'Existing\n- New\n', expect.any(Function));
  });
});
