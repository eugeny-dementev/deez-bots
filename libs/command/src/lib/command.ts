import shelljs from 'shelljs';

class CommandLine {
  readonly #command: string;
  readonly #args: string[] = [];

  constructor(command: string) {
    this.#command = command;
  }

  add(parameter: string, add: boolean = true) {
    if (add) {
      this.#args.push(parameter);
    }

    return this;
  }

  toString() {
    return [
      this.#command,
      ...this.#args,
    ].join(' ');
  }
}

export function prepare(command: string): CommandLine {
  return new CommandLine(command);
}

export async function exec(commandLine: string): Promise<string> {
  return new Promise((res, rej) => {
    if (!commandLine) {
      rej(new TypeError('Command not passed'));

      return;
    }

    shelljs.exec(commandLine!, { async: true }, (code, stdout, stderr) => {
      if (code === 0) {
        res(stdout.toString());

        return;
      }

      rej(stderr.toString());
    });
  });
}
