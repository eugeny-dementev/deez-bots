import { Action, QueueContext } from '@libs/actions';
import expandTilde from 'expand-tilde';
import * as fs from 'fs';
import { InlineKeyboard } from 'grammy';
import * as path from 'path';
import { Readable } from 'node:stream';
import { finished } from 'node:stream/promises';
import { ReadableStream } from 'node:stream/web';
import { downloadsDir, jackettHost } from '../config.js';
import { russianLetters, russianToEnglish } from '../helpers.js';
import { JacketResponseItem } from '../jackett.js';
import { clearSearchResults, getSearchResults, setSearchResults } from '../search-store.js';
import {
  buildLocalizedTitle,
  extractTitleCandidates,
  isVideoResult,
  normalizeLanguage,
  pickFallbackTitle,
} from '../parsers/title-normalizer.js';
import { fetchWithTimeout, HttpStatusError } from '../services/http.js';
import { searchJackett, normalizeSearchResults } from '../services/jackett-client.js';
import { resolveWikidataTitle } from '../services/wikidata-client.js';
import { CompContext } from './context.js';

export type SearchQueryContext = {
  query: string;
  language?: string;
};

export type SearchResultsContext = {
  results: JacketResponseItem[];
};

export type SearchResultIndexContext = {
  index: number;
};

export type SearchResultContext = {
  result: JacketResponseItem;
};

export type SearchMessageContext = {
  messageId?: number;
};

export class SearchByQuery extends Action<SearchQueryContext & CompContext> {
  async execute(context: SearchQueryContext & CompContext & QueueContext): Promise<void> {
    const { query } = context;
    const baseQuery = query.trim();
    const hasResolutionSuffix = /\b\d+p$/i.test(baseQuery);
    const resolutionQueries = ['2160p', '1080p', '720p'].map((res) => `${baseQuery} ${res}`);
    const searchQueries = hasResolutionSuffix ? [baseQuery] : resolutionQueries;
    let results: JacketResponseItem[] = [];

    for (const searchQuery of searchQueries) {
      let batch: JacketResponseItem[];
      try {
        batch = await searchJackett(searchQuery);
      } catch (error) {
        if (error instanceof HttpStatusError) {
          context.logger.warn(`Bad response while searching for query: ${error.statusText}`, {
            status: error.status,
            ok: false,
            url: error.url,
            query: searchQuery,
          });
        } else {
          context.logger.warn('Search request failed', {
            query: searchQuery,
            error: (error as Error).message,
          });
        }

        await context.tlog('Search failed. Try again later.');
        context.abort();
        return;
      }

      results = normalizeSearchResults([...results, ...batch], 5);
      if (results.length >= 5) {
        break;
      }
    }

    if (!results.length) {
      await context.tlog(`No results for "${query}".`);
      context.abort();
      return;
    }

    context.extend({ results });
  }

  async onError(error: Error, context: QueueContext): Promise<void> {
    await (context as unknown as Partial<CompContext>).tlog?.('Search failed. Try again later.');
    await super.onError(error, context);
  }
}

export class UpdateSearchResultTitles extends Action<SearchQueryContext & SearchResultsContext & CompContext> {
  async execute(context: SearchQueryContext & SearchResultsContext & CompContext & QueueContext): Promise<void> {
    const { results } = context;
    const language = normalizeLanguage(context.language);

    if (!results?.length) {
      return;
    }

    const updatedResults: JacketResponseItem[] = [];

    for (const result of results) {
      if (!isVideoResult(result)) {
        updatedResults.push(result);
        continue;
      }

      const { candidates, year, suffix } = extractTitleCandidates(result.Title);
      if (!candidates.length) {
        updatedResults.push(result);
        continue;
      }

      try {
        const label = await resolveWikidataTitle(candidates, year, language);
        const resolved = label ?? pickFallbackTitle(candidates);
        if (!resolved) {
          updatedResults.push(result);
          continue;
        }

        updatedResults.push({
          ...result,
          Title: buildLocalizedTitle(resolved, year, suffix),
        });
      } catch (error) {
        context.logger.warn('Wikidata lookup failed', {
          title: result.Title,
          error: (error as Error).message,
        });
        updatedResults.push(result);
      }
    }

    context.extend({ results: updatedResults });
  }
}

export class StoreSearchResults extends Action<SearchQueryContext & SearchResultsContext & SearchMessageContext & CompContext> {
  async execute(context: SearchQueryContext & SearchResultsContext & SearchMessageContext & CompContext & QueueContext): Promise<void> {
    const topResults = context.results.slice(0, 5);
    const messageId = context.messageId;
    setSearchResults(context.chatId, context.query, topResults, messageId);
    context.extend({ results: topResults });
  }
}

export class ReplySearchResults extends Action<SearchQueryContext & SearchResultsContext & CompContext> {
  async execute(context: SearchQueryContext & SearchResultsContext & CompContext & QueueContext): Promise<void> {
    const { query, results } = context;
    const topResults = results.slice(0, 5);

    const keyboard = new InlineKeyboard();
    topResults.forEach((_, index) => {
      const title = topResults[index].Title ?? `Result ${index + 1}`;
      const numberedTitle = `${index + 1}. ${title}`;
      const label = numberedTitle.length > 60 ? `${numberedTitle.slice(0, 57)}...` : numberedTitle;
      keyboard.text(label, `search:get:${index + 1}`).row();
    });
    keyboard.text('Cancel', 'search:cancel');

    const list = topResults
      .map((item, index) => `${index + 1}. ${item.Title}`)
      .join('\n');
    const message = await context.bot.api.sendMessage(
      context.chatId,
      `Results for "${query}":\n${list}\n\nTap a button below.`,
      { reply_markup: keyboard }
    );

    context.extend({ messageId: message.message_id });
  }
}

export class ResolveSearchResult extends Action<SearchResultIndexContext & CompContext> {
  async execute(context: SearchResultIndexContext & CompContext & QueueContext): Promise<void> {
    const { chatId, index } = context;
    const cached = getSearchResults(chatId);

    if (!cached || cached.results.length === 0) {
      await context.tlog('No recent search results. Send a text query first.');
      context.abort();
      return;
    }

    if (!Number.isInteger(index) || index < 1 || index > cached.results.length) {
      await context.tlog(`Invalid id. Use /get <1-${cached.results.length}> from the latest search.`);
      context.abort();
      return;
    }

    context.extend({ result: cached.results[index - 1] });
  }
}

export class DownloadSearchResultFile extends Action<SearchResultContext & CompContext> {
  async execute(context: SearchResultContext & CompContext & QueueContext): Promise<void> {
    const { result } = context;
    const fileName = result.Title
      .toLowerCase()
      .split('')
      .map((char: string) => {
        if (russianLetters.has(char)) {
          return russianToEnglish[char as keyof typeof russianToEnglish] || char;
        } else return char;
      })
      .join('')
      .replace(/\s+/g, '_')
      .replace(/[^a-z0-9_]/g, '');
    const absolutePathDownloadsDir = expandTilde(downloadsDir);
    const safeFileName = fileName || `torrent_${Date.now()}`;
    const destination = path.join(absolutePathDownloadsDir, `${safeFileName}.torrent`);

    const downloadLink = result.Link.startsWith('http')
      ? result.Link
      : `${jackettHost}${result.Link}`;
    const useNoProxy = downloadLink.startsWith(jackettHost);

    const response = await fetchWithTimeout(downloadLink, { noProxy: useNoProxy });
    if (!response.ok || !response.body) {
      context.logger.warn('Failed to download torrent file', {
        status: response.status,
        ok: response.ok,
        link: downloadLink,
      });
      await context.tlog('Failed to download torrent file.');
      context.abort();
      return;
    }

    const fileStream = fs.createWriteStream(destination);
    await finished(Readable.fromWeb(response.body as ReadableStream).pipe(fileStream));

    context.extend({
      filePath: destination,
    });
  }

  async onError(error: Error, context: QueueContext): Promise<void> {
    await (context as unknown as Partial<CompContext>).tlog?.('Failed to download torrent file.');
    await super.onError(error, context);
  }
}

export class ClearSearchResults extends Action<SearchMessageContext & CompContext> {
  async execute(context: SearchMessageContext & CompContext & QueueContext): Promise<void> {
    const cached = getSearchResults(context.chatId);
    const messageId = context.messageId ?? cached?.messageId;

    if (messageId) {
      await context.bot.api.editMessageReplyMarkup(context.chatId, messageId, {
        reply_markup: { inline_keyboard: [] },
      });
    }

    clearSearchResults(context.chatId);
  }
}
