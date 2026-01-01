import { fetchWithTimeout } from './http.js';

type WikidataSearchResult = {
  id?: string;
};

const WIKIDATA_HEADERS = {
  Accept: 'application/json',
  'User-Agent': 'deez-bots/1.0 (local)',
};

async function searchWikidataEntity(search: string, language: string): Promise<string | null> {
  const url = new URL('https://www.wikidata.org/w/api.php');
  url.searchParams.set('action', 'wbsearchentities');
  url.searchParams.set('search', search);
  url.searchParams.set('language', language);
  url.searchParams.set('format', 'json');
  url.searchParams.set('limit', '1');
  url.searchParams.set('type', 'item');

  const response = await fetchWithTimeout(url.toString(), { headers: WIKIDATA_HEADERS });
  if (!response.ok) {
    return null;
  }

  const data = await response.json() as { search?: WikidataSearchResult[] };
  const first = data?.search?.[0];

  return first?.id ?? null;
}

async function getWikidataLabel(entityId: string, language: string): Promise<string | null> {
  const url = new URL('https://www.wikidata.org/w/api.php');
  url.searchParams.set('action', 'wbgetentities');
  url.searchParams.set('ids', entityId);
  url.searchParams.set('props', 'labels');
  url.searchParams.set('languages', `${language}|en`);
  url.searchParams.set('format', 'json');

  const response = await fetchWithTimeout(url.toString(), { headers: WIKIDATA_HEADERS });
  if (!response.ok) {
    return null;
  }

  const data = await response.json() as {
    entities?: Record<string, { labels?: Record<string, { value?: string }> }>;
  };

  const entity = data.entities?.[entityId];
  const label = entity?.labels?.[language]?.value ?? entity?.labels?.['en']?.value;

  return label ?? null;
}

export async function resolveWikidataTitle(
  candidates: string[],
  year: string | undefined,
  language: string,
): Promise<string | null> {
  const searchLanguages = Array.from(new Set(['en', language]));

  for (const candidate of candidates) {
    const searchTerms = year ? [`${candidate} ${year}`, candidate] : [candidate];

    for (const searchTerm of searchTerms) {
      for (const searchLanguage of searchLanguages) {
        const entityId = await searchWikidataEntity(searchTerm, searchLanguage);
        if (!entityId) {
          continue;
        }

        const label = await getWikidataLabel(entityId, language);
        if (label) {
          return label;
        }
      }
    }
  }

  return null;
}
