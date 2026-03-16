import { Bot, Context } from "grammy"
import axios from "axios"
import * as process from "process"

interface CreateSessionResponse {
  sessionId: string
}

interface PromptResponse {
  result: string
}

const token = process.env.TELEGRAM_BOT_TOKEN
if (!token) {
  throw new Error("TELEGRAM_BOT_TOKEN environment variable is required")
}

const bot = new Bot(token as string)
const agentUrl = process.env.AGENT_API_URL || "http://localhost:8888"

const userSessions = new Map<number, string>()

bot.on("message:text", async (ctx: Context) => {
  const userId = ctx.from?.id
  if (!userId || typeof userId !== "number") return

  const message = ctx.msg
  if (!message || !("text" in message) || !message.text) return
  const text = message.text

  let sessionId = userSessions.get(userId)

  if (!sessionId) {
    try {
      const response = await axios.post<CreateSessionResponse>(`${agentUrl}/api/sessions`)
      sessionId = response.data.sessionId
      if (!sessionId) return
      userSessions.set(userId, sessionId)
    } catch (err: unknown) {
      const errorMessage = err instanceof Error ? err.message : String(err)
      await ctx.reply(`Failed to create session: ${errorMessage}`)
      return
    }
  }

  try {
    const response = await axios.post<PromptResponse>(
      `${agentUrl}/api/sessions/${sessionId}/prompt`,
      { prompt: text }
    )
    await ctx.reply(response.data.result || "Done")
  } catch (err: unknown) {
    const errorMessage = err instanceof Error ? err.message : String(err)
    await ctx.reply(`Error: ${errorMessage}`)
  }
})

bot.start()

async function shutdown(signal: string) {
  console.log(`Received ${signal}, shutting down gracefully...`)
  bot.stop()
  process.exit(0)
}

process.on("SIGTERM", () => shutdown("SIGTERM"))
process.on("SIGINT", () => shutdown("SIGINT"))