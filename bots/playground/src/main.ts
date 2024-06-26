import { QueueRunner } from 'async-queue-runner';
import { log } from 'console';
import { Bot } from 'grammy';
import { adminId, channelId, cookiesPath, publishersIds, token } from './config.js';
import { rolesFactory } from './helpers.js';
import { shortHandlerQueue } from './queues.js';
import { UserLimitStatus } from './types.js';
import { loggerFactory } from '@libs/actions';

const bot = new Bot(token);

bot.command('start', (ctx) => ctx.reply('Welcome to Shorts Saver Bot'));
bot.command('help', (ctx) => ctx.reply('Send me a short video and I\'ll public it '));

const allowedUsers = new Set([
  ...publishersIds,
  adminId,
]);

bot.use(async (ctx, next) => {
  const userId = ctx.message?.from.id || 0;
  const chatId = ctx.message?.chat.id || 0;

  if (allowedUsers.has(userId)) await next();
  else console.log('blocked user: ', {
    user: ctx.message?.from.username,
    userId,
    chatId,
    update: ctx.update,
  });
});

const logger = loggerFactory();
const queueRunner = new QueueRunner({
  logger,
});

queueRunner.addEndListener((name, size) => {
  console.log(`Queue(${name}) finished. ${size} queues are still running`);
})

const getUserRole = rolesFactory(adminId, publishersIds)
const limitsStatus: UserLimitStatus = {};

bot.on('message:text', async (ctx) => {
  const message = ctx.message;
  const userId = message.from.id;
  const chatId = ctx.message.chat.id || 0;
  const url = message.text;
  const role = getUserRole(userId);

  const context = {
    limitsStatus,
    cookiesPath,
    channelId,
    adminId,
    userId,
    chatId,
    logger,
    url,
    bot,
    role,
    destFileName: queueRunner.getName(),
  };

  const queueName = `${userId}_${queueRunner.getName()}`;

  queueRunner.add(shortHandlerQueue(), context, queueName);
});

bot.start({ onStart: (me) => log('Bot launched') });
bot.catch((err) => logger.error(err))

// Enable graceful stop
process.once('SIGINT', () => bot.stop());
process.once('SIGTERM', () => bot.stop());
