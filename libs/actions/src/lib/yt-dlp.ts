import { exec, prepare } from '@libs/command';
import { Action, QueueAction, QueueContext } from "async-queue-runner";

export type YtDlpSizesContext = {
  url: string,
  logger: {
    debug: (message: string) => void,
    info: (message: string) => void,
    warn: (message: string) => void,
    error: (error: Error | string) => void,
  }
}

export type FormatListing = {
  res: number,
  size: number,
}

export type SizesParams = {
  then: QueueAction[],
  error: QueueAction[],
};
export const ytdlp = {
  sizes(params: SizesParams) {
    class YtDlpSizes extends Action<YtDlpSizesContext> {
      async execute(context: YtDlpSizesContext & QueueContext): Promise<void> {
        const command = prepare('yt-dlp')
          .add('--no-download')
          .add('--list-formats')
          .add(context.url)
          .toString();

        try {
          const stdout = await exec(command);

          const sizes = parseFormatsListing(stdout);

          context.extend({ sizes });
          context.push(params.then);
        } catch (stderr: unknown) {
          const message = parseError(stderr as string);
          context.logger.error(new Error(message));
          context.extend({ errMsg: message });
          context.push(params.error);
        }
      }
    }

    return new YtDlpSizes();
  },
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

export function parseError(str: string): string {
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
