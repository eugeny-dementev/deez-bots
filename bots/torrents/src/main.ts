import * as fs from 'fs';
import * as path from 'path';
import { Readable } from 'stream';
import { finished } from 'stream/promises';
import { Telegraf } from 'telegraf';
import { message } from 'telegraf/filters';
import { QueueRunner } from 'async-queue-runner';
import { handleQBTFile } from './performances.js';
import { ReadableStream } from 'stream/web';
import { adminId, downloadsDir, moviesDir, publishersIds, token } from './config.js';

// Map of Russian to English transliteration
const russianToEnglish = {
  'а': 'a', 'б': 'b', 'в': 'v', 'г': 'g', 'д': 'd', 'е': 'e', 'ё': 'e', 'ж': 'zh',
  'з': 'z', 'и': 'i', 'й': 'y', 'к': 'k', 'л': 'l', 'м': 'm', 'н': 'n', 'о': 'o',
  'п': 'p', 'р': 'r', 'с': 's', 'т': 't', 'у': 'u', 'ф': 'f', 'х': 'h', 'ц': 'c',
  'ч': 'ch', 'ш': 'sh', 'щ': 'sch', 'ъ': '', 'ы': 'y', 'ь': '', 'э': 'e', 'ю': 'yu',
  'я': 'ya'
};

const queue = new QueueRunner();

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
  else console.log('blocked user: ', {
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
      .then(function() { console.log("mesage forwaded") });
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

  console.log({ fileName, englishFileName });

  const destination = path.join(downloadsDir, englishFileName);
  const response = await fetch(fileUrl);

  const fileStream = fs.createWriteStream(destination);

  await finished(Readable.fromWeb(response.body as ReadableStream).pipe(fileStream));

  queue.add(handleQBTFile(), { filePath: destination, bot, adminId: adminChatId, chatId, dir: moviesDir });
});

bot.use((ctx) => {
  try {
    // @ts-ignore-line
    const message = ctx.update.message;

    const chatId = message.chat.id;

    if (adminChatId !== chatId) {
      bot.telegram
        .forwardMessage(adminChatId, chatId, message.message_id)
        .then(function() { console.log("mesage forwaded") });
    }
  } catch (e) {
    console.error(e);
    console.log('ctx:', ctx);
  }
})

bot.launch();

// Enable graceful stop
process.once('SIGINT', () => bot.stop('SIGINT'));
process.once('SIGTERM', () => bot.stop('SIGTERM'));

function convertRussianToEnglish(text: string) {
  const convertedText = text
    .toLowerCase()
    .split('')
    .map((char: string) => russianToEnglish[char] || char)
    .join('')
    .replace(/\s+/g, '_')
    .replace(/[^a-z0-9_]/g, '');

  return convertedText;
}
