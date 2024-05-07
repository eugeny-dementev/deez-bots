import { existsSync, writeFile, readFile } from 'fs';
import { Telegraf } from 'telegraf';
import { message } from 'telegraf/filters';
import { promisify } from 'util';

const asyncWriteFile = promisify(writeFile);
const asyncReadFile = promisify(readFile);

const filePath = process.env.TASKS_PATH;

const bot = new Telegraf(process.env.BOT_TOKEN as string);

bot.start((ctx) => ctx.reply('Welcome to Tasks-bot'));
bot.help((ctx) => ctx.reply('Send me a message and I\'ll add a task for you'));

const allowedUsers = new Set([
  Number(process.env.USER_ID),
]);


if (!filePath || !existsSync(filePath)) {
  throw new Error(`No file found at ${filePath}`);
}


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

  console.log('message', message);

  let task: string = '';
  if (message.link_preview_options && isValidURL(message.text)) {
    task = prepareLinkTask(message.text);
  } else {
    task = prepareTextTask(message.text);
  }

  const currentContent = await readTasksFile(filePath);
  const extendedContent = addTask(currentContent, task)

  await writeTasksFile(filePath, extendedContent);

  ctx.reply('Task added');
});

bot.launch();

// Enable graceful stop
process.once('SIGINT', () => bot.stop('SIGINT'));
process.once('SIGTERM', () => bot.stop('SIGTERM'));

function prepareLinkTask(link: string) {
  return `- Check ${link}`;
}

function prepareTextTask(text: string) {
  const bullets = text.trim().split('\n'); // lines represent bullets
  const [main, ...subs] = bullets.map(s => s.trim()); // First line is task and the rest is sub bullets

  if (subs.length == 0) {
    return `- ${main}\n`;
  }

  return `- ${main}\n    - ${subs.join('\n    - ')}`;
}

async function readTasksFile(path: string) {
  const content = await asyncReadFile(path);
  return content.toString().trimEnd();
}

function addTask(content: string, task: string) {
  return `${content}\n${task}\n`;
}

async function writeTasksFile(path: string, content: string) {
  await asyncWriteFile(path, content);
}

function isValidURL(url: string) {
  try {
    new URL(url);

    return true;
  } catch (e) {
    return false;
  }
}

