export class Logger {
  info(message: string) {
    console.log(message);
  }

  error(e: Error) {
    console.error(e);
  }
}
