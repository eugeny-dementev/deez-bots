import { Action, QueueAction, util } from 'async-queue-runner';
import {
  AddUploadToQBitTorrent,
  CheckTorrentFile,
  CloseBrowser,
  DeleteFile,
  Log,
  MonitorDownloadingProgress,
  OpenBrowser,
  OpenQBitTorrent,
  TGPrintTorrentPattern
} from './actions.js';
import { BotContext } from './types.js';

export function botLoggerFactory(context: BotContext) {
  const { bot, chatId, adminId } = context;

  return {
    info(msg: string) {
      bot.telegram.sendMessage(chatId, msg);
    },
    error(err: Error) {
      bot.telegram.sendMessage(adminId, '```\n' + escapeRegExp(prettyError(err)) + '\n```', { parse_mode: 'MarkdownV2' });
    },
    adminInfo(json: object) {
      bot.telegram
        .sendMessage(adminId, '```\n' + escapeRegExp(JSON.stringify(json, null, 2)) + '\n```', { parse_mode: 'MarkdownV2' })
        .catch((err) => {
          this.error(err);
        });
    },
  }
}

export const handleQBTFile: () => QueueAction[] = () => [
  Log,
  TGPrintTorrentPattern,
  CheckTorrentFile,
  OpenBrowser,
  OpenQBitTorrent,
  Log,
  AddUploadToQBitTorrent,
  CloseBrowser,
  util.delay(5000),
  MonitorDownloadingProgress,
  DeleteFile,
];

function prettyError(error: Error) {
  if (!(error instanceof Error)) {
    throw new TypeError('Input must be an instance of Error');
  }

  const message = `${error.name}: ${error.message}`;
  const stack = error.stack!
    .split('\n')
    .slice(1)
    .map((line) => `  ${line}`)
    .join('\n');

  return `${message}\n${stack}`;
}

function escapeRegExp(text: string) {
  return text.replace(/[-[\]{}()*+?.,\\^$|#\s]/g, '\\$&');
}
