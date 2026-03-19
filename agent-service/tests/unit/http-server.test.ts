import { afterEach, describe, expect, it, vi } from 'vitest'
import type { AddressInfo } from 'node:net'
import { createServer } from 'node:http'
import type { Server } from 'node:http'

const mockPrompt = vi.fn()
const mockSubscribe = vi.fn()

vi.mock('../../src/agent.js', () => ({
  createAgent: vi.fn(async () => ({
    subscribe: mockSubscribe,
    dispose: () => {},
    prompt: mockPrompt,
  })),
}))

const blockingServers = new Set<Server>()

afterEach(async () => {
  mockPrompt.mockReset()
  mockSubscribe.mockReset()
  for (const server of blockingServers) {
    await closeServer(server)
  }
  blockingServers.clear()
})

describe('HTTP API prompt endpoint', () => {
  it('returns result field with assistant text', async () => {
    const { startHttpServer } = await import('../../src/http-server.js')
    
    const port = await getFreePort()
    const server = await startHttpServer(port)
    
    const createResponse = await fetch(`http://127.0.0.1:${port}/api/sessions`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({}),
    })
    
    expect(createResponse.status).toBe(200)
    const createBody = await createResponse.json() as { sessionId: string }
    expect(createBody.sessionId).toBeDefined()
    
    mockSubscribe.mockImplementation((callback: (event: any) => void) => {
      callback({
        type: 'message_update',
        assistantMessageEvent: { type: 'text_delta', delta: 'Hello back!' }
      })
      return () => {}
    })
    mockPrompt.mockImplementation(async () => {})
    
    const promptResponse = await fetch(`http://127.0.0.1:${port}/api/sessions/${createBody.sessionId}/prompt`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ prompt: 'Hello' }),
    })
    
    expect(promptResponse.status).toBe(200)
    const promptBody = await promptResponse.json() as { status: string; result?: string }
    expect(promptBody.status).toBe('completed')
    expect(promptBody.result).toBe('Hello back!')
    
    await new Promise<void>((resolve) => {
      server.close(() => resolve())
    })
  })
})

async function getFreePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const server = createServer()
    server.once('error', reject)
    server.listen(0, '127.0.0.1', () => {
      const address = server.address()
      if (!address || typeof address === 'string') {
        server.close(() => reject(new Error('Failed to resolve an ephemeral port')))
        return
      }
      
      server.close((err) => {
        if (err) {
          reject(err)
          return
        }
        resolve((address as AddressInfo).port)
      })
    })
  })
}

async function closeServer(server: Server): Promise<void> {
  await new Promise<void>((resolve) => {
    if (!server.listening) {
      resolve()
      return
    }
    server.close(() => resolve())
  })
}
