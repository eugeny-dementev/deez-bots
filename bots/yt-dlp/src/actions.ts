import { LoggerOutput, NotificationsOutput } from '@libs/actions';
import { Action, QueueContext } from 'async-queue-runner';
import del from 'del';
import expendTilda from 'expand-tilde';
import { glob } from 'glob';
import { InputFile } from 'grammy';
import path from 'path';
import shelljs from 'shelljs';
import { homeDir, maxRes, minRes } from './config.js';
import {
  BotContext,
  CommandContext,
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
      context.tadd('No suitable file sizes for desired resolution');
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

export class FindFile extends Action<BotContext> {
  async execute({ userId, extend, destFileName }: BotContext & QueueContext): Promise<void> {

    if (!homeDir) throw new Error('No home dir found');

    let homePath = homeDir;

    if (homePath.includes('~')) homePath = expendTilda(homePath);

    const pattern = path.join(homePath, `${destFileName}.*`);
    const files = await glob.glob(pattern, { windowsPathsNoEscape: true });

    if (files.length === 0) {
      return;
    }

    const lastFile = files[0];

    extend({ lastFile });
  }
}

export class PrepareConvertCommand extends Action<LastFileContext> {
  async execute({ lastFile, extend }: LastFileContext & QueueContext): Promise<void> {
    const fileData = path.parse(lastFile);
    const newFileName = `new_${fileData.name}`;
    const newFilePath = path.join(fileData.dir, `${newFileName}.mp4`);
    // ffmpeg -i ./YKUNMpHk_cs.any ./new_YKUNMpHk_cs.mp4
    const command = `ffmpeg -i ${lastFile} -c:v libx264 -crf 28 -preset veryslow -c:a copy ${newFilePath}`;

    extend({ command, destFileName: newFileName });
  }
}

export class PrepareVideoDimensionsCommand extends Action<LastFileContext> {
  async execute({ lastFile, extend }: LastFileContext & QueueContext): Promise<void> {
    // command
    // ffprobe -v error -show_entries stream=width,height -of default=noprint_wrappers=1 .\YKUNMpHk_cs.mp4
    //
    // stdout
    // width=720
    // height=1280
    const command = `ffprobe -v error -show_entries stream=width,height -of default=noprint_wrappers=1 ${lastFile}`

    extend({ command });
  }
}

export class ExtractVideoDimensions extends Action<CommandContext> {
  async execute({ stdout, extend }: CommandContext & QueueContext): Promise<void> {
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
}

export class ExecuteCommand extends Action<CommandContext> {
  delay: number = 1000;

  async execute(context: CommandContext & QueueContext): Promise<void> {
    return new Promise((res, rej) => {
      if (!context.command) {
        rej('Command not found in the context');

        return;
      }

      shelljs.exec(context.command!, { async: true }, (code, stdout, stderr) => {
        delete context.command;

        if (code === 0) {
          res();

          context.extend({ stdout });

          return;
        }

        rej(stderr.toString());
      });
    });
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

export class SetChatIdToChannelId extends Action<BotContext> {
  async execute({ chatId, extend }: BotContext & QueueContext): Promise<void> {
    extend({ channelId: chatId });
  }
}
