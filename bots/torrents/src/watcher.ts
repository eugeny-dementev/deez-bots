import expandTilde from 'expand-tilde';
import crypto from 'node:crypto';
import EventEmitter from 'node:events';
import { watch, WatchEventType, readFile } from 'node:fs';
import path from 'node:path';

const trackingFile = 'tracking.json'
const trackingPath = path.join('~/.config/torrents', trackingFile);
const fullTrackingPath = expandTilde(trackingPath);

export type TrackingTopic = {
  type: 'tv_show',
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

  getHash(str: string): string {
    const hash = crypto.createHash('sha256');

    hash.update(str);

    return hash.digest('hex');
  }
}
