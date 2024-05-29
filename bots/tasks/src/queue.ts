import { InjectLogger, InjectNotifications, notifications } from "@libs/actions";
import {
  AppendMdToFile,
  DetectTaskType,
  ExtractMetadata,
  FormatMetadata,
  FormatTextToMd,
  FormatTextWithUrl,
  GetPageHtml,
  TaskTypeContext,
} from "./actions";
import { util } from "async-queue-runner";

export const addMetaTask = () => [
  InjectLogger,
  InjectNotifications,
  notifications.tadd('Task received'),
  DetectTaskType,
  notifications.tlog<TaskTypeContext>(({ type }) => `Task type: ${type}`),
  util.if<TaskTypeContext>(({ type }) => ['url-only', 'text-with-url'].includes(type), {
    then: [
      notifications.tadd('Extracting URL metadata'),
      GetPageHtml,
      ExtractMetadata,
      notifications.tadd('Updating message with extracted metadata'),
      util.if<TaskTypeContext>(({ type }) => 'url-only' === type, {
        then: [
          FormatMetadata,
          notifications.tlog('Metadata replaced URL link'),
        ],
      }),
      util.if<TaskTypeContext>(({ type }) => 'text-with-url' === type, {
        then: [
          FormatTextWithUrl,
          notifications.tlog('Metadata injected to text message'),
        ],
      }),
    ]
  }),
  notifications.tadd('Appending text to Tasks.md file'),
  FormatTextToMd,
  AppendMdToFile,
  notifications.tlog('Tasks.md extended'),
];
