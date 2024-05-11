import { Action, QueueAction, QueueContext } from "async-queue-runner";
import { Notification } from "./actions.js";
import { FContextMessage, NotificationOptions } from "./types.js";

export const shortcut = {
  notify<C = null>(message: string | FContextMessage<C>, options?: Partial<NotificationOptions>): Notification<C> {
    return new Notification<C>(message, options);
  },
  extend(object: object): QueueAction {
    class Extend extends Action<QueueContext> {
      async execute({ extend }: QueueContext): Promise<void> {
        extend(object);
      }
    }

    return new Extend();
  },
}
