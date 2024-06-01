import { LoggerOutput, NotificationsOutput, VideoDimensions } from '@libs/actions';
import { exec, prepare } from '@libs/command';
import { Action, QueueContext } from 'async-queue-runner';
import del from 'del';
import fs from 'fs/promises';
import path from 'path';
import { cameraCorridorUrl, swapDir } from './config.js';
import {
  BotContext,
  FileContext
} from './types.js';

export type DevContext = LoggerOutput & NotificationsOutput;

export type RoomContext = { room: string };
export class PrepareFilePath extends Action<RoomContext & DevContext> {
  async execute(context: RoomContext & LoggerOutput & NotificationsOutput & QueueContext): Promise<void> {
    const { room } = context;

    const fileName = `${room}_${Date.now()}.mp4`;
    const filePath = path.join(swapDir, fileName);

    context.logger.info('Preparer filePath', { filePath });

    context.extend({ filePath });
  }
}

export class RecordRoom extends Action<FileContext & DevContext> {
  async execute(context: FileContext & DevContext & QueueContext): Promise<void> {
    const { filePath, tlog, logger } = context;

    const command = prepare('ffmpeg')
      .add('-t 00:00:05') // 5 seconds video
      .add(`-i ${cameraCorridorUrl}`)
      .add(filePath)
      .toString();

    logger.info('Start recording room', {
      command,
    });
    await exec(command);

    logger.info('Room recorded', { filePath });
    tlog('Room recorded');
  }
}

export class DeleteFile extends Action<FileContext> {
  async execute({ filePath }: FileContext): Promise<void> {
    await del(filePath, { force: true });
  }
}

export class UploadVideo extends Action<VideoDimensions & FileContext & DevContext> {
  async execute(context: VideoDimensions & BotContext & FileContext & DevContext & QueueContext): Promise<void> {
    const { filePath, chatId, bot, width, height, tlog, logger } = context

    logger.info('Reading file into memory', { filePath })
    const videoBuffer = await fs.readFile(filePath);

    logger.info('Uploading video to telegram');
    tlog('Uploading video');
    await bot.telegram.sendVideo(chatId, { source: videoBuffer }, { width, height });

    tlog('Video uploaded');
  }
}
