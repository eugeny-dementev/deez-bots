import {
  ExtractVideoDimensions,
  InjectLogger,
  InjectNotifications,
  notifications,
} from '@libs/actions';
import { QueueAction } from "async-queue-runner";
import {
  PrepareFilePath,
  RecordRoom,
  UploadVideo,
} from "./actions.js";

export const handlerQueue: () => QueueAction[] = () => [
  InjectLogger,
  InjectNotifications,
  PrepareFilePath,
  notifications.tadd('Start recording room'),
  RecordRoom,
  ExtractVideoDimensions,
  notifications.tadd('Uploading video'),
  UploadVideo,
];
