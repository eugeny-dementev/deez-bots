import { ILogger } from '@libs/actions';
import EventEmitter from 'node:events';
import { DB, Topic } from "./db";
import { ConfigWatcher, TrackingTopic, Type } from "./watcher";

/*
 * @WARNING: All time calculations and scheduling are done in UTC-0 timezone
 */

const THIRTY_MINUTES_MS = 30 * 60 * 1000;

export enum Hour {
  TVShow = 9, // 17:00 in UTC+8
  Game = 19, // 03:00 in UTC+8
}

export const typeToHour: Record<Type, Hour> = {
  ['tv_show']: Hour.TVShow,
  ['game']: Hour.Game,
}

function delay(timeout: number = 5000) {
  return new Promise(res => setTimeout(res, timeout));
}

type Timestamp = number

export class Scheduler extends EventEmitter {
  #timeoutsMap: Map<Topic['guid'], NodeJS.Timeout> = new Map();

  constructor(
    private readonly logger: ILogger,
    private readonly config: ConfigWatcher,
  ) {
    super();

    this.start().catch((error) => this.logger.error(error));
  }

  async start() {
    const topicsConfigs = await this.config.getTopicsConfigs();
    const db = new DB();

    for (const topicConfig of topicsConfigs) {
      const topic = await db.findTopic(topicConfig.guid);

      if (!topic) {
        return; // ConfigWatcher handles such cases
      }

      if (!topic.lastCheckDate && this.getCurrentHour() === typeToHour[topicConfig.type]) {
        this.emit('topic', topicConfig);
        return;
      }

      const timeout = this.calculateTimeout(topicConfig.type, topic.lastCheckDate) + Math.floor(Math.random() * THIRTY_MINUTES_MS);
      this.scheduleEvent(topicConfig, timeout);
    }
  }

  // return hours left until the target hour when timeout should trigger
  private calculateTimeout(type: Type, lastCheckDateStr: Topic['lastCheckDate']): number {
    const targetHour = typeToHour[type];

    const lastCheckedDate = new Date(lastCheckDateStr);
    lastCheckedDate.setUTCHours(lastCheckedDate.getUTCHours(), 0, 0, 0);

    const currentUTCDate = new Date();
    currentUTCDate.setUTCHours(currentUTCDate.getUTCHours(), 0, 0, 0);

    const targetUTCDate = new Date();
    targetUTCDate.setUTCHours(targetHour, 0, 0, 0);

    // If more than a day passed since last check date
    // if (currentUTCDate.getTime() - lastCheckedDate.getTime() > ONE_DAY_MS) {
    //   return targetUTCDate.getTime() - currentUTCDate.getTime();
    // }

    // Adjust for the same-hour rule
    if (lastCheckedDate.getUTCHours() === currentUTCDate.getUTCHours()) {
      targetUTCDate.setUTCDate(targetUTCDate.getUTCDate() + 1); // Move to next day
    }

    // If target time is already passed today, move it to tomorrow
    if (targetUTCDate.getUTCHours() <= currentUTCDate.getUTCHours()) {
      targetUTCDate.setUTCDate(targetUTCDate.getUTCDate() + 1);
    }

    const currentMinutesMs = new Date().getUTCMinutes() * 60 * 1000;

    return targetUTCDate.getTime() - currentUTCDate.getTime() - currentMinutesMs;
  }

  private getCurrentHour(): number {
    return new Date().getUTCHours();
  }

  private scheduleEvent(topicConfig: TrackingTopic, timeout: number) {
    if (this.#timeoutsMap.has(topicConfig.guid)) {
      return;
    }

    this.logger.info('Timeout set for ' + topicConfig.query, {
      timeout,
      targetDate: new Date(timeout + Date.now()).toString(),
      currentTime: new Date().toString(),
      hoursUntil: new Date(timeout).getUTCHours(),
      ...topicConfig,
    });

    const timeoutRef = setTimeout(() => {
      this.#timeoutsMap.delete(topicConfig.guid);

      this.emit('topic', topicConfig);
    }, timeout);

    this.#timeoutsMap.set(topicConfig.guid, timeoutRef);
  }

  // hook to call from queue after topic finish processing
  async hookForRescheduling(topicConfig: TrackingTopic) {
    const db = new DB();
    const topic = await db.findTopic(topicConfig.guid); // topic.lastCheckDate should be updated at that point

    if (!topic) {
      throw new Error('Topic is missing in DB when it must be there: ' + topicConfig.guid);
    }

    this.scheduleEvent(topicConfig, this.calculateTimeout(topicConfig.type, topic.lastCheckDate));
  }
}
