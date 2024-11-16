import { LoggerOutput, NotificationsOutput } from '@libs/actions';
import { exec, prepare } from '@libs/command';
import { Action, lockingClassFactory, QueueContext } from 'async-queue-runner';
import expandTilde from 'expand-tilde';
import * as fs from 'fs';
import { glob } from 'glob';
import { FileX } from 'node_modules/@grammyjs/files/out/files.js';
import * as path from "path";
import { chromium } from 'playwright';
import { promisify } from 'util';
// @ts-ignore
import parseTorrent from "parse-torrent";
import {
  downloadsDir,
  jackettHost,
  jackettKey,
  moviesDir,
  qBitTorrentHost,
  qRawShowsDir,
  rawShowsDir,
  tvshowsDir
} from './config.js';
import {
  closeBrowser,
  fileExists,
  getDirMaps,
  omit,
  openBrowser,
  russianLetters,
  russianToEnglish,
  sleep,
  wildifySquareBrackets
} from './helpers.js';
import multiTrackRecognizer from './multi-track.js';
import { getDestination } from './torrent.js';
import { BotContext, DestContext, MultiTrack, MultiTrackContext, QBitTorrentContext, Torrent, TorrentStatus } from './types.js';
import { TrackingTopic } from './watcher.js';
import { DB } from './db.js';

type CompContext = BotContext & LoggerOutput & NotificationsOutput;

const readFile = promisify(fs.readFile);
const unlink = promisify(fs.unlink);

export type FileContext = {
  file: FileX,
  fileName: string,
};
export class RenameFile extends Action<CompContext & FileContext> {
  async execute(context: BotContext & LoggerOutput & NotificationsOutput & FileContext & QueueContext): Promise<void> {
    const { fileName, extend, logger } = context;

    logger.info('New file', {
      fileName,
    });

    const filenameObject = path.parse(fileName);
    const newName = filenameObject.name
      .toLowerCase()
      .split('')
      .map((char: string) => {
        if (russianLetters.has(char)) {
          return russianToEnglish[char as keyof typeof russianToEnglish] || char;
        } else return char;
      })
      .join('')
      .replace(/\s+/g, '_')
      .replace(/[^a-z0-9_]/g, '');

    const newFileName = `${newName}.${filenameObject.ext}`;

    logger.info('File renamed', {
      fileName: newFileName,
    });

    extend({
      fileName: newFileName,
    });
  }
}

export class DownloadFile extends Action<CompContext & FileContext> {
  async execute(context: BotContext & LoggerOutput & NotificationsOutput & FileContext & QueueContext): Promise<void> {
    const { fileName, extend, logger, file } = context;

    const absolutePathDownloadsDir = expandTilde(downloadsDir);
    const destination = path.join(absolutePathDownloadsDir, fileName);

    await file.download(destination);

    logger.info('File downloaded', {
      fileName,
    });

    extend({
      filePath: destination,
    })
  }
}

export class AddUploadToQBitTorrent extends lockingClassFactory<CompContext & QBitTorrentContext>('browser') {
  async execute(context: CompContext & QBitTorrentContext & QueueContext) {
    const { qdir, filePath, tlog } = context;

    try {
      const { page, browser } = await openBrowser(chromium);

      await page.goto(qBitTorrentHost, {
        waitUntil: 'networkidle',
      });

      const vs = page.viewportSize() || { width: 200, height: 200 };
      await page.mouse.move(vs.width, vs.height);
      await page.locator('#uploadButton').click(); // default scope

      context.logger.info('Clicked to add new download task');
      context.logger.info(`${filePath} => ${qdir}`);

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
      await uploadPopupFrame.locator('#savepath').fill(qdir);
      context.logger.info('destination set ' + qdir);

      // submit downloading and wait for popup to close
      await Promise.all([
        uploadPopupFrame.locator('button[type="submit"]').click(),
        page.waitForSelector('#uploadPage_iframe', { state: "detached" }),
      ])

      await tlog('Torrent file submitted');

      await closeBrowser(browser);
    } catch (e) {
      context.logger.error(e as Error);

      context.terr(e as Error);
      await tlog('Failed to add torrent to download');

      return context.abort();
    }
  }
}

export class CheckTorrentFile extends Action<CompContext & QBitTorrentContext> {
  async execute(context: CompContext & Partial<MultiTrackContext> & QBitTorrentContext & QueueContext): Promise<void> {
    const { filePath, tlog } = context;

    if (context.type === 'multi-track') {
      return;
    }

    const file = await readFile(path.resolve(filePath));
    const torrent = await parseTorrent(file) as Torrent;

    if (torrent?.['files']) {
      context.logger.info('Torrent file', { files: torrent.files });
    }

    let qdir = '';
    let fdir = '';
    try {
      const destObj = getDestination(torrent.files);
      qdir = destObj.qdir;
      fdir = destObj.fdir;

      if (fdir === tvshowsDir) {
        await tlog('Torrent parsed, TV Show detected');
      } else if (fdir === moviesDir) {
        await tlog('Torrent parsed, Movie detected');
      } else {
        await tlog('Unsupported torrent detected');
      }
    } catch (e) {
      context.logger.error(e as Error);

      context.terr(e as Error);
      context.tlog('Torrent file parsing failed');

      return context.abort();
    }

    context.extend({ qdir, fdir } as DestContext);
  }
}

export class ExtractTorrentPattern extends Action<CompContext & QBitTorrentContext> {
  async execute(context: CompContext & QBitTorrentContext & QueueContext): Promise<void> {
    const { filePath, extend } = context;
    const dirs = new Set();

    context.logger.info('Parsing torrent file ' + filePath);
    const file = await readFile(path.resolve(filePath));
    const torrent = await parseTorrent(file) as Torrent;

    let torrentDirName = '';

    context.logger.debug('Torrent files', { files: torrent?.files.map(({ path }) => path) });

    for (const file of torrent.files) {
      let { path: filePath } = file;

      const parts = filePath.split(path.sep);

      const fileName = parts.pop();
      torrentDirName = parts[0];
      const fileDir = path.join(...parts);

      const fileExt = path.parse(fileName || '').ext;

      dirs.add(`${fileDir}/*${fileExt}`);
    }

    const patterns = Array.from(dirs.keys()) as string[];
    context.logger.debug('Prepared glob patterns', { patterns });

    const tracks = multiTrackRecognizer(patterns);
    context.logger.info('Torrent name', { name: torrent.name });
    context.logger.info('Multi-track chosen patterns', { tracks });

    extend({ torrentName: torrent.name });

    if (Object.values(tracks).filter(p => Boolean(p)).length > 1) {
      extend({ qdir: qRawShowsDir, fdir: rawShowsDir, type: 'multi-track', tracks, torrentDirName } as MultiTrackContext & DestContext);
    }
  }
}

export class ConvertMultiTrack extends Action<CompContext & MultiTrackContext> {
  async execute(context: BotContext & QBitTorrentContext & LoggerOutput & NotificationsOutput & MultiTrackContext & QueueContext): Promise<void> {
    const { fdir, tracks, torrentDirName, tlog, terr } = context;
    context.logger.info(`ConvertMultiTrack dir: ${fdir}`);
    let [
      videosFullPattern,
      audiosFullPattern,
      subsFullPattern,
    ] = [
        path.join(fdir, tracks.video),
        path.join(fdir, tracks.audio || ''),
        path.join(fdir, tracks.subs || '')
      ];

    videosFullPattern = wildifySquareBrackets(videosFullPattern);
    audiosFullPattern = audiosFullPattern && wildifySquareBrackets(audiosFullPattern);
    subsFullPattern = subsFullPattern && wildifySquareBrackets(subsFullPattern);

    context.logger.debug('Glob patterns', { videosFullPattern, audiosFullPattern, subsFullPattern });

    const [mkvFiles, mkaFiles, assFiles] = await Promise.all([
      glob.glob(videosFullPattern, { windowsPathsNoEscape: true }).then(files => {
        const map = new Map<string, string>();

        for (const file of files) {
          const fileName = path.parse(file).name;
          map.set(fileName, file);
        }

        return map;
      }),
      glob.glob(audiosFullPattern, { windowsPathsNoEscape: true }),
      glob.glob(subsFullPattern, { windowsPathsNoEscape: true }),
    ]);

    context.logger.debug('Glob files', { mkvFiles: Array.from(mkvFiles.values()), mkaFiles, assFiles });

    const filesMap = new Map<string, MultiTrack>();

    for (const fileName of Array.from(mkvFiles.keys()).sort()) {
      filesMap.set(fileName, {
        video: mkvFiles.get(fileName)!,
        audio: mkaFiles.find((audioFileName) => audioFileName.includes(fileName))!,
        subs: assFiles.find((subsFileName) => subsFileName.includes(fileName))!,
      });
    }

    let torrentDestFolder = torrentDirName;
    const dirMaps = await getDirMaps();
    for (const dirMap of dirMaps) {
      if (torrentDirName.includes(dirMap.from)) {
        torrentDestFolder = dirMap.to;
        break;
      }
    }

    const destDir = path.join(tvshowsDir, torrentDestFolder);

    context.logger.info(`Target directory for mkvmerge: ${destDir}`);

    let i = 1;
    let newFiles = 0;
    let oldFiles = 0;
    let size = filesMap.size;
    context.logger.info(`Found ${size} files to handle`);
    for (const [fileName, files] of filesMap.entries()) {
      const outputFile = path.join(destDir, `${fileName}.mkv`);
      if (await fileExists(outputFile)) {
        context.logger.info(`File already converted: ${fileName}`);
        oldFiles++

        await tlog(`Converting ${i} file out of ${size}`);
        continue;
      }

      const command = prepare('mkvmerge')
        .add(`--output "${outputFile}"`)
        .add('--no-audio', Boolean(files.audio))
        .add('--no-subtitles', Boolean(files.subs))
        .add(`"${files.video}"`)
        .add(`--language 0:ru "${files.audio!}"`, Boolean(files.audio))
        .add(`--language 0:ru`, Boolean(files.subs))
        .add(`--forced-display-flag 0:yes`, Boolean(files.subs) && String(files.subs).toLowerCase().includes('надписи'))
        .add(`"${files.subs!}"`, Boolean(files.subs))
        .toString();

      context.logger.debug(`Convert command added to the queue ${command}`);

      await tlog(`Converting ${i++} file out of ${size}`);
      await exec(command);

      newFiles++;
    }

    await tlog(`Conversion complete: ${newFiles} new out ${newFiles + oldFiles} total files`);
  }
}

export class MonitorDownloadingProgress extends Action<CompContext & { torrentName: string }> {
  async execute(context: { torrentName: string; } & CompContext & QueueContext): Promise<void> {
    const { torrentName, tlog, terr, chatId } = context;

    try {
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
          await tlog(`${torrentName} progress: ${status.progress}%`);
          progressCache = status.progress;
        }

        context.logger.info('torrents', status);
        await sleep(5000);
      }

      await tlog(`${torrentName} downloaded`);
    } catch (e) {
      context.logger.error(e as Error);

      await terr(e as Error);
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

export type Topic = {
  link: string,
  title: string,
  guid: string,
  publishDate: string,
}
export type TopicConfigContext = {
  topicConfig: TrackingTopic,
}
export class SearchTopic extends Action<TopicConfigContext & CompContext> {
  async execute(context: TopicConfigContext & CompContext & QueueContext): Promise<void> {
    const { topicConfig } = context;

    const url = `${jackettHost}/api/v2.0/indexers/all/results?apikey=${jackettKey}&Query=${encodeURIComponent(topicConfig.query)}`;

    try {
      const response = await fetch(url);

      if (!response.ok) {
        context.logger.warn(`Bad response while searching for topics: ${response.statusText}`, {
          status: response.status,
          ok: response.ok,
          url,
          topicConfig,
        });
        context.abort();
        return;
      }

      const data = await response.json();

      if (!data.Results || !data.Results.length) {
        context.logger.warn(`No topics found whiel searching: ${topicConfig.query}`, {
          url,
          topicConfig,
        });
        context.abort();
        return;
      }

      // Map to a simple format or use the data as you wish
      const torrents = data.Results.map((torrent: any) => ({
        ...torrent,
      })) as { Guid: string, Link: string, PublishDate: string, Title: string }[];

      const responseTopic = torrents.find((torrent) => topicConfig.guid === torrent.Guid);

      if (!responseTopic) {
        context.logger.info('No topics found for provided guid/query pair', {
          topicConfig,
          url,
        });
        context.abort();
        return;
      }

      const topic: Topic = {
        guid: responseTopic.Guid,
        link: responseTopic.Link,
        publishDate: responseTopic.PublishDate,
        title: responseTopic.Title,
      };

      context.extend({ topic });
    } catch (error) {
      context.logger.error(error as Error);
      context.abort();
    }
  }
}

export type TopicContext = { topic: Topic };
export class CheckTopicInDB extends Action<TopicContext & CompContext> {
  async execute(context: TopicContext & CompContext & QueueContext): Promise<void> {
    const { topic } = context;

    const db = new DB();

    const dbTopic = await db.findTopic(topic.guid);

    if (!dbTopic) {
      await db.addTopic(topic.guid, topic.publishDate);
      context.logger.info('New topic added to db', topic);
      return;
    }

    context.logger.info('DB Topic found', dbTopic);

    const newPublishDate = new Date(topic.publishDate).getTime();
    const oldPublishDate = new Date(dbTopic.publishDate).getTime();

    if (newPublishDate === oldPublishDate) {
      context.logger.info('No updates in the topic', {
        topic: topic,
        dbTopic,
      });
      context.abort();
      return;
    }

    await db.updateTopic(topic.guid, topic.publishDate);

    context.logger.info('Topic is updates in DB', {
      topic: topic,
      dbTopic,
    });
  }
}

export class Log extends Action<any> {
  async execute(context: any): Promise<void> {
    context.logger.info(`Log(${context.name()}) context:`, omit(context, 'bot', 'push', 'stop', 'extend', 'name', 'browser', 'page', 'tlog', 'terr', 'abort'));
  }
}
