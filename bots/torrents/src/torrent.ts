import { moviesDir, qMoviesDir, qTvshowsDir, tvshowsDir } from "./config.js";
import { DestContext, TFile } from "./types.js";

/**
 * Check torrent files
 */
export function getDestination(files: TFile[]): DestContext {
  for (const file of files) {
    const { path } = file;

    const parts = path.split('\\');

    if (parts.length > 2 || !/S[0-9]{2}E[0-9]{2}/.test(path)) {
      throw new Error('torrent should contain no more than one directory with *.mkv files in it');
    }

    const name = parts.pop() as string

    if (!/\.mkv$/.test(name)) {
      throw new Error('Torrent should contain only *.mkv files');
    }
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
