import { QueueRunner } from 'async-queue-runner';
import { Bot } from 'grammy';
import { adminId, token } from './config.js';
import { handlerQueue } from './queues.js';
import { loggerFactory } from '@libs/actions';

const bot = new Bot(token);

bot.command('start', (ctx) => ctx.reply('Welcome to Cameras Bot'));
bot.command('help', (ctx) => ctx.reply('Send me any message and I show you the corridor' ));

const allowedUsers = new Set([
  adminId,
]);

const logger = loggerFactory();
const queueRunner = new QueueRunner({
  logger,
});

logger.setContext('CamerasBot');
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

bot.on('message:text', async (ctx) => {
  const message = ctx.message;
  const userId = message.from.id;
  const chatId = ctx.message.chat.id;

  const context = {
    userId,
    chatId,
    bot,
    room: 'corridor',
  };

  const queueName = `${userId}_${queueRunner.getName()}`;

  queueRunner.add(handlerQueue(), context, queueName);
});

bot.start({ onStart: (me) => logger.info('Bot launched', me) });

bot.catch((error) => logger.error(error));

// Enable graceful stop
process.once('SIGINT', () => bot.stop());
process.once('SIGTERM', () => bot.stop());
