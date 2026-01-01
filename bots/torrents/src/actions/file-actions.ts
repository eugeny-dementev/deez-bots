import { Action, QueueContext } from '@libs/actions';
import expandTilde from 'expand-tilde';
import * as fs from 'fs';
import { InputFile } from 'grammy';
import * as path from 'path';
import { promisify } from 'util';
import { downloadsDir } from '../config.js';
import { russianLetters, russianToEnglish } from '../helpers.js';
import { CompContext, FileContext } from './context.js';

const unlink = promisify(fs.unlink);

export class RenameFile extends Action<CompContext & FileContext> {
  async execute(context: CompContext & FileContext & QueueContext): Promise<void> {
    const { fileName, extend, logger } = context;

    logger.info('New file', {
      fileName,
    });

    const filenameObject = path.parse(fileName);
    const newName = filenameObject.name
      .toLowerCase()
      .split('')
      .map((char: string) => {
        if (russianLetters.has(char)) {
          return russianToEnglish[char as keyof typeof russianToEnglish] || char;
        } else return char;
      })
      .join('')
      .replace(/\s+/g, '_')
      .replace(/[^a-z0-9_]/g, '');

    const newFileName = `${newName}.${filenameObject.ext}`;

    logger.info('File renamed', {
      fileName: newFileName,
    });

    extend({
      fileName: newFileName,
    });
  }
}

export class DownloadFile extends Action<CompContext & FileContext> {
  async execute(context: CompContext & FileContext & QueueContext): Promise<void> {
    const { fileName, extend, logger, file } = context;

    const absolutePathDownloadsDir = expandTilde(downloadsDir);
    const destination = path.join(absolutePathDownloadsDir, fileName);

    await file.download(destination);

    logger.info('File downloaded', {
      fileName,
    });

    extend({
      filePath: destination,
    });
  }
}

export class DeleteFile extends Action<CompContext> {
  async execute(context: CompContext): Promise<void> {
    await unlink(context.filePath);
  }
}

export class SendTorrentFile extends Action<CompContext & { filePath: string }> {
  async execute({ bot, chatId, filePath }: CompContext & { filePath: string } & QueueContext): Promise<void> {
    const inputFile = new InputFile(filePath);
    await bot.api.sendDocument(chatId, inputFile);
  }
}
