import { Action, IAction, QueueContext } from "async-queue-runner"
import { Telegraf } from "telegraf"

export type NotificationsContext = {
  bot: Telegraf
  chatId: number
  adminId: number
}

export type NotificationsOutput = {
  tadd: (msg: string, fresh?: boolean) => Promise<void>
  tlog: (msg: string, fresh?: boolean) => Promise<void>
  terr: (err: string | Error) => Promise<void>
}

export class MultiLineMessage {
  lines: string[] = []

  add(msg: string) {
    this.lines.push(msg);
  }

  edit(msg: string) {
    if (this.lines.length === 0) {
      this.add(msg);
      return;
    }

    const index = this.lines.length - 1;
    this.lines[index] = msg;
  }

  toString(): string {
    return this.lines.join('\n');
  }
}

export class InjectNotifications extends Action<NotificationsContext> {
  async execute(context: NotificationsContext & QueueContext): Promise<void> {
    const t = context.bot.telegram;

    let messageId = 0;
    const mlm = new MultiLineMessage();
    let lastMlm = '';

    async function sendMessage(msg: string, fresh?: boolean) {
      if (messageId === 0 && !fresh) {
        messageId = (await t.sendMessage(context.chatId, msg)).message_id;
        return;
      }

      if (lastMlm != msg) {
        lastMlm = msg;
        await t.editMessageText(context.chatId, messageId, undefined, msg);
      }
    }

    const tadd = async (newLine: string, fresh: boolean = false): Promise<void> => {
      mlm.add(newLine);
      const msg = mlm.toString();

      await sendMessage(msg, fresh);
    }

    const tlog = async (lastLine: string, fresh: boolean = false): Promise<void> => {
      mlm.edit(lastLine);
      const msg = mlm.toString();

      await sendMessage(msg, fresh);
    }

    const terr = async (msg: string | Error): Promise<void> => {
      if (!context.adminId) {
        console.error('No adminId in the context');

        return;
      }

      if (typeof msg === 'string') {
        await t.sendMessage(context.adminId, msg);
      } else if(msg instanceof Error) {
        const cleanStack = await import('clean-stack');
        const stack = cleanStack.default(msg.stack!, { pretty: true, basePath: process.cwd() });
        await t.sendMessage(context.adminId, '```\n' + stack + '\n```', { parse_mode: 'MarkdownV2' });
      } else {
        await t.sendMessage(context.adminId, `Unrecognized error: ${typeof msg}`);
      }
    };

    context.extend({ tlog, terr, tadd } as NotificationsOutput);
  }
}

export type TNotificationMessage<C> = (context: C) => Promise<string> | string;
export type IActionClass = new (...args: any[]) => IAction;
export const notifications = {
  tlog: <C = null>(msg: string | TNotificationMessage<C>, fresh?: boolean): IActionClass => class TGNotification extends Action<NotificationsOutput> {
    async execute(context: NotificationsOutput & QueueContext): Promise<void> {
      if (typeof msg === 'function') {
        msg = await (msg as TNotificationMessage<C>)(context as C);
      }
      await context.tlog(msg, fresh);
    }
  },
  tadd: <C = null>(msg: string | TNotificationMessage<C>, fresh?: boolean): IActionClass => class TGNotification extends Action<NotificationsOutput> {
    async execute(context: NotificationsOutput & QueueContext): Promise<void> {
      if (typeof msg === 'function') {
        msg = await (msg as TNotificationMessage<C>)(context as C);
      }
      await context.tadd(msg, fresh);
    }
  },
}
