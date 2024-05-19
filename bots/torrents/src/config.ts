export const qBitTorrentHost = `http://${process.env.QBT_HOSTNAME ?? 'localhost'}:8080`;

export const downloadsDir = process.env.DOWNLOADS_DIR as string;
if (!downloadsDir) {
  throw new Error('No DOWNLOADS_DIR env provided');
}

export const token = process.env.BOT_TOKEN as string;

export const publishersIds = String(process.env.PUBLISHERS_IDS)
  .split(',')
  .map((id) => Number(id));

export const adminId = Number(process.env.ADMIN_ID as string);
if (!adminId) {
  throw new Error('No ADMIN_ID env provided');
}

export const dirMaps = String(process.env.DIR_MAPS);

export const qMoviesDir = String(process.env.Q_MOVIES_DIR);
export const qTvshowsDir = String(process.env.Q_TV_SHOWS_DIR);
export const qRawShowsDir = String(process.env.Q_RAW_TV_SHOWS_DIR);

export const moviesDir = String(process.env.MOVIES_DIR);
export const tvshowsDir = String(process.env.TV_SHOWS_DIR);
export const rawShowsDir = String(process.env.RAW_TV_SHOWS_DIR);

export const audioPriorities = String(process.env.AUDIO_PRIORITIES).split(',');
export const subsPriorities = String(process.env.SUBTITLE_PRIORITIES).split(',');

export const isWin = process.platform === "win32";
