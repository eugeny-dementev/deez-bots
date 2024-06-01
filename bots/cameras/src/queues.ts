import { QueueAction, util } from "async-queue-runner";
import { InjectLogger, InjectNotifications } from '@libs/actions';
import {
  UploadVideo,
} from "./actions.js";

export const handlerQueue: () => QueueAction[] = () => [
  InjectLogger,
  InjectNotifications,
  PrepareFilePath,
  RecordCameraStream,
  UploadVideo,
];
