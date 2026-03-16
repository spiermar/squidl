import express, { Request, Response } from "express"
import type { Server } from "http"

const app = express()
app.use(express.json())

const sessions = new Map<string, { dispose: () => void; createdAt: Date }>()

app.post("/api/sessions", (req: Request, res: Response) => {
  const sessionId = Math.random().toString(36).slice(2, 11)
  sessions.set(sessionId, { dispose: () => {}, createdAt: new Date() })
  res.json({ sessionId, createdAt: new Date().toISOString() })
})

app.post("/api/sessions/:id/prompt", async (req: Request, res: Response) => {
  try {
    const id = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id
    const { prompt } = req.body

    if (!prompt) {
      return res.status(400).json({ error: "Missing prompt in request body" })
    }

    const session = sessions.get(id)
    if (!session) {
      return res.status(404).json({ error: "Session not found" })
    }

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
  const session = sessions.get(id)
  if (session) {
    session.dispose()
    sessions.delete(id)
  }
  res.json({ success: true })
})

export function startHttpServer(port: number): Server {
  return app.listen(port, () => {
    console.log(`HTTP API server listening on port ${port}`)
  })
}