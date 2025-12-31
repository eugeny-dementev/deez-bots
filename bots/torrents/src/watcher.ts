import { ILogger } from '@libs/actions';
import { assert } from '@libs/assert';
import expandTilde from 'expand-tilde';
import crypto from 'node:crypto';
import EventEmitter from 'node:events';
import { promises, readFile } from 'node:fs';
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

  private fileWatcher?: { on: (event: string, listener: (...args: unknown[]) => void) => void }

  constructor(private readonly logger: ILogger) {
    super()

    this.logger.info('Start watching tracking.json config', {
      fullTrackingPath,
    });

    void this.startWatcher();
  }

  private async startWatcher(): Promise<void> {
    const { watch } = await import('chokidar');

    this.fileWatcher = watch(fullTrackingPath, {
      usePolling: true, // had to use polling because config file is mounted to docker container and "inotify" events are not triggered
      interval: 1000,
    });
    this.fileWatcher.on('change', () => {
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

          assert(Array.isArray(config.topics), 'tracking.json should contain array of topics', config);

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
      });
    });
  }

  async getTopicsConfigs(): Promise<TrackingTopic[]> {
    const buf = await promises.readFile(fullTrackingPath);

    const content = JSON.parse(buf.toString()) as TrackingConfig;

    return content.topics;
  }

  private getHash(str: string): string {
    const hash = crypto.createHash('sha256');

    hash.update(str);

    return hash.digest('hex');
  }
}
