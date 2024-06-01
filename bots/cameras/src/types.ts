import { Telegraf } from "telegraf"

export type BotContext = {
  userId: number
  chatId: number
  bot: Telegraf
}

export type FileContext = {
  filePath: string,
}
