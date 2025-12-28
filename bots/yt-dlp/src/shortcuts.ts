import { Action, QueueAction, QueueContext } from "@libs/actions";

export const shortcut = {
  extend(object: object): QueueAction {
    class Extend extends Action<QueueContext> {
      async execute({ extend }: QueueContext): Promise<void> {
        extend(object);
      }
    }

    return new Extend();
  },
}
