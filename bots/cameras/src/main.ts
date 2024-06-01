import { QueueRunner } from 'async-queue-runner';
import { Telegraf } from 'telegraf';
import { message } from 'telegraf/filters';
import { adminId, publishersIds, token } from './config.js';
import { handlerQueue } from './queues.js';
import { loggerFactory } from '@libs/actions';

const bot = new Telegraf(token);

bot.start((ctx) => ctx.reply('Welcome to Shorts Saver Bot'));
bot.help((ctx) => ctx.reply('Send me a short video and I\'ll public it '));

const allowedUsers = new Set([
  ...publishersIds,
  adminId,
]);

const logger = loggerFactory();
const queueRunner = new QueueRunner({
  logger,
});

logger.setContext('TasksBot');
queueRunner.addEndListener((name, size) => {
  console.log(`Queue(${name}): finished. ${size} queues are still running`);
})

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

bot.on(message('text'), async (ctx) => {
  const message = ctx.message;
  const userId = message.from.id;
  const chatId = ctx.message?.chat.id || 0;
  const url = message.text;

  const context = {
    userId,
    chatId,
    url,
    bot,
  };

  const queueName = `${userId}_${queueRunner.getName()}`;

  queueRunner.add(handlerQueue(), context, queueName);
});

bot.launch(() => {
  console.log('bot launched');
});

// Enable graceful stop
process.once('SIGINT', () => bot.stop('SIGINT'));
process.once('SIGTERM', () => bot.stop('SIGTERM'));
