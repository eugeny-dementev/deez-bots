import { Action, QueueContext } from "async-queue-runner";
import yamlifyObject from "yamlify-object";
// @ts-ignore
import colors from 'yamlify-object-colors';

export type LoggerContext = {
  ambience: string // place where logger method is used
}
export type LogLevel = 'debug' | 'info' | 'warn' | 'error';
export type Metadata = object;
export type ErrorMeta = {
  message: string,
  stack: string,
}
export type LogMethod = (message: string, meta?: Metadata) => void;
export type ErrorMethod = (error: Error, meta?: Metadata) => void;
export type ILogger = {
  error: ErrorMethod
  warn: LogMethod
  info: LogMethod
  debug: LogMethod

  setContext: (context: LoggerContext) => void
}

export type LoggerOutput = {
  logger: ILogger,
}

export class Logger implements ILogger {
  context: LoggerContext = {
    ambience: 'none',
  };

  private log(level: LogLevel, meta: Metadata & { message: string }) {
    const { message, ...rest } = meta;
    console.log(`[${this.context.ambience}][${level}] - ${meta.message}\n${yamlifyObject(rest, { colors })}`);
  }

  error(error: Error, meta: Metadata = {}) {
    this.log('error', { ...this.transformError(error), ...meta });
  }
  warn(message: string, meta: Metadata = {}) {
    this.log('warn', { message, ...meta });
  }
  info(message: string, meta: Metadata = {}) {
    this.log('info', { message, ...meta });
  }
  debug(message: string, meta: Metadata = {}) {
    this.log('debug', { message, ...meta });
  }

  setContext(context: LoggerContext) {
    this.context = context;
  }

  private transformError(error: Error): ErrorMeta {
    return {
      message: error.message,
      stack: error.stack!,
    }
  }
}

export class InjectLogger extends Action<null> {
  async execute(context: QueueContext): Promise<void> {
    const logger = new Logger();

    context.extend({ logger } as LoggerOutput);
  }
}
