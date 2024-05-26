import { InjectLogger, InjectNotifications } from "@libs/actions";
import {
  AppendMdToFile,
  DetectTaskType,
  ExtractMetadata,
  FormatMetadataToMd,
  FormatTextToMd,
  FormatTextWithUrlToMd,
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
          FormatMetadataToMd,
        ],
      }),
      util.if<TaskTypeContext>(({ type }) => 'text-with-url' === type, {
        then: [
          FormatTextWithUrlToMd,
        ],
      }),
    ]
  }),
  util.if<TaskTypeContext>(({ type }) => 'text-only' === type, {
    then: [
      FormatTextToMd,
    ]
  }),
  AppendMdToFile,
];
