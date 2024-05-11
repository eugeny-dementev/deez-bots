export const swapDir = process.env.SWAP_DIR;
export const homeDir = process.env.HOME_DIR;
export const storageDir = process.env.STORAGE_DIR;

export const channelId = Number(process.env.CHANNEL_ID);

if (!homeDir || !swapDir) throw new Error('SWAP_DIR and HOME_DIR must be specified');

export const token = process.env.BOT_TOKEN as string

export const publishersIds = String(process.env.PUBLISHERS_IDS)
  .split(',')
  .map((id: string): number => parseInt(id))

export const adminId = Number(process.env.ADMIN_ID);

export const cookiesPath = process.env.COOKIES_PATH;
