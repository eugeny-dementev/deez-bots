import { QueueAction, util } from "async-queue-runner";
import {
  CalcTimeLeft,
  CleanUpUrl,
  DeleteLastFile,
  DeleteLimitStatus,
  ExecuteCommand,
  ExtractVideoDimentions,
  FindLastFile,
  GetLinkType,
  Log,
  PreapreVideoDimentionsCommand,
  PrepareConvertCommand,
  PrepareYtDlpCommand,
  SetChatIdToChannelId,
  SetLimitStatus,
  UploadVideo,
} from "./actions.js";
import { formatTime } from "./helpers.js";
import { shortcut } from "./shortcuts.js";
import { BotContext, TimeLimitContext } from "./types.js";
import { isValidURL } from "./validators.js";

export const shortHandlerQueue: () => QueueAction[] = () => [
  Log,
  CalcTimeLeft,
  Log,
  SetLimitStatus,
  util.if<TimeLimitContext>(({ timeLimitLeft }) => timeLimitLeft === 0, {
    then: [
      shortcut.notify('Message received'),
      CleanUpUrl,
      util.if<BotContext>(({ url }) => isValidURL(url), {
        then: [
          GetLinkType,
          Log,
          PrepareYtDlpCommand,
          Log,
          ExecuteCommand,
          FindLastFile,
          Log,
          PrepareConvertCommand,
          Log,
          ExecuteCommand,
          DeleteLastFile,
          FindLastFile,
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
              shortcut.notify('Video uploaded to the channel'),
            ],
            else: [
              DeleteLimitStatus,
              SetChatIdToChannelId,
              Log,
              UploadVideo,
            ],
          }),
          DeleteLastFile,
        ],
        else: [
          DeleteLimitStatus,
          shortcut.notify('Invalid URL: only YouTube shorts and Reddit videos links'),
        ],
      }),
    ],
    else: [
      shortcut.notify<TimeLimitContext>(({ timeLimitLeft }) => `${formatTime(timeLimitLeft)} left until next post`)
    ],
  }),
];
