import { Bot } from "grammy"

export type BotContext = {
  userId: number
  chatId: number
  bot: Bot
}

export type FileContext = {
  filePath: string,
}
