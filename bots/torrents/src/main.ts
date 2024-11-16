import { QueueRunner } from 'async-queue-runner';
import { Bot, Context } from 'grammy';
import { FileFlavor, hydrateFiles } from '@grammyjs/files';
import { adminId, qMoviesDir, publishersIds, token } from './config.js';
import { handleQBTFile } from './queue.js';
import { loggerFactory } from '@libs/actions';
import { ConfigWatcher } from './watcher.js';

const logger = loggerFactory();
const queue = new QueueRunner({
  logger,
});
const watcher = new ConfigWatcher();

logger.setContext('TorrentsBot');
queue.addEndListener(() => logger.setContext('TorrentsBot'));

type MyContext = FileFlavor<Context>;

const bot = new Bot<MyContext>(token);

bot.api.config.use(hydrateFiles(bot.token));

bot.command('start', (ctx) => ctx.reply('Welcome to Sverdlova'));
bot.command('help', (ctx) => ctx.reply('Send me a torrent with mkv files'));

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

bot.on('message:document', async (ctx) => {
  //@ts-ignore-line
  const message = ctx.message;

  const doc = message.document;
  const chatId = message.chat.id;

  if (adminChatId !== chatId) {
    bot.api
      .forwardMessage(adminChatId, chatId, message.message_id)
      .then(() => logger.info("message forwarded"));
  }

  if (doc.mime_type !== 'application/x-bittorrent') {
    ctx.reply('Unsupported file type, only torrent files with single *.mkv file supported');

    return;
  }

  const fileName = doc.file_name as string;
  const file = await ctx.getFile();

  queue.add(handleQBTFile(), { file, fileName, bot, logger, adminId: adminChatId, chatId, dir: qMoviesDir });
});

bot.use((ctx) => {
  try {
    // @ts-ignore-line
    const message = ctx.message!;

    const chatId = message.chat.id;

    if (adminChatId !== chatId) {
      bot.api
        .forwardMessage(adminChatId, chatId, message.message_id)
        .then(function() { logger.info("message forwarded") });
    }
  } catch (e) {
    logger.error(e as Error);
  }
})

bot.start({ onStart: (me) => logger.info('Bot launched', me) });
bot.catch((err) => logger.error(err))

// Enable graceful stop
process.once('SIGINT', () => bot.stop());
process.once('SIGTERM', () => bot.stop());
