import { UserRole } from './types.js';
import { isValidRedditURL, isValidReelURL, isValidShortURL, isValidVKURL } from './validators.js';

export function rolesFactory(adminId: number, publishersIds: number[]) {
  const publishersIdsSet = new Set(publishersIds);
  return function getRole(userId: number) {
    if (userId === adminId) return UserRole.admin;

    if (publishersIdsSet.has(userId)) return UserRole.publisher;

    return UserRole.subscriber;
  }
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

export function getLinkType(url: string): 'reel' | 'short' | 'reddit' | 'vk' | null {
  if (isValidVKURL(url)) return 'vk';
  // if (isValidReelURL(url)) return 'reel';
  if (isValidShortURL(url)) return 'short';
  if (isValidRedditURL(url)) return 'reddit';
  return null;
}
