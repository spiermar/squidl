import axios from "axios"

const DEFAULT_TIMEOUT = 60000

export interface SessionInfo {
  sessionId: string
  createdAt: string
}

export interface PromptResponse {
  events: any[]
  status: string
  result?: string
}

export class AgentHttpClient {
  private baseUrl: string
  private timeout: number

  constructor(baseUrl: string, timeout = DEFAULT_TIMEOUT) {
    this.baseUrl = baseUrl
    this.timeout = timeout
  }

  async createSession(): Promise<SessionInfo> {
    try {
      const response = await axios.post(`${this.baseUrl}/api/sessions`, {}, { timeout: this.timeout })
      return response.data
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err)
      throw new Error(`Failed to create session: ${message}`)
    }
  }

  async sendPrompt(sessionId: string, prompt: string): Promise<PromptResponse> {
    try {
      const response = await axios.post(
        `${this.baseUrl}/api/sessions/${sessionId}/prompt`,
        { prompt },
        { timeout: this.timeout }
      )
      return response.data
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err)
      throw new Error(`Failed to send prompt: ${message}`)
    }
  }

  async deleteSession(sessionId: string): Promise<void> {
    try {
      await axios.delete(`${this.baseUrl}/api/sessions/${sessionId}`)
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err)
      throw new Error(`Failed to delete session: ${message}`)
    }
  }

  async getSession(sessionId: string): Promise<SessionInfo | null> {
    try {
      const response = await axios.get(`${this.baseUrl}/api/sessions/${sessionId}`)
      return response.data
    } catch (err: unknown) {
      if (err instanceof Error && "response" in err && typeof err.response === "object" && err.response !== null && "status" in err.response && err.response.status === 404) {
        return null
      }
      const message = err instanceof Error ? err.message : String(err)
      throw new Error(`Failed to get session: ${message}`)
    }
  }
}