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

export const moviesDir = String(process.env.MOVIES_DIR);
export const tvshowsDir = String(process.env.TV_SHOWS_DIR);

export const audioPriorities = String(process.env.AUDIO_PRIORITIES).split(',');
export const subsPriorities = String(process.env.SUBTITLE_PRIORITIES).split(',');
