import { moviesDir, qMoviesDir, qTvshowsDir, tvshowsDir } from "./config.js";
import { DestContext, TFile } from "./types.js";

/**
 * Check torrent files
 */
export function getDestination(files: TFile[]): DestContext {
  let hasMkv = false;
  let hasMp4 = false;

  for (const file of files) {
    const { path } = file;

    const parts = path.split('\\');

    const name = parts.pop() as string;
    const ext = name ? name.split('.').pop() : '';

    if (!ext) {
      throw new Error('Torrent should contain only *.mkv or *.mp4 files');
    }

    const lowerExt = ext.toLowerCase();

    if (lowerExt === 'mkv') {
      hasMkv = true;

      if (parts.length > 1) {
        throw new Error('torrent should contain no more than one directory with *.mkv files in it');
      }
    } else if (lowerExt === 'mp4') {
      hasMp4 = true;

      if (parts.length > 0) {
        throw new Error('MP4 torrents should contain files in the root folder only');
      }
    } else {
      throw new Error('Torrent should contain only *.mkv or *.mp4 files');
    }
  }

  if (hasMkv && hasMp4) {
    throw new Error('Torrent should not mix *.mkv and *.mp4 files');
  }

  if (files.length > 1) {
    return {
      qdir: qTvshowsDir,
      fdir: tvshowsDir,
    }
  };

  // Arcane.S02E01.Heavy.Is.the.Crown.mkv
  const fileName = files[0].name;
  if (/S\d{1,2}E\d{1,2}/.test(fileName)) {
    return {
      qdir: qTvshowsDir,
      fdir: tvshowsDir,
    }
  }

  return {
    qdir: qMoviesDir,
    fdir: moviesDir,
  };
}
