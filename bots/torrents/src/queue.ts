import { InjectLogger, InjectNotifications, notifications } from '@libs/actions';
import { QueueAction, util } from 'async-queue-runner';
import {
  AddUploadToQBitTorrent,
  CheckTorrentFile,
  ConvertMultiTrack,
  DeleteFile,
  DownloadFile,
  ExtractTorrentPattern,
  MonitorDownloadingProgress,
  RenameFile
} from './actions.js';
import { MultiTrackContext } from './types.js';

export const handleQBTFile: () => QueueAction[] = () => [
  InjectLogger,
  InjectNotifications,
  RenameFile,
  DownloadFile,
  notifications.tadd('Analyzing torrent'),
  ExtractTorrentPattern,
  CheckTorrentFile,
  util.if<MultiTrackContext>(({ type }) => type === 'multi-track', {
    then: [
      notifications.tlog('Torrent parsed, Multi Track detected'),
    ],
  }),
  notifications.tadd('Adding torrent to download'),
  AddUploadToQBitTorrent,
  notifications.tadd('Start monitoring download progress'),
  util.delay(5000),
  MonitorDownloadingProgress,
  util.if<MultiTrackContext>(({ type }) => type === 'multi-track', {
    then: [
      notifications.tadd('Start multiplexing'),
      ConvertMultiTrack,
    ],
  }),
  DeleteFile,
];

export const HandleTopic: () => QueueAction[] = () => [
  InjectLogger,
  InjectNotifications,
  notifications.tadd('Analyzing topic'),
  // SearchTopicInJackett,
  // CheckTopicInDB,
  // util.if<TopicContext>(({ publishDate, lastPublishDate }) => publishDate === lastPublishDate, {
  //   then: [
  //     notifications.tadd('Nothing updated in the topic'),
  //     util.abort(),
  //   ],
  // }),
  // DownloadJackettFile,
  // notifications.tadd('New topic torrent file downloaded'),
  ExtractTorrentPattern,
  CheckTorrentFile,
  util.if<MultiTrackContext>(({ type }) => type === 'multi-track', {
    then: [
      notifications.tlog('Torrent parsed, Multi Track detected'),
    ],
  }),
  notifications.tadd('Adding torrent to download'),
  AddUploadToQBitTorrent,
  notifications.tadd('Start monitoring download progress'),
  util.delay(5000),
  MonitorDownloadingProgress,
  util.if<MultiTrackContext>(({ type }) => type === 'multi-track', {
    then: [
      notifications.tadd('Start multiplexing'),
      ConvertMultiTrack,
    ],
  }),
  DeleteFile,
];
