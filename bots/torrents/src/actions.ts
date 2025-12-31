import { LoggerOutput, NotificationsOutput } from '@libs/actions';
import { exec, prepare } from '@libs/command';
import { Action, lockingClassFactory, QueueContext } from '@libs/actions';
import expandTilde from 'expand-tilde';
import * as fs from 'fs';
import { glob } from 'glob';
import { InlineKeyboard, InputFile } from 'grammy';
import { Readable } from 'node:stream';
import { finished } from 'node:stream/promises';
import { ReadableStream } from 'node:stream/web';
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
import { DB } from './db.js';
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
import { JacketResponseItem } from './jackett.js';
import multiTrackRecognizer from './multi-track.js';
import { clearSearchResults, getSearchResults, setSearchResults } from './search-store.js';
import { getDestination } from './torrent.js';
import { BotContext, DestContext, MultiTrack, MultiTrackContext, QBitTorrentContext, Torrent, TorrentStatus } from './types.js';
import { TrackingTopic } from './watcher.js';

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
  }

  async onError(error: Error, context: QueueContext): Promise<void> {
    await (context as unknown as Partial<CompContext>).tlog?.('Failed to add torrent to download');
    await super.onError(error, context);
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

    context.extend({ qdir, fdir } as DestContext);
  }

  async onError(error: Error, context: QueueContext): Promise<void> {
    await (context as unknown as Partial<CompContext>).tlog?.('Torrent file parsing failed');
    await super.onError(error, context);
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
    const { fdir, tracks, torrentDirName, tlog, tadd, terr } = context;
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

    let hasAudio = false;
    for (const map of filesMap.values()) {
      if (map.audio) {
        hasAudio = true;
        break;
      }
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

      if (hasAudio && !files.audio) {
        context.logger.info(`Skipping ${fileName}(${i} file out of ${size}) due to yet missing audio file`);
        await tlog(`Skipping ${fileName}(${i} file out of ${size}) due to yet missing audio file`);
        await tadd('-');
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

export class ReadTorrentFile extends Action<CompContext & { torrentName: string }> {
  async execute(context: CompContext & { torrentName: string; } & QueueContext): Promise<void> {
    const { filePath, tadd } = context;

    const file = await readFile(path.resolve(filePath));
    const torrent = await parseTorrent(file) as Torrent;
    const torrentName = torrent.name;

    tadd(`Torrent name: ${torrentName}`);

    context.extend({ torrentName });
  }
}

export class RemoveOldTorrentItem extends Action<CompContext & { torrentName: string }> {
  async execute(context: BotContext & LoggerOutput & NotificationsOutput & { torrentName: string; } & QueueContext): Promise<void> {
    const { filePath, torrentName, tadd } = context;

    context.logger.info('Searching old torrents to remove', {
      torrentName,
      filePath,
    });

    const response = await fetch(`${qBitTorrentHost}/api/v2/torrents/info?filter=seeding`);
    const torrents = JSON.parse(await response.text()) as TorrentStatus[];
    const currentNameTorrents = torrents
      .filter(t => t.name === torrentName)
      .sort((a, b) => b.added_on - a.added_on);


    if (currentNameTorrents.length === 0) {
      context.logger.error(new Error(`No torrent found for the name`), {
        torrentName,
      });
      return;
    }

    if (currentNameTorrents.length === 1) {
      context.logger.info('No torrrent duplicates found', {
        torrentName,
        torrents: currentNameTorrents.map(t => ({
          name: t.name,
          addedOn: new Date(t.added_on * 1000).toString(),
        })),
      });
      return;
    }

    const freshest = currentNameTorrents.shift()!;

    context.logger.info('Freshest torrent extracted', {
      torrentName,
      addedOn: new Date(freshest.added_on * 1000).toString(),
      progress: freshest.progress,
      hash: freshest.hash,
    });

    for (const oldTorrent of currentNameTorrents) {
      const response = await fetch(`${qBitTorrentHost}/api/v2/torrents/delete`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: new URLSearchParams({
          hashes: oldTorrent.hash,
          deleteFiles: 'false',
        }),
      });

      if (!response.ok) {
        context.logger.error(new Error(`Failed to delete torrent: ${response.statusText}`), {
          ok: response.ok,
          text: response.statusText,
          code: response.status,
          type: response.type,
        });
      }

      const oldDate = new Date(oldTorrent.added_on * 1000);

      context.logger.info('Old torrent item removed', {
        torrentName,
        addedOn: oldDate.toString(),
        progress: oldTorrent.progress,
        hash: oldTorrent.hash,
      });

      const formatter = Intl.DateTimeFormat(undefined, { month: 'long', day: 'numeric' });
      tadd(`Removing old ${torrentName} added on ${formatter.format(oldDate)}`);
    }
  }
}

export class MonitorDownloadingProgress extends Action<CompContext & { torrentName: string }> {
  async execute(context: { torrentName: string; } & CompContext & QueueContext): Promise<void> {
    const { torrentName, tlog } = context;

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
  }

  async onError(error: Error, context: QueueContext): Promise<void> {
    await (context as unknown as Partial<CompContext>).tlog?.('Monitoring failed');
    await super.onError(error, context);
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
export type SearchQueryContext = {
  query: string,
}
export type SearchResultsContext = {
  results: JacketResponseItem[],
}
export type SearchResultIndexContext = {
  index: number,
}
export type SearchResultContext = {
  result: JacketResponseItem,
}
export type SearchMessageContext = {
  messageId?: number,
}
export class SearchByQuery extends Action<SearchQueryContext & CompContext> {
  async execute(context: SearchQueryContext & CompContext & QueueContext): Promise<void> {
    const { query } = context;
    const baseQuery = query.trim();
    const hasResolutionSuffix = /\b\d+p$/i.test(baseQuery);
    const resolutionQueries = ['2160p', '1080p', '720p'].map((res) => `${baseQuery} ${res}`);
    const searchQueries = hasResolutionSuffix ? [baseQuery] : resolutionQueries;
    const results: JacketResponseItem[] = [];
    const seen = new Set<string>();

    for (const searchQuery of searchQueries) {
      const url = `${jackettHost}/api/v2.0/indexers/all/results?apikey=${jackettKey}&Query=${encodeURIComponent(searchQuery)}`;
      const response = await fetch(url);

      if (!response.ok) {
        context.logger.warn(`Bad response while searching for query: ${response.statusText}`, {
          status: response.status,
          ok: response.ok,
          url,
          query: searchQuery,
        });
        await context.tlog('Search failed. Try again later.');
        context.abort();
        return;
      }

      const data = await response.json();
      const batch = (data.Results ?? []) as JacketResponseItem[];

      for (const item of batch) {
        const key = item.Guid || item.Link || item.Title;
        if (seen.has(key)) {
          continue;
        }
        seen.add(key);
        results.push(item);
        if (results.length >= 5) {
          break;
        }
      }

      if (results.length >= 5) {
        break;
      }
    }

    if (!results.length) {
      await context.tlog(`No results for "${query}".`);
      context.abort();
      return;
    }

    context.extend({ results });
  }

  async onError(error: Error, context: QueueContext): Promise<void> {
    await (context as unknown as Partial<CompContext>).tlog?.('Search failed. Try again later.');
    await super.onError(error, context);
  }
}

export class StoreSearchResults extends Action<SearchQueryContext & SearchResultsContext & SearchMessageContext & CompContext> {
  async execute(context: SearchQueryContext & SearchResultsContext & SearchMessageContext & CompContext & QueueContext): Promise<void> {
    const topResults = context.results.slice(0, 5);
    const messageId = context.messageId;
    setSearchResults(context.chatId, context.query, topResults, messageId);
    context.extend({ results: topResults });
  }
}

export class ReplySearchResults extends Action<SearchQueryContext & SearchResultsContext & CompContext> {
  async execute(context: SearchQueryContext & SearchResultsContext & CompContext & QueueContext): Promise<void> {
    const { query, results } = context;
    const topResults = results.slice(0, 5);

    const keyboard = new InlineKeyboard();
    topResults.forEach((_, index) => {
      const title = topResults[index].Title ?? `Result ${index + 1}`;
      const numberedTitle = `${index + 1}. ${title}`;
      const label = numberedTitle.length > 60 ? `${numberedTitle.slice(0, 57)}...` : numberedTitle;
      keyboard.text(label, `search:get:${index + 1}`).row();
    });
    keyboard.text('Cancel', 'search:cancel');

    const list = topResults
      .map((item, index) => `${index + 1}. ${item.Title}`)
      .join('\n');
    const message = await context.bot.api.sendMessage(
      context.chatId,
      `Results for "${query}":\n${list}\n\nTap a button below.`,
      { reply_markup: keyboard }
    );

    context.extend({ messageId: message.message_id });
  }
}

export class ResolveSearchResult extends Action<SearchResultIndexContext & CompContext> {
  async execute(context: SearchResultIndexContext & CompContext & QueueContext): Promise<void> {
    const { chatId, index } = context;
    const cached = getSearchResults(chatId);

    if (!cached || cached.results.length === 0) {
      await context.tlog('No recent search results. Send a text query first.');
      context.abort();
      return;
    }

    if (!Number.isInteger(index) || index < 1 || index > cached.results.length) {
      await context.tlog(`Invalid id. Use /get <1-${cached.results.length}> from the latest search.`);
      context.abort();
      return;
    }

    context.extend({ result: cached.results[index - 1] });
  }
}

export class DownloadSearchResultFile extends Action<SearchResultContext & CompContext> {
  async execute(context: SearchResultContext & CompContext & QueueContext): Promise<void> {
    const { result } = context;
    const fileName = result.Title
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
    const absolutePathDownloadsDir = expandTilde(downloadsDir);
    const safeFileName = fileName || `torrent_${Date.now()}`;
    const destination = path.join(absolutePathDownloadsDir, `${safeFileName}.torrent`);

    const downloadLink = result.Link.startsWith('http')
      ? result.Link
      : `${jackettHost}${result.Link}`;

    const response = await fetch(downloadLink);
    if (!response.ok || !response.body) {
      context.logger.warn('Failed to download torrent file', {
        status: response.status,
        ok: response.ok,
        link: downloadLink,
      });
      await context.tlog('Failed to download torrent file.');
      context.abort();
      return;
    }

    const fileStream = fs.createWriteStream(destination);
    await finished(Readable.fromWeb(response.body as ReadableStream).pipe(fileStream));

    context.extend({
      filePath: destination,
    });
  }

  async onError(error: Error, context: QueueContext): Promise<void> {
    await (context as unknown as Partial<CompContext>).tlog?.('Failed to download torrent file.');
    await super.onError(error, context);
  }
}

export class SendTorrentFile extends Action<CompContext & { filePath: string }> {
  async execute({ bot, chatId, filePath }: CompContext & { filePath: string } & QueueContext): Promise<void> {
    const inputFile = new InputFile(filePath);
    await bot.api.sendDocument(chatId, inputFile);
  }
}

export class ClearSearchResults extends Action<SearchMessageContext & CompContext> {
  async execute(context: SearchMessageContext & CompContext & QueueContext): Promise<void> {
    const cached = getSearchResults(context.chatId);
    const messageId = context.messageId ?? cached?.messageId;

    if (messageId) {
      await context.bot.api.editMessageReplyMarkup(context.chatId, messageId, {
        reply_markup: { inline_keyboard: [] },
      });
    }

    clearSearchResults(context.chatId);
  }
}

export type TopicConfigContext = {
  topicConfig: TrackingTopic,
}
export class SearchTopic extends Action<TopicConfigContext & CompContext> {
  async execute(context: TopicConfigContext & CompContext & QueueContext): Promise<void> {
    const { topicConfig } = context;

    const url = `${jackettHost}/api/v2.0/indexers/all/results?apikey=${jackettKey}&Query=${encodeURIComponent(topicConfig.query)}`;

    const reportNotFound = async (reason: string): Promise<void> => {
      context.logger.info(reason, {
        topicConfig,
        url,
      });

      await context.tadd(`No topics found for "${topicConfig.query}" / "${topicConfig.guid}". Update tracking.json.`);

      const db = new DB();
      const existing = await db.findTopic(topicConfig.guid);
      if (!existing) {
        await db.addTopic(topicConfig.guid, new Date(0).toISOString());
      }
      await db.updateLastCheckDateTopic(topicConfig.guid, new Date().toISOString());

      context.abort();
    };

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
      await reportNotFound(`No topics found while searching: ${topicConfig.query}`);
      return;
    }

    // Map to a simple format or use the data as you wish
    const torrents = data.Results.map((torrent: any) => ({
      ...torrent,
    })) as JacketResponseItem[];

    const responseTopic = torrents.find((torrent) => topicConfig.guid === torrent.Guid);

    if (!responseTopic) {
      await reportNotFound('No topics found for provided guid/query pair');
      return;
    }

    const topic: Topic = {
      guid: responseTopic.Guid,
      link: responseTopic.Link,
      publishDate: responseTopic.PublishDate,
      title: responseTopic.Title,
    };

    context.extend({ topic });
  }
}

export type TopicContext = { topic: Topic };
export class CheckTopicInDB extends Action<TopicContext & CompContext> {
  async execute(context: TopicContext & CompContext & QueueContext): Promise<void> {
    const { topic, tadd } = context;

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
      await tadd('No updates found, resheduling');

      context.abort();
      return;
    }

    await db.updatePubDateTopic(topic.guid, topic.publishDate);

    context.logger.info('Topic is updates in DB', {
      topic: topic,
      dbTopic,
    });
  }
}

export class DownloadTopicFile extends Action<TopicContext & CompContext> {
  async execute(context: TopicContext & CompContext & QueueContext): Promise<void> {
    const { topic } = context;

    const fileName = topic.title
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
    const absolutePathDownloadsDir = expandTilde(downloadsDir);
    const destination = path.join(absolutePathDownloadsDir, `${fileName}.torrent`);

    const response = await fetch(topic.link);
    if (!response.ok || !response.body) {
      context.logger.warn('Failed to download file')
      context.abort();
      return;
    }

    const fileStream = fs.createWriteStream(destination);
    await finished(Readable.fromWeb(response.body as ReadableStream).pipe(fileStream));

    context.logger.info('Topic file downloaded', {
      ...topic,
      fileName,
      destination
    });

    context.extend({
      filePath: destination,
    });
  }
}

export class SetLastCheckedDate extends Action<TopicContext & CompContext> {
  async execute(context: TopicContext & CompContext & QueueContext): Promise<void> {
    const { topic } = context;
    const db = new DB();

    await db.updateLastCheckDateTopic(topic.guid, new Date().toISOString());
  }
}

export type SchedulerContext = { scheduleNextCheck: () => void }
export class ScheduleNextCheck extends Action<SchedulerContext & TopicConfigContext & CompContext> {
  async execute(context: SchedulerContext & TopicConfigContext & CompContext & QueueContext): Promise<void> {
    const { scheduleNextCheck } = context;

    scheduleNextCheck();
  }
}

export class Log extends Action<any> {
  async execute(context: any): Promise<void> {
    context.logger.info(`Log(${context.name()}) context:`, omit(context, 'bot', 'push', 'extend', 'name', 'browser', 'page', 'tlog', 'terr', 'abort'));
  }
}
