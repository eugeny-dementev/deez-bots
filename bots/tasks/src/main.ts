import { loggerFactory } from '@libs/actions';
import { QueueRunner } from 'async-queue-runner';
import { existsSync } from 'fs';
import { Bot } from 'grammy';
import { isValidURL } from './helpers';
import { addMetaTask } from './queue';

const filePath = process.env.TASKS_FILE;

const bot = new Bot(process.env.BOT_TOKEN as string);

bot.command('start', (ctx) => ctx.reply('Welcome to Tasks-bot'));
bot.command('help', (ctx) => ctx.reply('Send me a message and I\'ll add a task for you'));

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

bot.on('message:text', async (ctx) => {
  const message = ctx.message;
  const userId = ctx.message.from.id || 0;

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

bot.start({ onStart: (me) => logger.info('Bot launched', me) });
bot.catch((err) => logger.error(err))

// Enable graceful stop
process.once('SIGINT', () => bot.stop());
process.once('SIGTERM', () => bot.stop());
