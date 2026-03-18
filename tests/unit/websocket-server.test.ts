import { createServer } from 'node:net'
import type { Server } from 'node:net'
import { afterEach, describe, expect, it, vi } from 'vitest'

vi.mock('../../src/agent.js', () => ({
  createAgent: vi.fn(async () => ({
    subscribe: () => () => {},
    dispose: () => {},
    prompt: vi.fn(async () => {}),
  })),
}))

const blockingServers = new Set<Server>()

afterEach(async () => {
  for (const server of blockingServers) {
    await closeServer(server)
  }
  blockingServers.clear()
})

describe('WebsocketServer start lifecycle', () => {
  it('clears internal server reference when startup bind fails', async () => {
    const { WebsocketServer } = await import('../../src/websocket-server.js')
    const port = await getFreePort()
    const blocker = await createBlockingServer(port)
    blockingServers.add(blocker)

    const server = new WebsocketServer(port)
    await expect(server.start()).rejects.toBeInstanceOf(Error)

    expect((server as unknown as { wss: unknown }).wss).toBeNull()
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
        resolve(address.port)
      })
    })
  })
}

async function createBlockingServer(port: number): Promise<Server> {
  return new Promise((resolve, reject) => {
    const server = createServer()
    server.once('error', reject)
    server.listen(port, '127.0.0.1', () => {
      resolve(server)
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
