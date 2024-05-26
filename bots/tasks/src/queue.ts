import { InjectLogger, InjectNotifications } from "@libs/actions";
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
  DetectTaskType,
  util.if<TaskTypeContext>(({ type }) => ['url-only', 'text-with-url'].includes(type), {
    then: [
      GetPageHtml,
      ExtractMetadata,
      util.if<TaskTypeContext>(({ type }) => 'url-only' === type, {
        then: [
          FormatMetadata,
        ],
      }),
      util.if<TaskTypeContext>(({ type }) => 'text-with-url' === type, {
        then: [
          FormatTextWithUrl,
        ],
      }),
    ]
  }),
  FormatTextToMd,
  AppendMdToFile,
];
