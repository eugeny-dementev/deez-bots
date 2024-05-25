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
  require('metascraper-url')()
])

export type UrlContext = { url: string }
export class GetPageHtml extends Action<UrlContext> {
  async execute(context: UrlContext & QueueContext): Promise<void> {
    const { url, extend } = context;

    const { browser, page } = await openBrowser(chromium)

    await page.goto(url, { waitUntil: 'domcontentloaded' });

    const html = await page.content();

    extend({ html });

    await closeBrowser(browser);
  }
}

export type Metadata = {
  author: string,
  date: unknown,
  description: string,
  publisher: string,
  title: string,
  url: string,
}
export type InputContext = {
  url: string,
  html: string,
}
export class ExtractMetadata extends Action<InputContext> {
  async execute(context: InputContext & QueueContext): Promise<void> {
    const { url, html, extend } = context;

    const metadata = await metascraper({ url, html }) as Metadata;

    extend({ metadata } as { metadata: Metadata });
  }
}
