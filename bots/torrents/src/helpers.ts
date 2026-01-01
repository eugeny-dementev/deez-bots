import fs from "fs/promises";
import { F_OK } from "node:constants";
import { readFile } from "fs/promises";
import { DirMap } from "./types";
import { dirMaps } from "./config";

export function nameCheckerFactory(name: string) {
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

export function pick(obj: object, ...keys: string[]) {
  const entries = Object.entries(obj).filter(([key]) => keys.includes(key));
  return Object.fromEntries(entries);
}

export function sleep(timeout: number) {
  return new Promise((res) => setTimeout(res, timeout));
}


export async function fileExists(filePath: string): Promise<boolean> {
  try {
    await fs.access(filePath, F_OK);
    return true;
  } catch (e) {
    return false;
  }
}

export function wildifySquareBrackets(filePath: string) {
    return filePath
      .replace(/[\[\]]+/g, '*');
}

export async function getDirMaps(): Promise<DirMap[]> {
  const buffer = await readFile(dirMaps);

  return JSON.parse(buffer.toString()) as DirMap[];
}

export const russianToEnglish = {
  'а': 'a', 'б': 'b', 'в': 'v', 'г': 'g', 'д': 'd', 'е': 'e', 'ё': 'e', 'ж': 'zh',
  'з': 'z', 'и': 'i', 'й': 'y', 'к': 'k', 'л': 'l', 'м': 'm', 'н': 'n', 'о': 'o',
  'п': 'p', 'р': 'r', 'с': 's', 'т': 't', 'у': 'u', 'ф': 'f', 'х': 'h', 'ц': 'c',
  'ч': 'ch', 'ш': 'sh', 'щ': 'sch', 'ъ': '', 'ы': 'y', 'ь': '', 'э': 'e', 'ю': 'yu',
  'я': 'ya'
};
export const russianLetters = new Set(Object.keys(russianToEnglish));
