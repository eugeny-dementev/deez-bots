import { Action, QueueContext } from 'async-queue-runner'
// import { chromium } from 'playwright';
// playwright-extra is a drop-in replacement for playwright,
// it augments the installed playwright with plugin functionality
import { chromium } from 'playwright-extra';
import { closeBrowser, openBrowser } from './helpers';
import { LoggerOutput, NotificationsOutput } from '@libs/actions';


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
