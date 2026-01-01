import { Action, QueueContext } from '@libs/actions';
import * as fs from 'fs';
import * as path from 'path';
import { promisify } from 'util';
import { moviesDir, qRawShowsDir, rawShowsDir, tvshowsDir } from '../config.js';
import multiTrackRecognizer from '../multi-track.js';
import { getDestination } from '../torrent.js';
import { DestContext, MultiTrackContext, QBitTorrentContext, Torrent } from '../types.js';
import { CompContext } from './context.js';

const readFile = promisify(fs.readFile);

type ParseTorrentFn = (data: Buffer) => Torrent;

async function resolveParseTorrent(context: unknown): Promise<ParseTorrentFn> {
  const maybeContext = context as { parseTorrent?: ParseTorrentFn } | null;
  if (typeof maybeContext?.parseTorrent === 'function') {
    return maybeContext.parseTorrent;
  }

  const mod = await import('parse-torrent');
  const parser = (mod as { default?: unknown }).default ?? mod;
  return parser as unknown as ParseTorrentFn;
}

export class CheckTorrentFile extends Action<CompContext & QBitTorrentContext> {
  async execute(context: CompContext & Partial<MultiTrackContext> & QBitTorrentContext & QueueContext): Promise<void> {
    const { filePath, tlog } = context;

    if (context.type === 'multi-track') {
      return;
    }

    const file = await readFile(path.resolve(filePath));
    const parseTorrent = await resolveParseTorrent(context);
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
    const dirs = new Set<string>();

    context.logger.info('Parsing torrent file ' + filePath);
    const file = await readFile(path.resolve(filePath));
    const parseTorrent = await resolveParseTorrent(context);
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

export class ReadTorrentFile extends Action<CompContext & { torrentName: string }> {
  async execute(context: CompContext & { torrentName: string } & QueueContext): Promise<void> {
    const { filePath, tadd } = context;

    const file = await readFile(path.resolve(filePath));
    const parseTorrent = await resolveParseTorrent(context);
    const torrent = await parseTorrent(file) as Torrent;
    const torrentName = torrent.name;

    tadd(`Torrent name: ${torrentName}`);

    context.extend({ torrentName });
  }
}
