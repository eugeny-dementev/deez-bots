import { QueueRunner } from 'async-queue-runner';
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

logger.setContext('ShortsBot');
queueRunner.addEndListener(() => logger.setContext('ShortsBot'));

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
    userId,
    chatId,
    url,
    bot,
    role,
  };

  const queueName = `${userId}_${queueRunner.getName()}`;

  queueRunner.add(shortHandlerQueue(), context, queueName);
});

bot.start({ onStart: (me) => logger.info('Bot launched', me) });

// Enable graceful stop
process.once('SIGINT', () => bot.stop());
process.once('SIGTERM', () => bot.stop());
