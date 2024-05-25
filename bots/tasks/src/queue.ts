import { InjectLogger, InjectNotifications } from "@libs/actions";
import { ExtractMetadata, GetPageHtml } from "./actions";

export const addMetaTask = () => [
  InjectLogger,
  InjectNotifications,
  GetPageHtml,
  ExtractMetadata,
  /*
  CheckFileExists,
  ContainURL, {
    true: [
      notification.tlog('Extracting metadata'),
      ScrapeMicrodata,
      FormatMetadataToMd,
    ],
    false: [
      FormatTextToMd,
    ],
  },
  WriteMdToFile,
  notification.tlog('Task added'),
  */
];
