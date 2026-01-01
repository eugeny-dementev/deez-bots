import { Action, lockingClassFactory, QueueContext } from '@libs/actions';
import * as fs from 'fs';
import * as path from 'path';
import { promisify } from 'util';
import { moviesDir, qRawShowsDir, rawShowsDir, tvshowsDir } from '../config.js';
import { sleep } from '../helpers.js';
import { QBitTorrentContext } from '../types.js';
import { addTorrent, deleteTorrent, listTorrents } from '../services/qbittorrent-client.js';
import { CompContext } from './context.js';

const readFile = promisify(fs.readFile);

function resolveCategory(qdir: string, fdir?: string): string | undefined {
  if (fdir === rawShowsDir || qdir === qRawShowsDir) {
    return 'RAW TV Show';
  }

  if (fdir === tvshowsDir) {
    return 'TV Show';
  }

  if (fdir === moviesDir) {
    return 'Movie';
  }

  const normalized = qdir.toLowerCase();
  if (normalized.includes('raw') && normalized.includes('movie')) {
    return 'RAW Movie';
  }

  if (normalized.includes('raw') && (normalized.includes('tv') || normalized.includes('show'))) {
    return 'RAW TV Show';
  }

  if (normalized.includes('tv') || normalized.includes('show')) {
    return 'TV Show';
  }

  if (normalized.includes('movie')) {
    return 'Movie';
  }

  return undefined;
}

export class AddUploadToQBitTorrent extends lockingClassFactory<CompContext & QBitTorrentContext>('browser') {
  async execute(context: CompContext & QBitTorrentContext & QueueContext) {
    const { qdir, fdir, filePath, tlog } = context;

    const torrentBuffer = await readFile(path.resolve(filePath));
    const form = new FormData();
    form.set('torrents', new Blob([torrentBuffer], { type: 'application/x-bittorrent' }), path.basename(filePath));
    form.set('savepath', qdir);

    const category = resolveCategory(qdir, fdir);
    if (category) {
      form.set('category', category);
    }

    context.logger.info('Submitting torrent through qBittorrent API', {
      filePath,
      qdir,
      category,
    });

    await addTorrent(form);

    await tlog('Torrent file submitted');
  }

  async onError(error: Error, context: QueueContext): Promise<void> {
    await (context as unknown as Partial<CompContext>).tlog?.('Failed to add torrent to download');
    await super.onError(error, context);
  }
}

export class RemoveOldTorrentItem extends Action<CompContext & { torrentName: string }> {
  async execute(context: CompContext & { torrentName: string } & QueueContext): Promise<void> {
    const { torrentName, tadd } = context;

    context.logger.info('Searching old torrents to remove', {
      torrentName,
      filePath: context.filePath,
    });

    const torrents = await listTorrents('seeding');
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
      const response = await deleteTorrent(oldTorrent.hash, false);

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
  async execute(context: { torrentName: string } & CompContext & QueueContext): Promise<void> {
    const { torrentName, tlog } = context;

    let progressCache = '';
    let downloaded = false;
    while (!downloaded) {
      const torrents = await listTorrents('downloading');
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
