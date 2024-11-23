import { BrowserContext as Browser, BrowserType, Page } from "playwright";
import { Logger } from "./logger.js";
import { Bot } from "grammy";

export type PlaywrightContext = {
  chromium: BrowserType,
}

type BLogger = {
  info: (msg: string) => void,
  error: (err: Error) => void,
  adminInfo: (json: object) => void,
}

export type BotContext = {
  bot: Bot,
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

export type QBitTorrentContext = DestContext & {
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
  hash: string,
  added_on: number, // date in seconds
}

export type MultiTrack = {
  video: string,
  audio?: string,
  subs?: string,
}
export type MultiTrackContext = {
  type: string,
  tracks: MultiTrack,
  torrentDirName: string,
};

export type DirMap = {
  from: string,
  to: string,
}

export type DestContext = {
  qdir: string
  fdir: string
}
