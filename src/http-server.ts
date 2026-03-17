import express, { Request, Response } from "express"
import { SessionManager } from "@mariozechner/pi-coding-agent"
import { createSession } from "./agent.js"

const app = express()
app.use(express.json())

const sessions = new Map<string, { session: any; createdAt: Date }>()

app.post("/api/sessions", async (req: Request, res: Response) => {
  try {
    const sessionId = Math.random().toString(36).slice(2, 11)
    const sessionManager = SessionManager.create(process.cwd())
    const session = await createSession(sessionManager)
    
    sessions.set(sessionId, { session, createdAt: new Date() })
    res.json({ sessionId, createdAt: new Date().toISOString() })
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err)
    res.status(500).json({ error: message })
  }
})

app.post("/api/sessions/:id/prompt", async (req: Request, res: Response) => {
  try {
    const id = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id
    const { prompt } = req.body

    if (!prompt) {
      return res.status(400).json({ error: "Missing prompt in request body" })
    }

    const sessionData = sessions.get(id)
    if (!sessionData) {
      return res.status(404).json({ error: "Session not found" })
    }

    await sessionData.session.prompt(prompt)
    res.json({ status: "completed", events: [] })
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err)
    res.status(500).json({ error: message })
  }
})

app.get("/api/sessions/:id", (req: Request, res: Response) => {
  const id = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id
  const session = sessions.get(id)
  if (!session) {
    return res.status(404).json({ error: "Session not found" })
  }
  res.json({ sessionId: id, createdAt: session.createdAt })
})

app.delete("/api/sessions/:id", (req: Request, res: Response) => {
  const id = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id
  const sessionData = sessions.get(id)
  if (sessionData) {
    sessionData.session.dispose()
    sessions.delete(id)
  }
  res.json({ success: true })
})

export function startHttpServer(port: number): void {
  app.listen(port, () => {
    console.log(`HTTP API server listening on port ${port}`)
  })
}