import { Action, QueueContext } from '@libs/actions';
import expandTilde from 'expand-tilde';
import * as fs from 'fs';
import * as path from 'path';
import { Readable } from 'node:stream';
import { finished } from 'node:stream/promises';
import { ReadableStream } from 'node:stream/web';
import { downloadsDir, jackettHost, jackettKey } from '../config.js';
import { DB } from '../db.js';
import { russianLetters, russianToEnglish } from '../helpers.js';
import { JacketResponseItem } from '../jackett.js';
import { TrackingTopic } from '../watcher.js';
import { fetchWithTimeout, HttpStatusError } from '../services/http.js';
import { searchJackett } from '../services/jackett-client.js';
import { CompContext } from './context.js';

export type Topic = {
  link: string;
  title: string;
  guid: string;
  publishDate: string;
};

export type TopicConfigContext = {
  topicConfig: TrackingTopic;
};

export type TopicContext = { topic: Topic };

export class SearchTopic extends Action<TopicConfigContext & CompContext> {
  async execute(context: TopicConfigContext & CompContext & QueueContext): Promise<void> {
    const { topicConfig } = context;

    const url = `${jackettHost}/api/v2.0/indexers/all/results?apikey=${jackettKey}&Query=${encodeURIComponent(topicConfig.query)}`;

    const reportNotFound = async (reason: string): Promise<void> => {
      context.logger.info(reason, {
        topicConfig,
        url,
      });

      await context.tadd(`No topics found for "${topicConfig.query}" / "${topicConfig.guid}". Update tracking.json.`);

      const db = new DB();
      const existing = await db.findTopic(topicConfig.guid);
      if (!existing) {
        await db.addTopic(topicConfig.guid, new Date(0).toISOString());
      }
      await db.updateLastCheckDateTopic(topicConfig.guid, new Date().toISOString());

      context.abort();
    };

    let torrents: JacketResponseItem[];
    try {
      torrents = await searchJackett(topicConfig.query);
    } catch (error) {
      if (error instanceof HttpStatusError) {
        context.logger.warn(`Bad response while searching for topics: ${error.statusText}`, {
          status: error.status,
          ok: false,
          url: error.url,
          topicConfig,
        });
      } else {
        context.logger.warn('Search topics request failed', {
          topicConfig,
          error: (error as Error).message,
        });
      }
      context.abort();
      return;
    }

    if (!torrents.length) {
      await reportNotFound(`No topics found while searching: ${topicConfig.query}`);
      return;
    }

    const responseTopic = torrents.find((torrent) => topicConfig.guid === torrent.Guid);

    if (!responseTopic) {
      await reportNotFound('No topics found for provided guid/query pair');
      return;
    }

    const topic: Topic = {
      guid: responseTopic.Guid,
      link: responseTopic.Link,
      publishDate: responseTopic.PublishDate,
      title: responseTopic.Title,
    };

    context.extend({ topic });
  }
}

export class CheckTopicInDB extends Action<TopicContext & CompContext> {
  async execute(context: TopicContext & CompContext & QueueContext): Promise<void> {
    const { topic, tadd } = context;

    const db = new DB();

    const dbTopic = await db.findTopic(topic.guid);

    if (!dbTopic) {
      await db.addTopic(topic.guid, topic.publishDate);
      context.logger.info('New topic added to db', topic);
      return;
    }

    context.logger.info('DB Topic found', dbTopic);

    const newPublishDate = new Date(topic.publishDate).getTime();
    const oldPublishDate = new Date(dbTopic.publishDate).getTime();

    if (newPublishDate === oldPublishDate) {
      context.logger.info('No updates in the topic', {
        topic: topic,
        dbTopic,
      });
      await tadd('No updates found, resheduling');

      context.abort();
      return;
    }

    await db.updatePubDateTopic(topic.guid, topic.publishDate);

    context.logger.info('Topic is updates in DB', {
      topic: topic,
      dbTopic,
    });
  }
}

export class DownloadTopicFile extends Action<TopicContext & CompContext> {
  async execute(context: TopicContext & CompContext & QueueContext): Promise<void> {
    const { topic } = context;

    const fileName = topic.title
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
    const destination = path.join(absolutePathDownloadsDir, `${fileName}.torrent`);

    const response = await fetchWithTimeout(topic.link);
    if (!response.ok || !response.body) {
      context.logger.warn('Failed to download file');
      context.abort();
      return;
    }

    const fileStream = fs.createWriteStream(destination);
    await finished(Readable.fromWeb(response.body as ReadableStream).pipe(fileStream));

    context.logger.info('Topic file downloaded', {
      ...topic,
      fileName,
      destination
    });

    context.extend({
      filePath: destination,
    });
  }
}

export class SetLastCheckedDate extends Action<TopicContext & CompContext> {
  async execute(context: TopicContext & CompContext & QueueContext): Promise<void> {
    const { topic } = context;
    const db = new DB();

    await db.updateLastCheckDateTopic(topic.guid, new Date().toISOString());
  }
}

export type SchedulerContext = { scheduleNextCheck: () => void };

export class ScheduleNextCheck extends Action<SchedulerContext & TopicConfigContext & CompContext> {
  async execute(context: SchedulerContext & TopicConfigContext & CompContext & QueueContext): Promise<void> {
    const { scheduleNextCheck } = context;

    scheduleNextCheck();
  }
}
