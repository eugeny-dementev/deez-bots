import { Action, QueueContext } from "./action.js";
import yamlifyObject from "yamlify-object";
// @ts-ignore
import colors from 'yamlify-object-colors';

export type LogLevel = 'verbose' | 'debug' | 'info' | 'warn' | 'error';
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
  verbose: LogMethod

  setContext: (context: string) => void
}

export type LoggerOutput = {
  logger: ILogger,
}

const LOG_LEVEL_ORDER: Record<LogLevel, number> = {
  debug: 10,
  verbose: 20,
  info: 30,
  warn: 40,
  error: 50,
};
const MIN_LOG_LEVEL: LogLevel = 'info';

function resolveLogLevel(level?: LogLevel): LogLevel {
  if (!level) {
    return MIN_LOG_LEVEL;
  }

  if (LOG_LEVEL_ORDER[level] < LOG_LEVEL_ORDER[MIN_LOG_LEVEL]) {
    return MIN_LOG_LEVEL;
  }

  return level;
}

function parseLogLevel(value?: string): LogLevel | undefined {
  if (!value) {
    return undefined;
  }

  const normalized = value.trim().toLowerCase();
  if (Object.prototype.hasOwnProperty.call(LOG_LEVEL_ORDER, normalized)) {
    return normalized as LogLevel;
  }

  return undefined;
}

export class Logger implements ILogger {
  context: string = 'none';
  private level: LogLevel;

  constructor(level?: LogLevel) {
    this.level = resolveLogLevel(level);
  }

  private log(level: LogLevel, meta: Metadata & { message: string }) {
    if (LOG_LEVEL_ORDER[level] < LOG_LEVEL_ORDER[this.level]) {
      return;
    }

    const { message, ...rest } = meta;
    console.log(`[${this.context}][${level}] - ${meta.message}\n${yamlifyObject(rest, { colors })}`);
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
  verbose(message: string, meta: Metadata = {}) {
    this.log('verbose', { message, ...meta });
  }

  setContext(context: string) {
    this.context = context;
  }

  private transformError(error: Error): ErrorMeta {
    return {
      message: error.message,
      stack: error.stack!,
    }
  }
}

export function loggerFactory(): ILogger {
  const envLevel = parseLogLevel(process.env.LOG_LEVEL);
  return new Logger(envLevel);
}

export class InjectLogger extends Action<null> {
  async execute(context: QueueContext & Partial<LoggerOutput>): Promise<void> {
    if (context.logger) {
      return;
    }

    const logger = loggerFactory();

    context.extend({ logger } as LoggerOutput);
  }
}
