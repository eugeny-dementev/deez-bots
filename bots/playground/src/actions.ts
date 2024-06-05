import { LoggerOutput, NotificationsOutput, parseYtDlpError } from '@libs/actions';
import { exec, prepare } from '@libs/command';
import { Action, QueueContext } from 'async-queue-runner';
import del from 'del';
import expendTilda from 'expand-tilde';
import { glob } from 'glob';
import path from 'path';
import { homeDir, storageDir, swapDir } from './config.js';
import { USER_LIMITS } from './constants.js';
import { omit } from './helpers.js';
import {
    BotContext,
    LastFileContext,
    VideoDimensions,
    VideoDimensionsContext,
} from './types.js';
import { InputFile } from 'grammy';

type CompContext = BotContext & NotificationsOutput & LoggerOutput;

export class CalcTimeLeft extends Action<CompContext> {
  async execute(context: CompContext & QueueContext): Promise<void> {
    const { userId, role, limitsStatus, extend } = context;

    const currentUserLimit = USER_LIMITS[role];

    let timeLimitLeft = 0;

    if (limitsStatus[userId]) {
      timeLimitLeft = Math.max(timeLimitLeft, currentUserLimit - (Date.now() - limitsStatus[userId]));
    }

    if (timeLimitLeft <= 1000) timeLimitLeft = 0;

    extend({ timeLimitLeft });
  }
}

export class SetLimitStatus extends Action<CompContext> {
  async execute(context: CompContext & QueueContext): Promise<void> {
    const { userId, limitsStatus } = context;

    limitsStatus[userId] = Date.now();
  }
}

export class DeleteLimitStatus extends Action<CompContext> {
  async execute(context: CompContext & QueueContext): Promise<void> {
    const { userId, limitsStatus } = context;

    delete limitsStatus[userId];
  }
}

export class Log extends Action<any> {
  async execute(context: any): Promise<void> {
    // console.log(`Log(${context.name()}) context:`, omit(context, 'bot', 'push', 'stop', 'extend', 'name', 'stdout'));
    console.log(`Log(${context.name()}) context:`, omit(context, 'bot', 'push', 'stop', 'extend', 'name'));
  }
}

export class CleanUpUrl extends Action<CompContext> {
  async execute({ url, extend }: CompContext & QueueContext): Promise<void> {
    const l = new URL(url);

    const cleanUrl = `${l.origin}${l.pathname}`;

    extend({ url: cleanUrl })
  }
}

export class DownloadVideo extends Action<CompContext & NotificationsOutput> {
  async execute({ url, destDir, cookiesPath, userId, destFileName, terr, tlog }: CompContext & QueueContext & { destDir: string }): Promise<void> {
    if (!destDir) throw Error('No destDir specified');

    const userHomeDir = path.join(destDir, destDir == homeDir ? String(userId) : '');

    const command = prepare('yt-dlp')
      .add(`-S "res:${destDir === storageDir ? '1080' : '480'}"`)
      .add(`--paths home:${userHomeDir}`)
      .add(`--paths temp:${swapDir}`)
      .add(`--cookies ${cookiesPath}`, Boolean(cookiesPath))
      .add(`--output "${destFileName}.%(ext)s"`, destDir === homeDir)
      .add(`--output "${destFileName}.%(title)s.%(ext)s"`, destDir !== homeDir)
      .add(url)
      .toString();

    try {
      await exec(command);
      tlog('Video downloaded');
    } catch (stderr: unknown) {
      if (typeof stderr === 'string') {
        const error = parseYtDlpError(stderr);
        terr(new Error(error));
      } else {
        terr(stderr as Error);
      }

      tlog('Failed to download video');
      throw stderr
    }
  }
}

export class FindMainFile extends Action<CompContext> {
  async execute({ extend, destFileName }: CompContext & QueueContext): Promise<void> {

    if (!storageDir) throw new Error('No storage dir found');

    let homePath = storageDir;

    if (homePath.includes('~')) homePath = expendTilda(homePath);

    const pattern = path.join(homePath, `${destFileName}.*`);
    const files = await glob.glob(pattern, { windowsPathsNoEscape: true });

    if (files.length === 0) {
      return;
    }

    const mainFile = files[0];

    extend({ globPattern: pattern, globFiles: files, mainFile });
  }
}

export class FindFile extends Action<CompContext> {
  async execute({ userId, extend, destFileName }: CompContext & QueueContext): Promise<void> {

    if (!homeDir) throw new Error('No home dir found');

    let homePath = homeDir;

    if (homePath.includes('~')) homePath = expendTilda(homePath);

    const pattern = path.join(homePath, String(userId), `${destFileName}.*`);
    const files = await glob.glob(pattern, { windowsPathsNoEscape: true });

    if (files.length === 0) {
      return;
    }

    const lastFile = files[0];

    extend({ globPattern: pattern, globFiles: files, lastFile });
  }
}

export class ConvertVideo extends Action<LastFileContext & CompContext> {
  async execute({ lastFile, url, terr, tlog }: LastFileContext & CompContext & QueueContext): Promise<void> {
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
      await exec(command);
      tlog('Video ready for uploading');
    } catch (stderr: unknown) {
      if (typeof stderr === 'string') {
        terr('Failed to convert video ' + url);
      } else {
        terr(stderr as Error);
      }

      tlog('Failed to download video');
      throw stderr
    }
  }
}

export class ExtractVideoDimentions extends Action<CompContext & LastFileContext> {
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

export class UploadVideo extends Action<CompContext & VideoDimensionsContext & LastFileContext> {
  async execute({ lastFile, bot, width, height, channelId, terr, tlog }: VideoDimensionsContext & CompContext & LastFileContext & QueueContext): Promise<void> {
    const inputFile = new InputFile(lastFile);

    try {
      await bot.api.sendVideo(channelId!, inputFile, { width, height });
    } catch (e) {
      terr(e as Error);
      tlog('Failed to upload video to telegram');

      throw e;
    }
  }
}

export class SetChatIdToChannelId extends Action<CompContext> {
  async execute({ chatId, extend }: CompContext & QueueContext): Promise<void> {
    extend({ channelId: chatId });
  }
}
