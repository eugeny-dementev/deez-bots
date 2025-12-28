import {
  Action as BaseAction,
  QueueAction,
  QueueContext,
  lockingClassFactory as baseLockingClassFactory,
} from 'async-queue-runner';

type ErrorContext = QueueContext & {
  logger?: { error?: (e: Error) => void }
  terr?: (err: string | Error) => Promise<void> | void
};

async function handleActionError(error: Error, context: ErrorContext): Promise<void> {
  if (typeof context.logger?.error === 'function') {
    context.logger.error(error);
  }

  if (typeof context.terr === 'function') {
    await context.terr(error);
  }

  context.abort();
}

export abstract class Action<C> extends BaseAction<C> {
  async onError(error: Error, context: QueueContext): Promise<void> {
    await handleActionError(error, context as ErrorContext);
  }
}

export function lockingClassFactory<C>(scope: string) {
  const Base = baseLockingClassFactory<C>(scope);

  abstract class LockingAction extends Base {
    async onError(error: Error, context: QueueContext): Promise<void> {
      await handleActionError(error, context as ErrorContext);
    }
  }

  return LockingAction;
}

export { QueueAction, QueueContext };
