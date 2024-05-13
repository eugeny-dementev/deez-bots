import { InjectLogger, InjectNotifications, YtDlpSizes, YtDlpSizesOutput, notifications } from '@libs/actions';
import { QueueAction, util } from "async-queue-runner";
import {
  CalcTimeLeft,
  CleanUpUrl,
  ConvertVideo,
  DeleteFile,
  DeleteLimitStatus,
  DownloadVideo,
  ExtractVideoDimentions,
  FindFile,
  FindMainFile,
  SetChatIdToChannelId,
  SetLimitStatus,
  UploadVideo,
} from "./actions.js";
import { homeDir, storageDir } from "./config.js";
import { formatTime } from "./helpers.js";
import { shortcut } from "./shortcuts.js";
import { BotContext, TimeLimitContext } from "./types.js";
import { isValidURL } from "./validators.js";

export const shortHandlerQueue: () => QueueAction[] = () => [
  InjectLogger,
  InjectNotifications,
  CalcTimeLeft,
  SetLimitStatus,
  util.if<BotContext>(({ url }) => isValidURL(url), {
    then: [
      util.if<TimeLimitContext>(({ timeLimitLeft }) => timeLimitLeft === 0, {
        then: [
          notifications.tlog('Message received'),
          CleanUpUrl,
          YtDlpSizes,
          shortcut.extend({ title: true, destDir: storageDir }),
          notifications.tlog('Downloading full video to storage'),
          DownloadVideo,
          FindMainFile,
          util.if<YtDlpSizesOutput>(({ sizes }) => Boolean(sizes.find(({ size, res }) => res >= 400 && res <= 500 && size < 50.0)), {
            then: [
              shortcut.extend({ title: false, destDir: homeDir }),
              notifications.tlog('Downloading video for telegram'),
              DownloadVideo,
              FindFile,
              notifications.tlog('Preparing video for telegram'),
              ConvertVideo,
              DeleteFile,
              FindFile,
              ExtractVideoDimentions,
              util.if<BotContext>(({ channelId }) => Boolean(channelId), {
                then: [
                  UploadVideo,
                  notifications.tlog('Video uploaded to the telegram'),
                ],
                else: [
                  DeleteLimitStatus,
                  SetChatIdToChannelId,
                  UploadVideo,
                  notifications.tlog('Processing complete'),
                ],
              }),
              DeleteFile,
            ],
            else: [
              notifications.tlog('Video is too big for telegram'),
            ],
          }),
        ],
        else: [
          DeleteLimitStatus,
          notifications.tlog('Invalid URL'),
        ],
      }),
    ],
    else: [
      notifications.tlog<TimeLimitContext>(({ timeLimitLeft }) => `${formatTime(timeLimitLeft)} left until next post`)
    ],
  }),
];
