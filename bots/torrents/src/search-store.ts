import { JacketResponseItem } from './jackett.js';

type SearchEntry = {
  query: string,
  results: JacketResponseItem[],
  updatedAt: number,
  messageId?: number,
  timeoutId?: NodeJS.Timeout,
};

const searchCache = new Map<number, SearchEntry>();

export function setSearchResults(
  chatId: number,
  query: string,
  results: JacketResponseItem[],
  messageId?: number,
  timeoutId?: NodeJS.Timeout,
): void {
  const existing = searchCache.get(chatId);
  if (existing?.timeoutId) {
    clearTimeout(existing.timeoutId);
  }

  searchCache.set(chatId, {
    query,
    results,
    updatedAt: Date.now(),
    messageId,
    timeoutId,
  });
}

export function getSearchResults(chatId: number): SearchEntry | undefined {
  return searchCache.get(chatId);
}

export function clearSearchResults(chatId: number): void {
  const existing = searchCache.get(chatId);
  if (existing?.timeoutId) {
    clearTimeout(existing.timeoutId);
  }

  searchCache.delete(chatId);
}
