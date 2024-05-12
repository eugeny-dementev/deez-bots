import { ytdlp } from '@libs/actions';
import { QueueAction, util } from "async-queue-runner";
import {
  CalcTimeLeft,
  CleanUpUrl,
  DeleteFile,
  DeleteLimitStatus,
  ExecuteCommand,
  ExtractVideoDimentions,
  FindFile,
  FindMainFile,
  Log,
  PreapreVideoDimentionsCommand,
  PrepareConvertCommand,
  PrepareYtDlpCommand,
  SetChatIdToChannelId,
  SetLimitStatus,
  UploadVideo,
} from "./actions.js";
import { homeDir, storageDir } from "./config.js";
import { formatTime } from "./helpers.js";
import { shortcut } from "./shortcuts.js";
import { BotContext, TimeLimitContext, VideoMetaContext } from "./types.js";
import { isValidURL } from "./validators.js";

export const shortHandlerQueue: () => QueueAction[] = () => [
  Log,
  CalcTimeLeft,
  Log,
  SetLimitStatus,
  util.if<BotContext>(({ url }) => isValidURL(url), {
    then: [
      util.if<TimeLimitContext>(({ timeLimitLeft }) => timeLimitLeft === 0, {
        then: [
          shortcut.notify('Message received'),
          CleanUpUrl,
          ytdlp.sizes({
            then: [
              shortcut.extend({ title: true }),
              shortcut.extend({ destDir: storageDir }),
              PrepareYtDlpCommand,
              Log,
              shortcut.notify('Downloading full video to storage'),
              ExecuteCommand,
              FindMainFile,
              Log,
              util.if<VideoMetaContext>(({ videoMeta }) => Boolean(videoMeta.find(({ size, res }) => res >= 400 && res <= 500 && size < 50.0)), {
                then: [
                  shortcut.extend({ title: false }),
                  shortcut.extend({ destDir: homeDir }),
                  PrepareYtDlpCommand,
                  Log,
                  shortcut.notify('Downloading video for telegram'),
                  ExecuteCommand,
                  FindFile,
                  PrepareConvertCommand,
                  Log,
                  shortcut.notify('Start compressing video for telegram'),
                  ExecuteCommand,
                  DeleteFile,
                  FindFile,
                  Log,
                  PreapreVideoDimentionsCommand,
                  Log,
                  ExecuteCommand,
                  ExtractVideoDimentions,
                  Log,
                  util.if<BotContext>(({ channelId }) => Boolean(channelId), {
                    then: [
                      Log,
                      UploadVideo,
                      shortcut.notify('Video uploaded to the telegram'),
                    ],
                    else: [
                      DeleteLimitStatus,
                      SetChatIdToChannelId,
                      Log,
                      UploadVideo,
                    ],
                  }),
                  DeleteFile,
                ],
                else: [
                  shortcut.notify('Video is too big for telegram'),
                ],
              }),
            ],
            error: [
              shortcut.notify('No video to download'),
            ],
          }),
        ],
        else: [
          DeleteLimitStatus,
          shortcut.notify('Invalid URL'),
        ],
      }),
    ],
    else: [
      shortcut.notify<TimeLimitContext>(({ timeLimitLeft }) => `${formatTime(timeLimitLeft)} left until next post`)
    ],
  }),
];
