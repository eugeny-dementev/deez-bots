import { LoggerOutput, NotificationsOutput } from '@libs/actions';
import { FileX } from 'node_modules/@grammyjs/files/out/files.js';
import { BotContext } from '../types.js';

export type CompContext = BotContext & LoggerOutput & NotificationsOutput;

export type FileContext = {
  file: FileX;
  fileName: string;
};
