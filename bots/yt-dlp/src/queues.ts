import {
  InjectLogger,
  InjectNotifications,
  YtDlpDownload,
  YtDlpSizes,
  notifications,
} from "@libs/actions";
import { QueueAction, util } from "async-queue-runner";
import {
  ConvertVideo,
  DeleteFile,
  ExtractVideoDimensions,
  FindFile,
  PrepareYtDlpMaxRes,
  PrepareYtDlpMinRes,
  PrepareYtDlpName,
  SetChatIdToChannelId,
  UploadVideo
} from "./actions.js";
import { homeDir, storageDir, swapDir } from "./config.js";
import { shortcut } from "./shortcuts.js";
import { BotContext, VideoMetaContext } from "./types.js";
import { isValidURL } from "./validators.js";

export const shortHandlerQueue: () => QueueAction[] = () => [
  InjectLogger,
  InjectNotifications,
  notifications.tlog('Message received'),
  util.if<BotContext>(({ url }) => isValidURL(url), {
    then: [
      notifications.tlog('Valid URL detected'),
      YtDlpSizes,
      util.if<VideoMetaContext>(({ sizes }) => sizes.length > 0, {
        then: [
          notifications.tadd('Starting downloading video'),
          shortcut.extend({ ydhome: storageDir, ydtemp: swapDir }),
          PrepareYtDlpMaxRes,
          YtDlpDownload,
          SetChatIdToChannelId,
          util.if<BotContext>(({ channelId }) => Boolean(channelId), {
            then: [
              notifications.tadd('Prepareing video for uploading'),
              shortcut.extend({ ydhome: homeDir, ydtemp: swapDir }),
              PrepareYtDlpName,
              PrepareYtDlpMinRes,
              YtDlpDownload,
              FindFile,
              ConvertVideo,
              ExtractVideoDimensions,
              UploadVideo,
              DeleteFile,
            ],
          }),
        ],
        else: [],
      }),
    ],
    else: [
      notifications.tlog('No valid URL found in the message'),
    ],
  }),
];
