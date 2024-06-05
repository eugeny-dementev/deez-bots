export const swapDir = process.env.SWAP_DIR as string;

if (!swapDir) throw new Error('SWAP_DIR must be specified');

export const token = process.env.BOT_TOKEN as string

export const publishersIds = String(process.env.PUBLISHERS_IDS)
  .split(',')
  .map((id: string): number => parseInt(id))

export const adminId = Number(process.env.ADMIN_ID);

export const cameraCorridorUrl = process.env.CAMERA_CORRIDOR as string;

if (!cameraCorridorUrl) {
  throw new Error('CAMERA_CORRIDOR must be provided');
}
