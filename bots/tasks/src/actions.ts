import { Action, QueueContext } from 'async-queue-runner'

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
    const { url } = context;


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
