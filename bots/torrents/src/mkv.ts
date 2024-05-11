import shell from 'shelljs';

type TrackMeta = {
  type: 'video' | 'audio' | 'subtitles',
  properties: {
    pixel_dimensions: string,
    language: string,
  },
};
type MKVMetadata = {
  container: {
    properties: {
      title?: string,
    },
  },
  tracks: TrackMeta[],
}

/**
 * @param filePath {string} path to the mkv file
 * @TODO make async. Currently it block execution until command is finished
 */
export function getMKVMetadata(filePath: string): MKVMetadata {
  // spawn mkvmerge -J filepath
  // wait reponse
  // JSON.parse
  // return mkv file metadata
  console.log('shell', shell);

  const something = shell.exec('mkvmerge -J "D:/RAW TV Shows/ID Invaded [BDRip 1080p]/[SweetSub&VCB-Studio] ID INVADED [01][Ma10p_1080p][x265_flac].mkv"', { silent: true });

  return JSON.parse(something);
}
