import { JacketResponseItem } from '../jackett.js';

export function normalizeLanguage(language?: string): string {
  if (!language) {
    return 'en';
  }

  const normalized = language.toLowerCase();
  const base = normalized.split('-')[0]?.trim();
  return base || 'en';
}

function findYear(text?: string): string | undefined {
  if (!text) {
    return undefined;
  }

  const match = text.match(/\b(19|20)\d{2}\b/);
  return match?.[0];
}

function splitTitleAndSuffix(rawTitle: string): { base: string; suffix?: string } {
  const bracketIndex = rawTitle.indexOf('[');
  if (bracketIndex === -1) {
    return { base: rawTitle.trim() };
  }

  return {
    base: rawTitle.slice(0, bracketIndex).trim(),
    suffix: rawTitle.slice(bracketIndex).trim(),
  };
}

function extractSeriesSuffix(base: string): { base: string; seriesSuffix?: string } {
  const seriesPattern = /(?:^|[\\/|])\s*(S\d{1,2}E\d{1,2}(?:-\d{1,2})?(?:\s*of\s*\d{1,2})?|S\d{1,2}E\d{1,2}(?:-\d{1,2})?|E\d{1,2}\s*of\s*\d{1,2}|S\d{1,2})\s*$/i;
  const match = base.match(seriesPattern);
  if (!match || match.index === undefined) {
    return { base };
  }

  const seriesSuffix = match[1].trim();
  const trimmedBase = base
    .slice(0, match.index)
    .replace(/[\/|:-]+$/g, '')
    .trim();

  return { base: trimmedBase, seriesSuffix };
}

function normalizeTitleSegment(segment: string): { title: string; seasonSuffix?: string } {
  let value = segment.replace(/\s+/g, ' ').trim();
  if (!value) {
    return { title: '' };
  }

  value = value.replace(/^[^\p{L}\p{N}]+/gu, '').replace(/[^\p{L}\p{N}]+$/gu, '').trim();
  if (!value) {
    return { title: '' };
  }

  const seasonMatch = value.match(/\b(?:S\d{1,2}|Season\s*\d{1,2}|\d{1,2}(?:st|nd|rd|th)\s*Season)\b$/i);
  let seasonSuffix: string | undefined;
  if (seasonMatch && seasonMatch.index !== undefined) {
    seasonSuffix = seasonMatch[0];
    value = value.slice(0, seasonMatch.index).trim();
  }

  value = value.replace(/^[\(\[]+|[\)\]]+$/g, '').trim();

  return { title: value, seasonSuffix };
}

function isMeaningfulTitle(title: string): boolean {
  if (!title) {
    return false;
  }

  if (!/\p{L}/u.test(title)) {
    return false;
  }

  if (title.length < 2) {
    return false;
  }

  if (title.length <= 3 && title.toUpperCase() === title) {
    return false;
  }

  return true;
}

export function extractTitleCandidates(rawTitle: string): { candidates: string[]; year?: string; suffix?: string } {
  const { base, suffix: metaSuffix } = splitTitleAndSuffix(rawTitle);
  const { base: baseWithoutSeries, seriesSuffix } = extractSeriesSuffix(base);

  const rawSegments = baseWithoutSeries.split(/\s*[\/|]\s*/);
  const seasonSuffixes: string[] = [];
  const seasonSuffixKeys = new Set<string>();
  const candidates: string[] = [];

  for (const segment of rawSegments) {
    const normalized = normalizeTitleSegment(segment);
    if (normalized.seasonSuffix) {
      const key = normalized.seasonSuffix.replace(/[^0-9]/g, '') || normalized.seasonSuffix.toLowerCase();
      if (!seasonSuffixKeys.has(key)) {
        seasonSuffixKeys.add(key);
        seasonSuffixes.push(normalized.seasonSuffix);
      }
    }

    const cleaned = normalized.title
      .replace(/\b(19|20)\d{2}\b/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();

    if (!isMeaningfulTitle(cleaned)) {
      continue;
    }

    candidates.push(cleaned);
  }

  const seen = new Set<string>();
  const uniqueCandidates = candidates.filter((candidate) => {
    const key = candidate.toLowerCase();
    if (seen.has(key)) {
      return false;
    }
    seen.add(key);
    return true;
  });

  if (uniqueCandidates.length === 0 && isMeaningfulTitle(baseWithoutSeries)) {
    uniqueCandidates.push(baseWithoutSeries.trim());
  }

  const year = findYear(metaSuffix) ?? findYear(baseWithoutSeries) ?? findYear(rawTitle);

  const suffixParts = [
    seriesSuffix,
    ...seasonSuffixes,
    metaSuffix,
  ].filter(Boolean) as string[];
  const suffix = suffixParts.join(' ').replace(/\s+/g, ' ').trim() || undefined;

  return { candidates: uniqueCandidates, year, suffix };
}

export function isVideoResult(result: JacketResponseItem): boolean {
  const category = result.CategoryDesc?.toLowerCase() ?? '';
  if (category) {
    return category.includes('movie') || category.includes('tv') || category.includes('anime');
  }

  const title = result.Title;
  if (/\[(movie|tv|anime)\]/i.test(title)) {
    return true;
  }

  return /\bS\d{1,2}E\d{1,2}\b/i.test(title);
}

function scoreCandidateTitle(candidate: string): number {
  const normalized = candidate.trim();
  const lower = normalized.toLowerCase();
  const words = lower.split(/\s+/).filter(Boolean);
  const englishMarkers = ['the', 'of', 'and', 'in', 'to', 'for', 'with', 'without', 'between', 'vs', 'a', 'an'];
  let score = 0;

  if (words.some((word) => englishMarkers.includes(word))) {
    score += 3;
  }

  if (normalized.includes(':')) {
    score += 2;
  }

  if (normalized.includes('?')) {
    score += 1;
  }

  if (words.length >= 2) {
    score += 1;
  }

  if (words.length >= 3) {
    score += 1;
  }

  if (/^[A-Z0-9]+$/.test(normalized)) {
    score -= 2;
  }

  if (!normalized.includes(' ') && normalized.length <= 8) {
    score -= 1;
  }

  if (/[^A-Za-z0-9\s:'-]/.test(normalized)) {
    score -= 1;
  }

  return score;
}

export function pickFallbackTitle(candidates: string[]): string | null {
  if (!candidates.length) {
    return null;
  }

  const sorted = [...candidates].sort((a, b) => {
    const scoreDiff = scoreCandidateTitle(b) - scoreCandidateTitle(a);
    if (scoreDiff !== 0) {
      return scoreDiff;
    }

    const wordDiff = b.split(/\s+/).length - a.split(/\s+/).length;
    if (wordDiff !== 0) {
      return wordDiff;
    }

    return b.length - a.length;
  });

  return sorted[0] ?? null;
}

export function buildLocalizedTitle(label: string, year: string | undefined, suffix?: string): string {
  let title = label.trim();
  const hasYearInSuffix = Boolean(year && suffix?.includes(year));
  const hasYearInTitle = Boolean(year && title.includes(year));

  if (year && !hasYearInSuffix && !hasYearInTitle) {
    title = `${title} (${year})`;
  }

  if (suffix) {
    title = `${title} ${suffix}`.trim();
  }

  return title;
}
