import { exec, prepare } from '@libs/command';
import { Action, QueueAction, QueueContext } from "async-queue-runner";
import { NotificationsOutput } from './notifications';
import { LoggerOutput } from './logger';

export type YtDlpUrlContext = {
  url: string,
}

export type YtDlpDownloadContext = {
  home: string,
  temp: string,
  res?: number,
}

export type FormatListing = {
  res: number,
  size: number,
}

export type YtDlpSizesOutput = {
  sizes: FormatListing[],
}

export type SizesParams = {
  then: QueueAction[],
  error: QueueAction[],
};

export class YtDlpDownload extends Action<YtDlpDownloadContext & YtDlpUrlContext & NotificationsOutput & LoggerOutput> {
  async execute(context: YtDlpDownloadContext & YtDlpUrlContext & NotificationsOutput & LoggerOutput & QueueContext): Promise<void> {
    const { url } = context;

    context.logger.info('Starting downloading video', { url });

    const command = prepare('yt-dlp')
      .add(`-S res:${context.res || 1080}`)
      .add(`--paths home:${context.home}`)
      .add(`--paths temp:${context.temp}`)
      .add(context.url)
      .toString();

    try {
      context.tlog('Downloading video');
      await exec(command);

      context.logger.info('Video downloaded', { url });
    } catch (stderr: unknown) {
      const message = parseYtDlpError(stderr as string);
      const error = new Error(message);
      context.logger.error(error);
      context.terr(error);

      context.abort();
    }
  }
}

export class YtDlpSizes extends Action<YtDlpUrlContext & Partial<NotificationsOutput> & LoggerOutput> {
  async execute(context: YtDlpUrlContext & Partial<NotificationsOutput> & LoggerOutput & QueueContext): Promise<void> {
    const command = prepare('yt-dlp')
      .add('--no-download')
      .add('--list-formats')
      .add(context.url)
      .toString();

    try {
      context.logger.info('Checking URL', { url: context.url });

      const stdout = await exec(command);

      const sizes = parseFormatsListing(stdout);

      context.extend({ sizes } as YtDlpSizesOutput);

      context.logger.info('Found YtDlpSizes', { sizes });
    } catch (stderr: unknown) {
      const message = parseYtDlpError(stderr as string);
      const error = new Error(message);
      context.logger.error(error);
      context.terr?.(error);

      context.abort();
    }
  }
}

export function parseFormatsListing(str: string): FormatListing[] {
  return str.split('\n')
    .filter(l => l.includes('MiB') && /[0-9]+x[0-9]+/.test(l))
    .map((l: string) => ({
      // @ts-ignore
      res: Math.min(.../[0-9]+x[0-9]+/.exec(l)[0].split('x').map(v => parseInt(v))),
      // @ts-ignore
      size: parseFloat(/([0-9]+\.?[0-9]{2}?)MiB/.exec(l)[1]),
    }))
    .reverse();
}

export function parseYtDlpError(str: string): string {
  const lines = str.split('\n')
    .filter(line => Boolean(line))
    .filter(line => line.toLowerCase().includes('error'))
    .map(line => line.trim());


  if (lines.length === 0) {
    return 'unknown yt-dlp sizes error';
  }

  const line = lines[0];
  return line.replace('ERROR: ', '');
}
