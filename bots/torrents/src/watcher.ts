import expandTilde from 'expand-tilde';
import EventEmitter from 'node:events';
import { watch, WatchEventType, readFile } from 'node:fs';
import path from 'node:path';

const trackingFile = 'tracking.json'
const trackingPath = path.join('~/.config/torrents', trackingFile);
const fullTrackingPath = expandTilde(trackingPath);

export class ConfigWatcher extends EventEmitter {
  constructor() {
    super()

    watch(fullTrackingPath, (event: WatchEventType, filename: string | null) => {
      console.log('watcher triggered', event, filename);
      if (event === 'change' && filename === trackingFile) {
        readFile(fullTrackingPath, (err, content) => {
          if (err) {
            console.log('Error while tryint to watch', fullTrackingPath);
            console.error(err);
            return;
          }
          try {
            const config = JSON.parse(content.toString());

            this.emit('config', config);
          } catch (e) {
            console.log('Failed to parse tracking config');
            console.error(e)
          }
        })
      }
    });
  }
}
