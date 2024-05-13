import { QueueAction, util } from 'async-queue-runner';
import {
  AddUploadToQBitTorrent,
  CheckTorrentFile,
  DeleteFile,
  Log,
  MonitorDownloadingProgress,
  ExtractTorrentPattern
} from './actions.js';

export const handleQBTFile: () => QueueAction[] = () => [
  Log,
  ExtractTorrentPattern,
  CheckTorrentFile,
  AddUploadToQBitTorrent,
  util.delay(5000),
  MonitorDownloadingProgress,
  DeleteFile,
];
