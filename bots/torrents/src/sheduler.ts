import EventEmitter from 'node:events';
import { DB, Topic } from "./db";
import { Logger } from "./logger";
import { ConfigWatcher, TrackingTopic, Type } from "./watcher";

/*
 * @WARNING: All time calculations and scheduling are done in UTC-0 timezone
 */

export enum Hour {
  TVShow = 10, // 18:00 in UTC+8
  Game = 19, // 03:00 in UTC+8
}

export const typeToHour: Record<Type, Hour> = {
  ['tv_show']: Hour.TVShow,
  ['game']: Hour.Game,
}

export class Scheduler extends EventEmitter {
  #timeoutsMap: Map<Topic['guid'], NodeJS.Timeout> = new Map();

  constructor(
    private readonly logger: Logger,
    private readonly config: ConfigWatcher,
    private readonly type: Type,
  ) {
    super();

    this.hookForRescheduling = this.hookForRescheduling.bind(this);
  }

  async start() {
    const topicsConfigs = await this.config.getTopicsConfigs(this.type);
    const db = new DB();

    for (const topicConfig of topicsConfigs) {
      const topic = await db.findTopic(topicConfig.guid);

      if (!topic) {
        return; // ConfigWatcher handles such cases
      }

      if (!topic.lastCheckDate && this.getCurrentHour() === typeToHour[this.type]) {
        this.emit('topic', topicConfig);
        return;
      }

      this.scheduleEvent(topicConfig, this.calculateTimeout(topic.lastCheckDate));
    }
  }

  // return hours left until the target hour when timeout should trigger
  private calculateTimeout(lastCheckDateStr: Topic['lastCheckDate']): number {
    const targetHour = typeToHour[this.type];

    const lastCheckedData = new Date(lastCheckDateStr);
    lastCheckedData.setUTCHours(lastCheckedData.getUTCHours(), 0, 0, 0);

    const currentUTCDate = new Date();
    currentUTCDate.setUTCHours(currentUTCDate.getUTCHours(), 0, 0, 0);

    const targetUTCDate = new Date();
    targetUTCDate.setUTCHours(targetHour, 0, 0, 0);

    // Adjust for the same-hour rule
    if (lastCheckedData.getUTCHours() === currentUTCDate.getUTCHours()) {
      targetUTCDate.setUTCDate(targetUTCDate.getUTCDate() + 1); // Move to next day
    }

    // If target time is already passed today, move it to tomorrow
    if (targetUTCDate.getUTCHours() <= currentUTCDate.getUTCHours()) {
      targetUTCDate.setUTCDate(targetUTCDate.getUTCDate() + 1);
    }

    return targetUTCDate.getTime() - currentUTCDate.getTime();
  }

  private getCurrentHour(): number {
    return new Date().getUTCHours();
  }

  private scheduleEvent(topicConfig: TrackingTopic, timeout: number) {
    const timeoutRef = setTimeout(() => {
      this.#timeoutsMap.delete(topicConfig.guid);

      this.emit('topic', { topicConfig, sheduleNextCheck: this.hookForRescheduling });
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

    this.scheduleEvent(topicConfig, this.calculateTimeout(topic.lastCheckDate));
  }
}
