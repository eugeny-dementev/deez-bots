import { QueueRunner } from 'async-queue-runner';
import { Telegraf } from 'telegraf';
import { message } from 'telegraf/filters';
import { adminId, channelId, cookiesPath, publishersIds, token } from './config.js';
import { rolesFactory } from './helpers.js';
import { shortHandlerQueue } from './queues.js';
import { UserLimitStatus } from './types.js';

const bot = new Telegraf(token);

bot.start((ctx) => ctx.reply('Welcome to Shorts Saver Bot'));
bot.help((ctx) => ctx.reply('Send me a short video and I\'ll public it '));

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

const queueRunner = new QueueRunner();

queueRunner.addEndListener((name, size) => {
  console.log(`Queue(${name}) finished. ${size} queues are still running`);
})

const getUserRole = rolesFactory(adminId, publishersIds)
const limitsStatus: UserLimitStatus = {};

bot.on(message('text'), async (ctx) => {
  const message = ctx.message;
  const userId = message.from.id;
  const chatId = ctx.message?.chat.id || 0;
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

bot.launch();

// Enable graceful stop
process.once('SIGINT', () => bot.stop('SIGINT'));
process.once('SIGTERM', () => bot.stop('SIGTERM'));
