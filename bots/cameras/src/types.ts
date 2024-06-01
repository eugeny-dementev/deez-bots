import { Telegraf } from "telegraf"

export type BotContext = {
  userId: number
  chatId: number
  url: string
  bot: Telegraf
}

export type FileContext = {
  filePath: string,
}
