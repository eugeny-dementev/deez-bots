import { QueueRunner } from 'async-queue-runner';
import expandTilde from 'expand-tilde';
import * as fs from 'fs';
import * as path from 'path';
import { Readable } from 'stream';
import { finished } from 'stream/promises';
import { ReadableStream } from 'stream/web';
import { Telegraf } from 'telegraf';
import { message } from 'telegraf/filters';
import { adminId, downloadsDir, qMoviesDir, publishersIds, token } from './config.js';
import { handleQBTFile } from './performances.js';
import { loggerFactory } from '@libs/actions';

// Map of Russian to English transliteration
const russianToEnglish = {
  'а': 'a', 'б': 'b', 'в': 'v', 'г': 'g', 'д': 'd', 'е': 'e', 'ё': 'e', 'ж': 'zh',
  'з': 'z', 'и': 'i', 'й': 'y', 'к': 'k', 'л': 'l', 'м': 'm', 'н': 'n', 'о': 'o',
  'п': 'p', 'р': 'r', 'с': 's', 'т': 't', 'у': 'u', 'ф': 'f', 'х': 'h', 'ц': 'c',
  'ч': 'ch', 'ш': 'sh', 'щ': 'sch', 'ъ': '', 'ы': 'y', 'ь': '', 'э': 'e', 'ю': 'yu',
  'я': 'ya'
};
const russianLetters = new Set(Object.keys(russianToEnglish));

const logger = loggerFactory();
const queue = new QueueRunner({
  logger,
});

logger.setContext('TorrentsBot');
queue.addEndListener(() => logger.setContext('TorrentsBot'));

const bot = new Telegraf(token);

bot.start((ctx) => ctx.reply('Welcome to Sverdlova'));
bot.help((ctx) => ctx.reply('Send me a torrent with mkv files'));

const allowedUsers = new Set([
  adminId,
  ...publishersIds,
]);

const adminChatId = adminId;

bot.use(async (ctx, next) => {
  const userId = ctx.message?.from.id || 0;


  if (allowedUsers.has(userId)) await next();
  else logger.warn('blocked user: ', {
    userId,
    user: ctx.message?.from.username,
  });
});

bot.on(message('document'), async (ctx) => {
  //@ts-ignore-line
  const message = ctx.message;

  const doc = message.document;
  const chatId = message.chat.id;

  if (adminChatId !== chatId) {
    bot.telegram
      .forwardMessage(adminChatId, chatId, message.message_id)
      .then(() => logger.info("message forwaded"));
  }

  if (doc.mime_type !== 'application/x-bittorrent') {
    ctx.reply('Unsupported file type, only torrent files with single *.mkv file supported');

    return;
  }

  const fileId = doc.file_id;
  const fileName = doc.file_name as string;

  const fileUrl = await ctx.telegram.getFileLink(fileId);

  const filenameObject = path.parse(fileName)
  const englishFileName = convertRussianToEnglish(filenameObject.name) + filenameObject.ext;

  logger.info('New torrent request:', { fileName, englishFileName });

  const absolutePathDownloadsDir = expandTilde(downloadsDir);

  const destination = path.join(absolutePathDownloadsDir, englishFileName);
  const response = await fetch(fileUrl);

  const fileStream = fs.createWriteStream(destination);

  await finished(Readable.fromWeb(response.body as ReadableStream).pipe(fileStream));

  queue.add(handleQBTFile(), { filePath: destination, bot, adminId: adminChatId, chatId, dir: qMoviesDir });
});

bot.use((ctx) => {
  try {
    // @ts-ignore-line
    const message = ctx.update.message;

    const chatId = message.chat.id;

    if (adminChatId !== chatId) {
      bot.telegram
        .forwardMessage(adminChatId, chatId, message.message_id)
        .then(function() { logger.info("mesage forwaded") });
    }
  } catch (e) {
    logger.error(e as Error);
  }
})

bot.launch(() => logger.info('Bot launched'));

// Enable graceful stop
process.once('SIGINT', () => bot.stop('SIGINT'));
process.once('SIGTERM', () => bot.stop('SIGTERM'));

function convertRussianToEnglish(text: string) {
  const convertedText = text
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

  return convertedText;
}
