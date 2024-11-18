import expandTilde from 'expand-tilde';
import crypto from 'node:crypto';
import EventEmitter from 'node:events';
import { watch, WatchEventType, readFile, promises } from 'node:fs';
import path from 'node:path';

const trackingFile = 'tracking.json'
const trackingPath = path.join('~/.config/torrents', trackingFile);
const fullTrackingPath = expandTilde(trackingPath);

export type Type = 'tv_show' | 'game';
export type TrackingTopic = {
  type: Type,
  subsOnly: boolean,
  query: string,
  guid: string,
};
export type TrackingConfig = {
  topics: TrackingTopic[],
}

export class ConfigWatcher extends EventEmitter {
  private hashes = new Map<string, string>();

  constructor() {
    super()

    watch(fullTrackingPath, (event: WatchEventType, filename: string | null) => {
      if (event === 'change' && filename === trackingFile) {
        readFile(fullTrackingPath, (err, buf) => {
          if (err) {
            console.log('Error while tryint to watch', fullTrackingPath);
            console.error(err);
            return;
          }
          try {
            const content = buf.toString();
            const configHash = this.getHash(content);
            if (this.hashes.get('full') === configHash) {
              return;
            }
            this.hashes.set('full', configHash);

            const config = JSON.parse(content.toString()) as TrackingConfig;

            config.topics.forEach((topic) => {
              const topicHash = this.getHash(JSON.stringify(topic));
              if (this.hashes.get(topic.guid) === topicHash) {
                return;
              }
              this.hashes.set(topic.guid, topicHash);

              this.emit('topic', topic);
            })
          } catch (e) {
            console.log('Failed to parse tracking config');
            console.error(e)
          }
        })
      }
    });
  }

  async getTopicsConfigs(type: Type): Promise<TrackingTopic[]> {
    const buf = await promises.readFile(fullTrackingPath);

    const content = JSON.parse(buf.toString()) as TrackingConfig;

    return content.topics.filter((topicConfig) => topicConfig.type === type);
  }

  private getHash(str: string): string {
    const hash = crypto.createHash('sha256');

    hash.update(str);

    return hash.digest('hex');
  }
}
