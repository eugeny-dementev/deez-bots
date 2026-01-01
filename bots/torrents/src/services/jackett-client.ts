import { jackettHost, jackettKey } from '../config.js';
import { JacketResponseItem } from '../jackett.js';
import { fetchWithTimeout, HttpStatusError } from './http.js';

type JackettResponse = {
  Results?: JacketResponseItem[];
};

export async function searchJackett(query: string): Promise<JacketResponseItem[]> {
  const url = `${jackettHost}/api/v2.0/indexers/all/results?apikey=${jackettKey}&Query=${encodeURIComponent(query)}`;
  const response = await fetchWithTimeout(url, { noProxy: true });

  if (!response.ok) {
    throw new HttpStatusError(url, response.status, response.statusText);
  }

  const data = await response.json() as JackettResponse;
  return data.Results ?? [];
}

export function normalizeSearchResults(
  results: JacketResponseItem[],
  limit = 5,
): JacketResponseItem[] {
  const seen = new Set<string>();
  const normalized: JacketResponseItem[] = [];

  for (const item of results) {
    const key = item.Guid || item.Link || item.Title;
    if (seen.has(key)) {
      continue;
    }
    seen.add(key);
    normalized.push(item);
    if (normalized.length >= limit) {
      break;
    }
  }

  return normalized;
}
