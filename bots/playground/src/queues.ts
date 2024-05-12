import { ytdlp, YtDlpSizesOutput, notifications, InjectNotifications, InjectLogger } from '@libs/actions';
import { QueueAction, util } from "async-queue-runner";
import {
  CalcTimeLeft,
  CleanUpUrl,
  DeleteFile,
  DeleteLimitStatus,
  FindFile,
  FindMainFile,
  Log,
  ExtractVideoDimentions,
  ConvertVideo,
  DownloadVideo,
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
  Log,
  CalcTimeLeft,
  Log,
  SetLimitStatus,
  util.if<BotContext>(({ url }) => isValidURL(url), {
    then: [
      util.if<TimeLimitContext>(({ timeLimitLeft }) => timeLimitLeft === 0, {
        then: [
          notifications.tlog('Message received'),
          CleanUpUrl,
          ytdlp.sizes({
            then: [
              shortcut.extend({ title: true }),
              shortcut.extend({ destDir: storageDir }),
              notifications.tlog('Downloading full video to storage'),
              DownloadVideo,
              FindMainFile,
              Log,
              util.if<YtDlpSizesOutput>(({ sizes }) => Boolean(sizes.find(({ size, res }) => res >= 400 && res <= 500 && size < 50.0)), {
                then: [
                  shortcut.extend({ title: false }),
                  shortcut.extend({ destDir: homeDir }),
                  notifications.tlog('Downloading video for telegram'),
                  DownloadVideo,
                  FindFile,
                  Log,
                  notifications.tlog('Preparing video for telegram'),
                  ConvertVideo,
                  Log,
                  DeleteFile,
                  FindFile,
                  Log,
                  ExtractVideoDimentions,
                  Log,
                  util.if<BotContext>(({ channelId }) => Boolean(channelId), {
                    then: [
                      Log,
                      UploadVideo,
                      notifications.tlog('Video uploaded to the telegram'),
                    ],
                    else: [
                      DeleteLimitStatus,
                      SetChatIdToChannelId,
                      Log,
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
            error: [
              notifications.tlog('No video to download'),
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
