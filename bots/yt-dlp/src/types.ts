import { Telegraf } from "telegraf"

export type Timestampt = ReturnType<typeof Date.now>;

export enum UserRole {
  admin = 1,
  publisher = 2,
  subscriber = 3,
}

export type UserLimitStatus = Record<string, Timestampt>
export type UserRoles = Record<number, UserRole>

export type BotContext = {
  limitsStatus: UserLimitStatus
  cookiesPath: string
  channelId: number
  userId: number
  chatId: number
  url: string
  bot: Telegraf
  role: UserRole
}

export type TimeLimitContext = {
  timeLimitLeft: number,
}

export type FContextMessage<C> = (context: C) => Promise<string> | string;

export type CommandContext = {
  command?: string,
  stdout: string,
}

export type LastFileContext = {
  lastFile: string,
}

export type VideoDimensions = { width: number, height: number };
export type VideoDimensionsContext = {
  width: number,
  height: number,
};

export type LinkType = 'reel' | 'short' | 'reddit'
export type LinkTypeContext = {
  type: LinkType,
};
