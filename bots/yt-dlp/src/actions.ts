import { LoggerOutput, NotificationsOutput } from '@libs/actions';
import { exec, prepare } from '@libs/command';
import { Action, QueueContext } from 'async-queue-runner';
import del from 'del';
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

export class PrepareYtDlpMaxRes extends Action<VideoMetaContext & CompContext> {
  async execute(context: VideoMetaContext & CompContext & QueueContext): Promise<void> {
    const { sizes } = context;

    const maxAvailableRes = sizes.sort((a, b) => a.res - b.res).pop()!.res;

    context.logger.debug('Sises:', { maxAvailableRes });

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
      context.abort();
      return;
    }

    context.logger.debug('Sises:', { minAvailableRes });

    context.extend({ ydres: Math.min(minAvailableRes, minRes) });
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
  async execute({ lastFile, abort, url, extend, terr, tadd, tlog }: LastFileContext & CompContext & QueueContext): Promise<void> {
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

    try {
      tadd('Converting video for uploading');

      await exec(command);
      await del(lastFile, { force: true });
      extend({ lastFile: newFilePath });

      tlog('Video ready for uploading');
    } catch (stderr: unknown) {
      if (typeof stderr === 'string') {
        terr('Failed to convert video ' + url);
      } else {
        terr(stderr as Error);
      }

      tlog('Failed to download video');
      abort();
    }
  }
}

export class ExtractVideoDimensions extends Action<CompContext & LastFileContext> {
  async execute({ lastFile, extend, terr, tlog }: LastFileContext & CompContext & QueueContext): Promise<void> {
    // command
    // ffprobe -v error -show_entries stream=width,height -of default=noprint_wrappers=1 .\YKUNMpHk_cs.mp4
    //
    // stdout
    // width=720
    // height=1280
    const command = `ffprobe -v error -show_entries stream=width,height -of default=noprint_wrappers=1 ${lastFile}`

    try {
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
    } catch (e: unknown) {
      if (typeof e === 'string') {
        tlog('Failed to extract video dimensions');
        terr(e);
      } else {
        terr(e as Error);
      }
    }
  }
}

export class DeleteFile extends Action<LastFileContext> {
  async execute({ lastFile }: LastFileContext): Promise<void> {
    await del(lastFile, { force: true });
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
