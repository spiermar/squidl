import { Bot, Context } from 'grammy'
import express, { Request, Response } from 'express'
import * as process from 'process'
import { AgentHttpClient } from './http-client.js'
import { SessionStore } from './session-store.js'

const webhookUrl = process.env.WEBHOOK_URL
const webhookSecret = process.env.WEBHOOK_SECRET

const token = process.env.TELEGRAM_BOT_TOKEN
if (!token) {
  throw new Error('TELEGRAM_BOT_TOKEN environment variable is required')
}

const bot = new Bot(token as string)
const agentUrl = process.env.AGENT_API_URL || 'http://localhost:8888'
const agentClient = new AgentHttpClient(agentUrl)
const sessionStore = new SessionStore()

sessionStore.startCleanup(agentClient)

bot.on('message:text', async (ctx: Context) => {
  const userId = ctx.from?.id
  if (!userId || typeof userId !== 'number') return

  const message = ctx.msg
  if (!message || !('text' in message) || !message.text) return
  const text = message.text

  let sessionId: string
  try {
    sessionId = await sessionStore.getOrCreate(userId, async () => {
      const session = await agentClient.createSession()
      return session.sessionId
    })
  } catch (err: unknown) {
    const errorMessage = err instanceof Error ? err.message : String(err)
    await ctx.reply(`Failed to create session: ${errorMessage}`)
    return
  }

  try {
    const response = await agentClient.sendPrompt(sessionId, text)
    await ctx.reply(response.result || 'Done')
  } catch (err: unknown) {
    const errorMessage = err instanceof Error ? err.message : String(err)
    await ctx.reply(`Error: ${errorMessage}`)
  }
})

if (webhookUrl) {
  const webhookPath = webhookUrl + '/webhook'
  await bot.api.setWebhook(webhookPath)

  const app = express()
  app.use(express.json())

  app.post('/webhook', async (req: Request, res: Response) => {
    try {
      if (webhookSecret) {
        const secretToken = req.headers['x-telegram-bot-api-secret-token']
        if (secretToken !== webhookSecret) {
          res.status(401).send('Unauthorized')
          return
        }
      }
      await bot.handleUpdate(req.body)
      res.send('OK')
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err)
      console.error('Webhook error:', message)
      res.status(500).send('Error')
    }
  })

  app.listen(3000, () => {
    console.log(`Webhook server listening on port 3000`)
  })
} else {
  bot.start()
}

async function shutdown(signal: string) {
  console.log(`Received ${signal}, shutting down gracefully...`)
  sessionStore.stopCleanup()
  bot.stop()
  process.exit(0)
}

process.on('SIGTERM', () => shutdown('SIGTERM'))
process.on('SIGINT', () => shutdown('SIGINT'))