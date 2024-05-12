import { Action, IAction, QueueContext } from "async-queue-runner"
import { Telegraf } from "telegraf"

export type NotificationsContext = {
  bot: Telegraf
  chatId: number
  adminId: number
}

export type NotificationsOutput = {
  tlog: (msg: string, fresh?: boolean) => Promise<void>
}

export class InjectNotifications extends Action<NotificationsContext> {
  async execute(context: NotificationsContext & QueueContext): Promise<void> {
    const t = context.bot.telegram;

    let messageId = 0;
    let lastMsg = '';
    const tlog = async (msg: string, fresh: boolean = false): Promise<void> => {
      if (messageId === 0 && !fresh) {
        messageId = (await t.sendMessage(context.chatId, msg)).message_id;
        return;
      }

      if (lastMsg != msg) {
        await t.editMessageText(context.chatId, messageId, undefined, msg);
        lastMsg = msg;
      }
    }

    context.extend({ tlog });
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
}
