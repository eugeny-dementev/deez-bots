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

function delay(timeout: number = 5000): Promise<boolean> {
  return new Promise(res => setTimeout(res, timeout, true));
}

function formatTimeLeft(timestamp: number) {
  const now = Date.now();
  let diff = timestamp - now;

  if (diff <= 0) {
    return "00:00:00";
  }

  const hours = Math.floor(diff / (1000 * 60 * 60));
  diff %= 1000 * 60 * 60;
  const minutes = Math.floor(diff / (1000 * 60));
  diff %= 1000 * 60;
  const seconds = Math.floor(diff / 1000);

  return [hours, minutes, seconds]
    .map(unit => String(unit).padStart(2, '0'))
    .join(":");
}

type Timestamp = number

export class Scheduler extends EventEmitter {
  #timeoutsMap: Map<Topic['guid'], NodeJS.Timeout> = new Map();

  #plannedCheckTimeMap: Map<Topic['guid'], Timestamp> = new Map();

  constructor(
    private readonly logger: ILogger,
    private readonly config: ConfigWatcher,
  ) {
    super();

    this.config.on('topic', (topic: TrackingTopic) => {
      if (this.#plannedCheckTimeMap.has(topic.guid)) {
        return;
      }

      this.#plannedCheckTimeMap.set(topic.guid, Date.now());
    });
    // this.start().catch((error) => this.logger.error(error));
    this.scheduleChecks().catch((error) => this.logger.error(error));
    this.runCheckLoop().catch((error) => this.logger.error(error));
  }

  async scheduleChecks() {
    const topicsConfigs = await this.config.getTopicsConfigs();
    for (const topicConfig of topicsConfigs) {
      this.#plannedCheckTimeMap.set(topicConfig.guid, Date.now());
    }
  }

  async runCheckLoop() {
    while (await delay()) {
      this.logger.info('Scheduler loop', new Date);

      for (const [guid, timestamp] of this.#plannedCheckTimeMap.entries()) {
        const topicConfig = await this.getTopicConfig(guid);
        if (!topicConfig) {
          this.logger.error(new Error(`Topic config is not found: ${guid}`));
          continue;
        }

        const topic = await this.getTopic(topicConfig.guid);
        if (!topic) {
          this.logger.error(new Error(`Topic is not found: ${guid}`));
          continue;
        }

        if (timestamp < Date.now()) {
          this.logger.info('Checking topic', {
            topic: topicConfig.query,
            guid,
          });

          // recalculate next timestamp
          const timeout = this.calculateTimeout(topicConfig.type, topic.lastCheckDate) + Math.floor(Math.random() * THIRTY_MINUTES_MS);
          const timestamp = Date.now() + timeout;
          this.logger.info('Scheduling next topic check', { guid, date: new Date(timestamp) });
          this.#plannedCheckTimeMap.set(guid, timestamp);

          this.emit('topic', topicConfig);
        } else {
          this.logger.info('Time until next topic check', {
            timeLeft: formatTimeLeft(timestamp),
            topic: topicConfig.query,
            guid,
          });
        }
      }
    }
  }

  async getTopicConfig(guid: Topic['guid']): Promise<TrackingTopic | undefined> {
    const topicsConfigs = await this.config.getTopicsConfigs();

    return topicsConfigs.find((config) => config.guid === guid);
  }

  async getTopic(guid: Topic['guid']): Promise<Topic | undefined> {
    const db = new DB();
    return db.findTopic(guid);
  }

  // return hours left until the target hour when timeout should trigger
  private calculateTimeout(type: Type, lastCheckDateStr: Topic['lastCheckDate']): Timestamp {
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
