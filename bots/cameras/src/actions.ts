import { Action, QueueContext } from 'async-queue-runner';
import del from 'del';
import expendTilda from 'expand-tilde';
import fsPromises from 'fs/promises';
import { glob } from 'glob';
import path from 'path';
import shelljs from 'shelljs';
import { homeDir, swapDir } from './config.js';
import { USER_LIMITS } from './constants.js';
import { getLinkType, omit } from './helpers.js';
import {
  BotContext,
  CommandContext,
  FContextMessage,
  FileContext,
  LinkTypeContext,
  VideoDimensions,
  VideoDimensionsContext,
} from './types.js';







export class DeleteFile extends Action<FileContext> {
  async execute({ filePath }: FileContext): Promise<void> {
    await del(filePath, { force: true });
  }
}

export class UploadVideo extends Action<BotContext & VideoDimensionsContext & FileContext> {
  async execute({ lastFile, bot, width, height, channelId }: VideoDimensionsContext & BotContext & FileContext & QueueContext): Promise<void> {
    const videoBuffer = await fsPromises.readFile(lastFile);

    await bot.telegram.sendVideo(channelId!, { source: videoBuffer }, { width, height });
  }
}

export class SetChatIdToChannelId extends Action<BotContext> {
  async execute({ chatId, extend }: BotContext & QueueContext): Promise<void> {
    extend({ channelId: chatId });
  }
}
