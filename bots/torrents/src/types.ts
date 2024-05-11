import { BrowserContext as Browser, BrowserType, Page } from "playwright";
import { Telegraf } from "telegraf";
import { Logger } from "./logger.js";

export type PlaywrightContext = {
  chromium: BrowserType,
}

type BLogger = {
  info: (msg: string) => void,
  error: (err: Error) => void,
  adminInfo: (json: object) => void,
}

export type BotContext = {
  bot: Telegraf,
  filePath: string,
  logger: Logger,
  destination: string,
  blogger: BLogger,
  adminId: number,
  chatId: number,
}

export type BrowserContext = {
  browser: Browser,
  page: Page,
};

export type QBitTorrentContext = {
  dir: string,
  torrentFilePath: string,
};

export type TFile = {
  name: string,
  path: string,
  length: number,
  offset: number,
}

export type Torrent = {
  files: TFile[],
  name: string,
}

export type TorrentStatus = {
  progress: number, // float 0.0 - 1.0
  content_ath: string,
  name: string,
}
