import { Action, QueueContext } from 'async-queue-runner';
import * as fs from 'fs';
import * as path from "path";
import { chromium } from 'playwright';
import { promisify } from 'util';
import { LoggerOutput, NotificationsOutput } from '@libs/actions';
// @ts-ignore
import parseTorrent from "parse-torrent";
import { qBitTorrentHost } from './config.js';
import { closeBrowser, omit, openBrowser, sleep } from './helpers.js';
import animeDubRecognizer from './multi-track.js';
import { getDestination } from './torrent.js';
import { BotContext, QBitTorrentContext, Torrent, TorrentStatus } from './types.js';

type CompContext = BotContext & LoggerOutput & NotificationsOutput;

const readFile = promisify(fs.readFile);
const unlink = promisify(fs.unlink);
// const picPath = (picName: string) => path.resolve(process.cwd(), 'pics', `${picName}.png`);

export class AddUploadToQBitTorrent extends Action<CompContext & QBitTorrentContext> {
  async execute(context: CompContext & QBitTorrentContext & QueueContext) {
    const { dir, filePath } = context;

    try {
      const { page, browser } = await openBrowser(chromium);

      await page.goto(qBitTorrentHost, {
        waitUntil: 'networkidle',
      });

      const vs = page.viewportSize() || { width: 200, height: 200 };
      await page.mouse.move(vs.width, vs.height);
      await page.locator('#uploadButton').click(); // default scope

      context.logger.info('Clicked to add new download task');
      context.logger.info(`${filePath} => ${dir}`);

      // popup is opened, but it exist in iFrame so need to switch scopes to it
      const uploadPopupFrame = page.frameLocator('#uploadPage_iframe');

      // search input[type=file] inside iframe locator
      const chooseFileButton = uploadPopupFrame.locator('#uploadForm #fileselect');

      // Start waiting for file chooser before clicking. Note no await.
      const fileChooserPromise = page.waitForEvent('filechooser');
      await chooseFileButton.click();
      const fileChooser = await fileChooserPromise;
      await fileChooser.setFiles(filePath);

      context.logger.info('file choosing ' + filePath);
      // alternative way to set files to input[type=file]
      // await chooseFileButton.setInputFiles([filePath]);
      context.logger.info('torrent file set');

      // Set destination path
      await uploadPopupFrame.locator('#savepath').fill(dir);
      context.logger.info('destination set ' + dir);

      // submit downloading and wait for popup to close
      await Promise.all([
        uploadPopupFrame.locator('button[type="submit"]').click(),
        page.waitForSelector('#uploadPage_iframe', { state: "detached" }),
      ])

      context.tlog('Torrent file submitted');

      await closeBrowser(browser);
    } catch (e) {
      context.logger.error(e as Error);

      context.terr(e as Error);
      context.tlog('Failed to add torrent to download');

      return context.abort();
    }
  }
}

export class CheckTorrentFile extends Action<CompContext & QBitTorrentContext> {
  async execute(context: CompContext & QBitTorrentContext & QueueContext): Promise<void> {
    const { filePath } = context;

    const file = await readFile(path.resolve(filePath));
    const torrent = await parseTorrent(file) as Torrent;

    if (torrent?.['files']) {
      context.logger.info(torrent.files);
    }

    let dir = '';
    try {
      dir = getDestination(torrent.files);
    } catch (e) {
      context.logger.error(e as Error);

      context.terr(e as Error);
      context.tlog('Torrent file parsing failed');

      return context.abort();
    }

    context.extend({ dir });
  }
}

export class ExtractTorrentPattern extends Action<CompContext & QBitTorrentContext> {
  async execute(context: CompContext & QBitTorrentContext & QueueContext): Promise<void> {
    const { filePath, extend } = context;
    const dirs = new Set();

    const file = await readFile(path.resolve(filePath));
    const torrent = await parseTorrent(file) as Torrent;

    for (const file of torrent.files) {
      const { path: filePath } = file;

      const parts = filePath.split('/');

      const fileName = parts.pop();
      const fileDir = parts.join('/');

      const fileExt = path.parse(fileName || '').ext;

      dirs.add(`${fileDir}/*${fileExt}`);
    }

    const patterns = Array.from(dirs.keys()) as string[];

    context.logger.debug(patterns);
    context.logger.info(animeDubRecognizer(patterns));
    context.logger.info('torrent:', torrent.name);

    extend({ torrentName: torrent.name });
  }
}

export class MonitorDownloadingProgress extends Action<CompContext & { torrentName: string }> {
  async execute(context: { torrentName: string; } & CompContext & QueueContext): Promise<void> {
    const { torrentName, bot, chatId } = context;

    try {
      const mesage = await bot.telegram.sendMessage(chatId, 'Start downloading torrent ' + torrentName);
      const messageId = mesage.message_id;
      let progressCache = '';
      let downloaded = false;
      while (!downloaded) {
        const response = await fetch(`${qBitTorrentHost}/api/v2/torrents/info?filter=downloading`);
        const torrents = JSON.parse(await response.text()) as TorrentStatus[];
        if (torrents.length === 0) downloaded = true;
        const torrent = torrents.find(t => t.name === torrentName);
        if (!torrent) {
          downloaded = true;
          break;
        }

        const status = {
          name: torrent.name,
          progress: (100 * torrent.progress).toFixed(0),
        };

        if (progressCache !== status.progress) {
          await bot.telegram.editMessageText(chatId, messageId, undefined, `${torrentName} progress: ${status.progress}%`);
          progressCache = status.progress;
        }

        context.logger.info('torrents', status);
        await sleep(5000);
      }

      await bot.telegram.editMessageText(chatId, messageId, undefined, `${torrentName} downloaded`);
    } catch (e) {
      context.logger.error(e);

      context.terr(e as Error);
      context.tlog('Monitoring failed');

      return context.abort();
    }
  }
}

export class DeleteFile extends Action<CompContext> {
  async execute(context: CompContext): Promise<void> {
    await unlink(context.filePath);
  }
}

export class Log extends Action<any> {
  async execute(context: any): Promise<void> {
    // context.logger.info(`Log(${context.name()}) context:`, omit(context, 'bot', 'push', 'stop', 'extend', 'name', 'stdout'));
    context.logger.info(`Log(${context.name()}) context:`, omit(context, 'bot', 'push', 'stop', 'extend', 'name', 'browser', 'page'));
  }
}
