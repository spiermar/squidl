import * as process from "process"
import type { AgentHttpClient } from "./http-client.js"

export interface UserSession {
  userId: number
  sessionId: string
  createdAt: Date
  lastActivity: Date
}

const SESSION_TIMEOUT = parseInt(process.env.SESSION_TIMEOUT || "1800000", 10)

export class SessionStore {
  private sessions = new Map<number, UserSession>()
  private cleanupInterval: ReturnType<typeof setInterval> | null = null

  async getOrCreate(userId: number, createFn: () => Promise<string>): Promise<string> {
    const existing = this.sessions.get(userId)
    if (existing) {
      existing.lastActivity = new Date()
      return existing.sessionId
    }
    const sessionId = await createFn()
    this.sessions.set(userId, {
      userId,
      sessionId,
      createdAt: new Date(),
      lastActivity: new Date(),
    })
    return sessionId
  }

  delete(userId: number): void {
    this.sessions.delete(userId)
  }

  startCleanup(agentClient: AgentHttpClient, intervalMs = 60000): void {
    this.cleanupInterval = setInterval(async () => {
      const now = new Date()
      for (const [userId, session] of this.sessions) {
        if (now.getTime() - session.lastActivity.getTime() > SESSION_TIMEOUT) {
          try {
            await agentClient.deleteSession(session.sessionId)
          } catch (err) {
            console.error(`Failed to delete session ${session.sessionId}:`, err)
          }
          this.sessions.delete(userId)
        }
      }
    }, intervalMs)
  }

  stopCleanup(): void {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval)
      this.cleanupInterval = null
    }
  }
}