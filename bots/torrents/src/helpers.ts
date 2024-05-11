export function nameCheckerFactory (name: string) {
  const re = new RegExp(name, 'i');
  return (item: string) => re.test(item);
}

export function formatTime(milliseconds: number) {
  const seconds = Math.floor(milliseconds / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);

  const pluralize = (value: number, singular: string, plural: string) => value === 1
    ? `${value} ${singular}`
    : `${value} ${plural}`;

  const hoursPart = hours > 0 ? `${pluralize(hours % 24, 'hour', 'hours')} ` : '';
  const minutesPart = minutes > 0 ? `${pluralize(minutes % 60, 'minute', 'minutes')} ` : '';
  const secondsPart = seconds > 0 ? `${pluralize(seconds % 60, 'second', 'seconds')}` : '';

  return `${hoursPart}${minutesPart}${secondsPart}`.trim();
}

export function omit(obj: object, ...keys: string[]) {
  const entries = Object.entries(obj).filter(([key]) => !keys.includes(key));
  return Object.fromEntries(entries);
}

export function sleep(timeout: number) {
  return new Promise((res) => setTimeout(res, timeout));
}
