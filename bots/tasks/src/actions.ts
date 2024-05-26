import { Action, QueueContext } from 'async-queue-runner';
import { LoggerOutput, NotificationsOutput } from '@libs/actions';
import { readFile, writeFile } from 'fs';
// import { chromium } from 'playwright';
// playwright-extra is a drop-in replacement for playwright,
// it augments the installed playwright with plugin functionality
import { chromium } from 'playwright-extra';
import { promisify } from 'util';
import { closeBrowser, openBrowser } from './helpers';

const asyncWriteFile = promisify(writeFile);
const asyncReadFile = promisify(readFile);

// Load the stealth plugin and use defaults (all tricks to hide playwright usage)
// Note: playwright-extra is compatible with most puppeteer-extra plugins
const stealth = require('puppeteer-extra-plugin-stealth')()

// Add the plugin to playwright (any number of plugins can be added)
chromium.use(stealth)

const metascraper = require('metascraper')([
  require('metascraper-author')(),
  require('metascraper-date')(),
  require('metascraper-description')(),
  require('metascraper-publisher')(),
  require('metascraper-title')(),
  require('metascraper-url')(),
  require('metascraper-youtube')(),
])

export type DevContext = LoggerOutput & NotificationsOutput;

export type TaskContext = {
  text: string
  hasUrl: boolean
  urlOnly: boolean
}
export type TaskTypeContext = {
  type: 'url-only' | 'text-with-url' | 'text-only'
}
export class DetectTaskType extends Action<TaskContext & DevContext> {
  async execute(context: TaskContext & LoggerOutput & NotificationsOutput & QueueContext): Promise<void> {
    const { hasUrl, urlOnly } = context;

    let type: TaskTypeContext['type'];
    if (hasUrl && urlOnly) {
      type = 'url-only';
    } else if (hasUrl) {
      type = 'text-with-url';
    } else {
      type = 'text-only';
    }

    context.logger.info(`Type detected: ${type}`);

    context.extend({ type } as TaskTypeContext);
  }
}

export type UrlContext = { url: string }
export class GetPageHtml extends Action<UrlContext & DevContext> {
  async execute(context: UrlContext & DevContext & QueueContext): Promise<void> {
    const { url, extend } = context;

    context.logger.info('Opening Browser');
    const { browser, page } = await openBrowser(chromium)

    await page.goto(url, { waitUntil: 'domcontentloaded' });

    const html = await page.content();
    context.logger.info(`Html extracted, string length: ${html.length}`);

    extend({ html });

    await closeBrowser(browser);

    context.logger.info('Browser closed');
  }
}

export type Metadata = {
  author: string,
  date: string,
  description: string,
  publisher: string,
  title: string,
  url: string,
}
export type HtmlContext = {
  url: string,
  html: string,
}
export class ExtractMetadata extends Action<HtmlContext & DevContext> {
  async execute(context: HtmlContext & DevContext & QueueContext): Promise<void> {
    const { url, html, extend } = context;

    context.logger.info('Extracting metadata');
    const metadata = await metascraper({ url, html }) as Metadata;
    context.logger.info('Metadata extracted', metadata);

    extend({ metadata } as { metadata: Metadata });
  }
}

export type MetadataContext = {
  metadata: Metadata,
  url: string,
}
export class FormatMetadata extends Action<MetadataContext & DevContext> {
  async execute(context: MetadataContext & DevContext & QueueContext): Promise<void> {
    const { metadata, extend, url } = context;
    context.logger.info('Ready to format metadata: ' + new Date(context.metadata.date))

    const date = new Date(metadata.date);

    extend({ text: `Check [${date.toDateString()} - ${metadata.author} - ${metadata.title}](${url})` })
  }
}

export type TextContext = { text: string }
export class FormatTextWithUrl extends Action<TextContext & MetadataContext & DevContext> {
  async execute(context: TextContext & MetadataContext & DevContext & QueueContext): Promise<void> {
    const { text, url, metadata, extend } = context;

    extend({ text: text.replace(url, `[${metadata.author} - ${metadata.title}](${url})`) })
  }
}

export class FormatTextToMd extends Action<TextContext & DevContext> {
  async execute(context: TextContext & DevContext & QueueContext): Promise<void> {
    let text = context.text;

    const bullets = text.trim().split('\n'); // lines represent bullets
    const [head, ...children] = bullets.map(s => s.trim()); // First line is task and the rest is sub bullets

    if (children.length == 0) {
      text = `- ${head}\n`;
    }

    text = `- ${head}\n    - ${children.join('\n    - ')}`;

    context.extend({ markdown: text });
  }
}

export type FileContext = {
  path: string,
  markdown: string,
}
export class AppendMdToFile extends Action<FileContext & DevContext> {
  async execute(context: FileContext & DevContext & QueueContext): Promise<void> {
    const { path, markdown } = context;

    let buffer = await asyncReadFile(path);
    let content = buffer.toString().trimEnd();

    content = `${content}\n${markdown}\n`;

    await asyncWriteFile(path, content);
  }
}
