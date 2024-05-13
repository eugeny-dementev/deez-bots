import { QueueAction, util } from 'async-queue-runner';
import {
  AddUploadToQBitTorrent,
  CheckTorrentFile,
  CloseBrowser,
  DeleteFile,
  Log,
  MonitorDownloadingProgress,
  OpenBrowser,
  OpenQBitTorrent,
  TGPrintTorrentPattern
} from './actions.js';

export const handleQBTFile: () => QueueAction[] = () => [
  Log,
  TGPrintTorrentPattern,
  CheckTorrentFile,
  OpenBrowser,
  OpenQBitTorrent,
  Log,
  AddUploadToQBitTorrent,
  CloseBrowser,
  util.delay(5000),
  MonitorDownloadingProgress,
  DeleteFile,
];
