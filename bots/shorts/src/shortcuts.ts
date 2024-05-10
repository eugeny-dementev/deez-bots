import { Notification } from "./actions.js";
import { FContextMessage } from "./types.js";

export const shortcut = {
  notify<C = null>(message: string | FContextMessage<C>): Notification<C> {
    return new Notification<C>(message);
  },
}
