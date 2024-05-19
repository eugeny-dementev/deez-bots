import { InjectLogger, InjectNotifications, notifications } from '@libs/actions';
import { QueueAction, util } from 'async-queue-runner';
import {
  AddUploadToQBitTorrent,
  CheckTorrentFile,
  ConvertMultiTrack,
  DeleteFile,
  ExtractTorrentPattern,
  Log,
  MonitorDownloadingProgress,
} from './actions.js';
import { MultiTrackContext } from './types.js';

export const handleQBTFile: () => QueueAction[] = () => [
  InjectLogger,
  InjectNotifications,
  Log,
  ExtractTorrentPattern,
  CheckTorrentFile,
  util.if<MultiTrackContext>(({ type }) => type === 'multi-track', {
    then: [
      notifications.tlog('Multi Track torrent detected'),
    ],
  }),
  Log,
  AddUploadToQBitTorrent,
  util.delay(5000),
  MonitorDownloadingProgress,
  util.if<MultiTrackContext>(({ type }) => type === 'multi-track', {
    then: [
      notifications.tlog('Start multiplexing'),
      ConvertMultiTrack,
    ],
  }),
  DeleteFile,
];
