import { Action, QueueContext } from 'async-queue-runner';
import * as fs from 'fs';
import * as path from "path";
import { Page, chromium } from 'playwright';
import { promisify } from 'util';
// @ts-ignore
import parseTorrent from "parse-torrent";
import { qBitTorrentHost } from './config.js';
import { omit, sleep } from './helpers.js';
import animeDubRecognizer from './multi-track.js';
import { getDestination } from './torrent.js';
import { LoggerOutput, NotificationsOutput } from '@libs/actions';
import { BotContext, BrowserContext, PlaywrightContext, QBitTorrentContext, Torrent, TorrentStatus } from './types.js';

type CompContext = BotContext & LoggerOutput & NotificationsOutput;

const readFile = promisify(fs.readFile);
const unlink = promisify(fs.unlink);
// const picPath = (picName: string) => path.resolve(process.cwd(), 'pics', `${picName}.png`);

function getUserDataPath(): string {
  return path.resolve(process.cwd(), 'userData');
}
export class OpenBrowser extends Action<PlaywrightContext> {
  async execute(context: PlaywrightContext & QueueContext) {
    const browser = await chromium.launchPersistentContext(getUserDataPath(), { headless: true });
    const pages = browser.pages()

    for (const page of pages) {
      page.close();
    }

    const page: Page = await browser.newPage();

    const userAgent = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36';
    await page.setExtraHTTPHeaders({
      'User-Agent': userAgent,
      'Accept-Language': 'en-US,en;q=0.9'
    });

    context.extend({
      browser, page,
    });
  }
}

export class CloseBrowser extends Action<CompContext & BrowserContext> {
  async execute(context: CompContext & BrowserContext & QueueContext): Promise<void> {
    const { browser } = context;

    const pages = browser.pages();

    for (const page of pages) {
      page.close();
    }

    // @ts-ignore
    delete context.browser;
    // @ts-ignore
    delete context.page;

    await browser.close();
  }
}

export class OpenQBitTorrent extends Action<CompContext & BrowserContext> {
  async execute(context: CompContext & BrowserContext & QueueContext) {
    const { page } = context;

    await page.goto(qBitTorrentHost, {
      waitUntil: 'networkidle',
    });
  }
}

export class AddUploadToQBitTorrent extends Action<CompContext & BrowserContext & QBitTorrentContext & CompContext> {
  async execute(context: CompContext & BrowserContext & QBitTorrentContext & CompContext & QueueContext) {
    const { page, dir, filePath } = context;

    try {
      const vs = page.viewportSize() || { width: 200, height: 200 };
      await page.mouse.move(vs.width, vs.height);
      await page.locator('#uploadButton').click(); // default scope
    } catch (e) {
      context.logger.error(e as Error);

      context.terr(e as Error);
      context.tlog('Failed to add torrent to download');

      return context.abort();
    }

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

export class TGPrintTorrentPattern extends Action<CompContext & QBitTorrentContext> {
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
    context.logger.info(Array.from(animeDubRecognizer(patterns)));
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

/*
export class Notification<C> extends Action<CompContext> {
  message: string | FContextMessage<C & CompContext>;
  options: NotificationOptions = { update: false, silent: true };

  constructor(message: string | FContextMessage<C & CompContext>, options: Partial<NotificationOptions> = {}) {
    super();

    this.message = message;
    Object.assign(this.options, options);
  }

  async execute(context: C & CompContext & QueueContext): Promise<void> {
    const { chatId, bot } = context;

    const msg: string = typeof this.message === 'function'
      ? await this.message(context)
      : this.message;

    bot.telegram.sendMessage(chatId, msg, { disable_notification: this.options.silent });
  }
}

export class CalcTimeLeft extends Action<CompContext> {
  async execute(context: CompContext & QueueContext): Promise<void> {
    const { userId, role, limitsStatus, extend } = context;

    const currentUserLimit = USER_LIMITS[role];

    let timeLimitLeft = 0;

    if (limitsStatus[userId]) {
      timeLimitLeft = Math.max(timeLimitLeft, currentUserLimit - (Date.now() - limitsStatus[userId]));
    }

    if (timeLimitLeft <= 1000) timeLimitLeft = 0;

    extend({ timeLimitLeft });
  }
}

export class SetLimitStatus extends Action<CompContext> {
  async execute(context: CompContext & QueueContext): Promise<void> {
    const { userId, limitsStatus } = context;

    limitsStatus[userId] = Date.now();
  }
}

export class DeleteLimitStatus extends Action<CompContext> {
  async execute(context: CompContext & QueueContext): Promise<void> {
    const { userId, limitsStatus } = context;

    delete limitsStatus[userId];
  }
}

export class Log extends Action<any> {
  async execute(context: any): Promise<void> {
    // context.logger.info(`Log(${context.name()}) context:`, omit(context, 'bot', 'push', 'stop', 'extend', 'name', 'stdout'));
    context.logger.info(`Log(${context.name()}) context:`, omit(context, 'bot', 'push', 'stop', 'extend', 'name'));
  }
}

export class CleanUpUrl extends Action<CompContext> {
  async execute({ url, extend }: CompContext & QueueContext): Promise<void> {
    const l = new URL(url);

    const cleanUrl = `${l.origin}${l.pathname}`;

    extend({ url: cleanUrl })
  }
}

export class GetVideoFormatsListingCommand extends Action<CompContext> {
  async execute({ url, cookiesPath, extend }: CompContext & QueueContext): Promise<void> {
    const commandArr: string[] = [];

    commandArr.push(`yt-dlp`)
    commandArr.push('--list-formats')
    commandArr.push(`--cookies ${cookiesPath}`);
    commandArr.push(url);

    const command = commandArr.join(' ');

    extend({ command });
  }
}

export class CheckVideoSize extends Action<CommandContext> {
  async execute({ stdout, extend }: CommandContext & QueueContext): Promise<void> {
    let videoMeta: ReturnType<typeof parseFormatsListing> = [];

    try {
      const metas = parseFormatsListing(stdout);

      if (Array.isArray(metas) && metas.length > 0)

      videoMeta = metas;

    } catch (e) {
      console.error(e);
      context.logger.info(stdout);
    }

    extend({ videoMeta });
  }
}

export class PrepareYtDlpCommand extends Action<CompContext> {
  async execute({ url, destDir, cookiesPath, extend, userId, destFileName }: CompContext & QueueContext & { destDir: string }): Promise<void> {
    if (!destDir) throw Error('No destDir specified');

    const userHomeDir = path.join(destDir, destDir == homeDir ? String(userId) : '');

    const commandArr: string[] = [];

    commandArr.push(`yt-dlp -S "res:${destDir === storageDir ? '1080' : '480'}"`)
    commandArr.push(`--paths home:${userHomeDir}`)
    commandArr.push(`--paths temp:${swapDir}`);
    commandArr.push(`--cookies ${cookiesPath}`);
    if (destDir === homeDir) commandArr.push(`--output "${destFileName}.%(ext)s"`);
    else commandArr.push(`--output "${destFileName}.%(title)s.%(ext)s"`);
    commandArr.push(url);

    const command = commandArr.join(' ');

    extend({ command });
  }
}

export class FindMainFile extends Action<CompContext> {
  async execute({ extend, destFileName }: CompContext & QueueContext): Promise<void> {

    if (!storageDir) throw new Error('No storage dir found');

    let homePath = storageDir;

    if (homePath.includes('~')) homePath = expendTilda(homePath);

    const pattern = path.join(homePath, `${destFileName}.*`);
    const files = await glob.glob(pattern, { windowsPathsNoEscape: true });

    if (files.length === 0) {
      return;
    }

    const mainFile = files[0];

    extend({ globPattern: pattern, globFiles: files, mainFile });
  }
}

export class FindFile extends Action<CompContext> {
  async execute({ userId, extend, destFileName }: CompContext & QueueContext): Promise<void> {

    if (!homeDir) throw new Error('No home dir found');

    let homePath = homeDir;

    if (homePath.includes('~')) homePath = expendTilda(homePath);

    const pattern = path.join(homePath, String(userId), `${destFileName}.*`);
    const files = await glob.glob(pattern, { windowsPathsNoEscape: true });

    if (files.length === 0) {
      return;
    }

    const lastFile = files[0];

    extend({ globPattern: pattern, globFiles: files, lastFile });
  }
}

export class PrepareConvertCommand extends Action<LastFileContext> {
  async execute({ lastFile, extend }: LastFileContext & QueueContext): Promise<void> {
    const fileData = path.parse(lastFile);
    const newFileName = `new_${fileData.name}`;
    const newFilePath = path.join(fileData.dir, `${newFileName}.mp4`);
    // ffmpeg -i ./YKUNMpHk_cs.any ./new_YKUNMpHk_cs.mp4
    const command = `ffmpeg -i ${lastFile} -c:v libx264 -crf 28 -preset veryslow -c:a copy ${newFilePath}`;

    extend({ command, destFileName: newFileName });
  }
}

export class PreapreVideoDimentionsCommand extends Action<LastFileContext> {
  async execute({ lastFile, extend }: LastFileContext & QueueContext): Promise<void> {
    // command
    // ffprobe -v error -show_entries stream=width,height -of default=noprint_wrappers=1 .\YKUNMpHk_cs.mp4
    //
    // stdout
    // width=720
    // height=1280
    const command = `ffprobe -v error -show_entries stream=width,height -of default=noprint_wrappers=1 ${lastFile}`

    extend({ command });
  }
}

export class ExtractVideoDimentions extends Action<CommandContext> {
  async execute({ stdout, extend }: CommandContext & QueueContext): Promise<void> {
    const { width, height } = stdout
      .trim()
      .split('\n').map(s => s.trim())
      .map((str: string): string[] => str.split('=').map(s => s.trim()))
      .reduce<VideoDimensions>((obj: VideoDimensions, pair: string[]): VideoDimensions => {
        const [field, value] = pair;
        obj[field] = Number(value);

        return obj;
      }, {} as VideoDimensions);

    extend({ width, height });
  }
}

export class ExecuteCommand extends Action<CommandContext> {
  delay: number = 1000;

  async execute(context: CommandContext & QueueContext): Promise<void> {
    return new Promise((res, rej) => {
      if (!context.command) {
        rej('Command not found in the context');

        return;
      }

      shelljs.exec(context.command!, { async: true }, (code, stdout, stderr) => {
        delete context.command;

        if (code === 0) {
          res();

          context.extend({ stdout });

          return;
        }

        rej(stderr.toString());
      });
    });
  }
}

export class DeleteFile extends Action<LastFileContext> {
  async execute({ lastFile }: LastFileContext): Promise<void> {
    await deleteAsync(lastFile, { force: true });
  }
}

export class UploadVideo extends Action<CompContext & VideoDimensionsContext & LastFileContext> {
  async execute({ lastFile, bot, width, height, channelId }: VideoDimensionsContext & CompContext & LastFileContext & QueueContext): Promise<void> {
    const videoBuffer = await fsPromises.readFile(lastFile);

    await bot.telegram.sendVideo(channelId!, { source: videoBuffer }, { width, height });
  }
}

export class SetChatIdToChannelId extends Action<CompContext> {
  async execute({ chatId, extend }: CompContext & QueueContext): Promise<void> {
    extend({ channelId: chatId });
  }
}
*/
