import { Action, QueueContext } from "async-queue-runner";

export type Logger = {
  error: typeof console.error,
  warn: typeof console.warn,
  info: typeof console.log,
  debug: typeof console.log,
}
export type LoggerOutput = {
  logger: Logger,
}
export class InjectLogger extends Action<null> {
  async execute(context: QueueContext): Promise<void> {
    const logger = {
      error: console.error,
      warn: console.warn,
      info: console.log,
      debug: console.log,
    }

    context.extend({ logger } as LoggerOutput);
  }
}
