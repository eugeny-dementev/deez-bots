import { loggerFactory } from '@libs/actions';
import { QueueRunner } from 'async-queue-runner';
import { existsSync } from 'fs';
import { Telegraf } from 'telegraf';
import { message } from 'telegraf/filters';
import { isValidURL } from './helpers';
import { addMetaTask } from './queue';

const filePath = process.env.TASKS_FILE;

const bot = new Telegraf(process.env.BOT_TOKEN as string);

bot.start((ctx) => ctx.reply('Welcome to Tasks-bot'));
bot.help((ctx) => ctx.reply('Send me a message and I\'ll add a task for you'));

const allowedUsers = new Set([
  Number(process.env.USER_ID),
]);


if (!filePath || !existsSync(filePath)) {
  throw new Error(`No file found at ${filePath}`);
}

const logger = loggerFactory();
const queue = new QueueRunner({
  logger,
});

logger.setContext('TasksBot');
queue.addEndListener(() => logger.setContext('TasksBot'));

bot.use(async (ctx, next) => {
  const userId = ctx.message?.from.id || 0;

  if (allowedUsers.has(userId)) await next();
  else console.log('blocked user: ', {
    userId,
    user: ctx.message?.from.username,
  });
});

bot.on(message('text'), async (ctx) => {
  const message = ctx.message;
  const userId = ctx.message?.from.id || 0;

  console.log('message', message);

  queue.add(addMetaTask(), {
    userId,
    chatId: userId,
    bot,
    hasUrl: Boolean(message.link_preview_options),
    logger,
    path: filePath,
    text: message.text,
    url: message.link_preview_options?.url || message.text,
    urlOnly: isValidURL(message.text),
  });
});

bot.launch(() => logger.info('Bot launched'));

// Enable graceful stop
process.once('SIGINT', () => bot.stop('SIGINT'));
process.once('SIGTERM', () => bot.stop('SIGTERM'));
