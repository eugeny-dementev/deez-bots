import { JacketResponseItem } from './jackett.js';

type SearchEntry = {
  query: string,
  results: JacketResponseItem[],
  updatedAt: number,
  messageId?: number,
};

const searchCache = new Map<number, SearchEntry>();

export function setSearchResults(
  chatId: number,
  query: string,
  results: JacketResponseItem[],
  messageId?: number,
): void {
  searchCache.set(chatId, {
    query,
    results,
    updatedAt: Date.now(),
    messageId,
  });
}

export function getSearchResults(chatId: number): SearchEntry | undefined {
  return searchCache.get(chatId);
}

export function clearSearchResults(chatId: number): void {
  searchCache.delete(chatId);
}
