import { InjectLogger, InjectNotifications, notifications } from '@libs/actions';
import { QueueAction, util } from 'async-queue-runner';
import {
  AddUploadToQBitTorrent,
  CheckTopicInDB,
  CheckTorrentFile,
  ConvertMultiTrack,
  DeleteFile,
  DownloadFile,
  DownloadTopicFile,
  ExtractTorrentPattern,
  MonitorDownloadingProgress,
  ReadTorrentFile,
  RemoveOldTorrentItem,
  RenameFile,
  ScheduleNextCheck,
  SearchTopic,
  SetLastCheckedDate,
  TopicConfigContext
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
  RemoveOldTorrentItem,
];

export const handleTvShowTopic: () => QueueAction[] = () => [
  InjectLogger,
  InjectNotifications,
  notifications.tadd<TopicConfigContext>(({ topicConfig }) => `Analyzing tv show topic: ${topicConfig.query}`),
  SearchTopic,
  CheckTopicInDB,
  SetLastCheckedDate,
  ScheduleNextCheck,
  DownloadTopicFile,
  notifications.tadd('New topic torrent file downloaded'),
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
  ReadTorrentFile,
  MonitorDownloadingProgress,
  util.if<MultiTrackContext>(({ type }) => type === 'multi-track', {
    then: [
      notifications.tadd('Start multiplexing'),
      ConvertMultiTrack,
    ],
  }),
  RemoveOldTorrentItem,
  DeleteFile,
];

export const handleGameTopic: () => QueueAction[] = () => [
  InjectLogger,
  InjectNotifications,
  notifications.tadd<TopicConfigContext>(({ topicConfig }) => `Analyzing game topic: ${topicConfig.query}`),
  SearchTopic,
  CheckTopicInDB,
  SetLastCheckedDate,
  ScheduleNextCheck,
  DownloadTopicFile,
  notifications.tadd('New topic torrent file downloaded'),
  notifications.tadd('Adding torrent to download'),
  AddUploadToQBitTorrent,
  notifications.tadd('Start monitoring download progress'),
  util.delay(5000),
  ReadTorrentFile,
  MonitorDownloadingProgress,
  RemoveOldTorrentItem,
  DeleteFile,
];
