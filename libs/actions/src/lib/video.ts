import { exec, prepare } from "@libs/command";
import { Action, QueueContext } from "async-queue-runner";

export type VideoDimensions = { width: number, height: number };
export class ExtractVideoDimensions extends Action<{ filePath: string }> {
  async execute(context: { filePath: string; } & QueueContext): Promise<void> {
    const command = prepare('ffprobe')
      .add('-v error')
      .add('-show_entries stream=width,height')
      .add('-of default=noprint_wrappers=1')
      .add(context.filePath)
      .toString();

    const stdout = await exec(command);

    const { width, height } = stdout
      .trim()
      .split('\n').map(s => s.trim())
      .map((str: string): string[] => str.split('=').map(s => s.trim()))
      .reduce<VideoDimensions>((obj: VideoDimensions, pair: string[]): VideoDimensions => {
        const field = pair[0] as 'width' | 'height';
        const value = Number(pair[1]);
        obj[field] = value;

        return obj;
      }, {} as VideoDimensions);

    context.extend({ width, height } as VideoDimensions);
  }
}
