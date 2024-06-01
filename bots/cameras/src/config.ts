export const swapDir = process.env.SWAP_DIR;
export const homeDir = process.env.HOME_DIR as string;

if (!homeDir || !swapDir) throw new Error('SWAP_DIR and HOME_DIR must be specified');

export const token = process.env.BOT_TOKEN as string

export const publishersIds = String(process.env.PUBLISHERS_IDS)
  .split(',')
  .map((id: string): number => parseInt(id))

export const adminId = Number(process.env.ADMIN_ID);

export const cameraCorridorUrl = process.env.CAMERA_CORRIDOR as string;

if (!cameraCorridorUrl) {
  throw new Error('CAMERA_CORRIDOR must be provided');
}
