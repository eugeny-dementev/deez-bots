import { Action, QueueContext } from '@libs/actions';
import { exec, prepare } from '@libs/command';
import { glob } from 'glob';
import * as path from 'path';
import { tvshowsDir } from '../config.js';
import { fileExists, getDirMaps, wildifySquareBrackets } from '../helpers.js';
import { MultiTrack, MultiTrackContext, QBitTorrentContext } from '../types.js';
import { CompContext } from './context.js';

export class ConvertMultiTrack extends Action<CompContext & MultiTrackContext & QBitTorrentContext> {
  async execute(context: CompContext & MultiTrackContext & QBitTorrentContext & QueueContext): Promise<void> {
    const { fdir, tracks, torrentDirName, tlog, tadd } = context;
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
        oldFiles++;

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
