import { LoggerOutput, NotificationsOutput } from '@libs/actions';
import { exec, prepare } from '@libs/command';
import { Action, QueueContext } from '@libs/actions';
import expendTilda from 'expand-tilde';
import { glob } from 'glob';
import { InputFile } from 'grammy';
import path from 'path';
import { homeDir, maxRes, minRes } from './config.js';
import {
  BotContext,
  LastFileContext,
  VideoDimensions,
  VideoDimensionsContext,
  VideoMetaContext
} from './types.js';

export class CleanUpUrl extends Action<BotContext> {
  async execute({ url, extend }: BotContext & QueueContext): Promise<void> {
    const l = new URL(url);

    const cleanUrl = `${l.origin}${l.pathname}`;

    extend({ url: cleanUrl })
  }
}

type CompContext = BotContext & LoggerOutput & NotificationsOutput;

const deleteFile = async (filePath: string): Promise<void> => {
  const { deleteAsync } = await import('del');
  await deleteAsync(filePath, { force: true });
};

export class PrepareYtDlpMaxRes extends Action<VideoMetaContext & CompContext> {
  async execute(context: VideoMetaContext & CompContext & QueueContext): Promise<void> {
    const { sizes } = context;

    const maxAvailableRes = sizes.sort((a, b) => a.res - b.res).pop()!.res;

    context.logger.debug('Sises:', { maxAvailableRes });

    context.logger.debug('Choosing max of two resolutions', {
      configMaxRes: maxRes,
      videoMaxRes: maxAvailableRes,
    });
    const chosenMaxRes = Math.min(maxAvailableRes, maxRes);

    context.logger.info('Chosen max resolution:', { res: chosenMaxRes });

    context.extend({ ydres: chosenMaxRes });
  }
}

export class PrepareYtDlpMinRes extends Action<VideoMetaContext & CompContext> {
  async execute(context: VideoMetaContext & CompContext & QueueContext): Promise<void> {
    const { sizes } = context;

    const minAvailableRes = sizes
      .filter(({ size }) => size < 49.9)
      .sort((a, b) => a.res - b.res).pop()?.res;

    if (!minAvailableRes || minAvailableRes < minRes) {
      context.tlog('No suitable file sizes for desired resolution');
      context.logger.info('No suitable file sizes for desired resolution', {
        minAvailableRes,
      });
      context.abort();
      return;
    }

    context.logger.debug('Sises:', { minAvailableRes });

    context.logger.debug('Choose min or two resolutions', {
      configMinRes: minRes,
      videoMinRes: minAvailableRes,
    });

    const chosenMinRes = Math.min(minAvailableRes, minRes);

    context.logger.info('Chosen min resolution', { res: chosenMinRes });

    context.extend({ ydres: chosenMinRes });
  }
}

export class PrepareYtDlpName extends Action<CompContext> {
  async execute(context: CompContext & QueueContext): Promise<void> {
    const { destFileName } = context;

    context.extend({ ydname: destFileName });
  }
}

export class FindFile extends Action<CompContext> {
  async execute({ logger, extend, destFileName }: CompContext & QueueContext): Promise<void> {

    if (!homeDir) throw new Error('No home dir found');

    let homePath = homeDir;

    if (homePath.includes('~')) homePath = expendTilda(homePath);

    const pattern = path.join(homePath, `${destFileName}.*`);
    const files = await glob.glob(pattern, { windowsPathsNoEscape: true });

    if (files.length === 0) {
      return;
    }

    const lastFile = files[0];

    logger.info('File for conversion downloaded:', {
      destFileName,
      lastFile,
    });

    extend({ lastFile });
  }
}

export class ConvertVideo extends Action<LastFileContext & CompContext> {
  async execute(context: LastFileContext & CompContext & QueueContext): Promise<void> {
    const { lastFile, url, extend, tadd, tlog } = context;
    const fileData = path.parse(lastFile);
    const newFileName = `${fileData.name}.new`;
    const newFilePath = path.join(fileData.dir, `${newFileName}.mp4`);

    const command = prepare('ffmpeg')
      .add(`-i ${lastFile}`)
      .add('-c:v libx264')
      .add('-crf 28')
      .add('-preset veryslow')
      .add('-c:a copy')
      .add(newFilePath)
      .toString();

    tadd('Converting video for uploading');

    await exec(command);
    await deleteFile(lastFile);
    extend({ lastFile: newFilePath });

    tlog('Video ready for uploading');
  }

  async onError(error: Error, context: QueueContext): Promise<void> {
    await (context as unknown as Partial<CompContext>).tlog?.('Failed to download video');
    await super.onError(error, context);
  }
}

export class ExtractVideoDimensions extends Action<CompContext & LastFileContext> {
  async execute(context: LastFileContext & CompContext & QueueContext): Promise<void> {
    const { lastFile, extend, tlog } = context;
    // command
    // ffprobe -v error -show_entries stream=width,height -of default=noprint_wrappers=1 .\YKUNMpHk_cs.mp4
    //
    // stdout
    // width=720
    // height=1280
    const command = `ffprobe -v error -show_entries stream=width,height -of default=noprint_wrappers=1 ${lastFile}`

    const stdout = await exec(command);
    const { width, height } = stdout
      .trim()
      .split('\n').map(s => s.trim())
      .map((str: string): string[] => str.split('=').map(s => s.trim()))
      .reduce<VideoDimensions>((obj: VideoDimensions, pair: string[]): VideoDimensions => {
        const field = pair[0] as 'width' | 'height';
        const value = Number(pair[1]);
        obj[field] = value;

        return obj;
      }, {} as VideoDimensions);

    extend({ width, height });
  }

  async onError(error: Error, context: QueueContext): Promise<void> {
    await (context as unknown as Partial<CompContext>).tlog?.('Failed to extract video dimensions');
    await super.onError(error, context);
  }
}

export class DeleteFile extends Action<LastFileContext> {
  async execute({ lastFile }: LastFileContext): Promise<void> {
    await deleteFile(lastFile);
  }
}

export class UploadVideo extends Action<BotContext & VideoDimensionsContext & LastFileContext> {
  async execute({ lastFile, bot, width, height, channelId }: VideoDimensionsContext & BotContext & LastFileContext & QueueContext): Promise<void> {
    const inputFile = new InputFile(lastFile);

    await bot.api.sendVideo(channelId!, inputFile, { width, height });
  }
}

export class SetChatIdToChannelId extends Action<CompContext> {
  async execute({ logger, chatId, extend }: CompContext & QueueContext): Promise<void> {
    logger.info('Setting channldId to chatId', { chatId });

    extend({ channelId: chatId });
  }
}
