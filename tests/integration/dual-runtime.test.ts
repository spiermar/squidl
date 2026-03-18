import { spawn } from 'node:child_process'
import type { ChildProcess } from 'node:child_process'
import { createServer, Socket } from 'node:net'
import type { AddressInfo, Server } from 'node:net'
import { setTimeout as delay } from 'node:timers/promises'
import WebSocket from 'ws'
import { afterEach, describe, expect, it } from 'vitest'

type RuntimeProcess = {
  child: ChildProcess
  stdout: () => string
  stderr: () => string
}

type ExitResult = {
  code: number | null
  signal: NodeJS.Signals | null
}

const WORKDIR = process.cwd()
const TEST_TIMEOUT = 30_000
const DEFAULT_WAIT_TIMEOUT = 10_000

const runtimeProcesses = new Set<RuntimeProcess>()
const blockingServers = new Set<Server>()
const websocketClients = new Set<WebSocket>()

afterEach(async () => {
  for (const ws of websocketClients) {
    await closeWebSocket(ws)
  }
  websocketClients.clear()

  for (const server of blockingServers) {
    await closeServer(server)
  }
  blockingServers.clear()

  for (const runtime of runtimeProcesses) {
    await stopRuntime(runtime, 'SIGTERM')
  }
  runtimeProcesses.clear()
})

describe('dual runtime startup and shutdown', () => {
  it(
    'starts HTTP and WebSocket listeners on every launch',
    async () => {
      const httpPort = await getFreePort()
      const websocketPort = await getFreePort()
      const runtime = spawnRuntime({ httpPort, websocketPort })

      await waitForPortOpen(httpPort)
      await waitForPortOpen(websocketPort)

      const httpStatus = await httpRequest('GET', httpPort, '/api/sessions/not-found')
      expect(httpStatus.status).toBe(404)

      const ws = await connectWebSocket(websocketPort)
      expect(ws.readyState).toBe(WebSocket.OPEN)
    },
    TEST_TIMEOUT
  )

  it(
    'ignores HTTP_MODE and WEBSOCKET_MODE flags',
    async () => {
      const envVariants = [
        { HTTP_MODE: 'true' },
        { WEBSOCKET_MODE: 'true' },
        { HTTP_MODE: 'true', WEBSOCKET_MODE: 'true' },
      ]

      for (const extraEnv of envVariants) {
        const httpPort = await getFreePort()
        const websocketPort = await getFreePort()
        const runtime = spawnRuntime({ httpPort, websocketPort, extraEnv })

        await waitForPortOpen(httpPort)
        await waitForPortOpen(websocketPort)

        const exitPromise = waitForExit(runtime)
        await stopRuntime(runtime, 'SIGTERM')
        await exitPromise
      }
    },
    TEST_TIMEOUT
  )

  it(
    'exits non-zero when one listener cannot bind',
    async () => {
      const httpPort = await getFreePort()
      const websocketPort = await getFreePort()
      const blocker = await createBlockingServer(websocketPort)
      blockingServers.add(blocker)

      const runtime = spawnRuntime({ httpPort, websocketPort })
      const result = await waitForExit(runtime)

      expect(result.code).not.toBe(0)
      expect(result.signal).toBeNull()
    },
    TEST_TIMEOUT
  )

  it(
    'shuts down both listeners on SIGTERM',
    async () => {
      const httpPort = await getFreePort()
      const websocketPort = await getFreePort()
      const runtime = spawnRuntime({ httpPort, websocketPort })

      await waitForPortOpen(httpPort)
      await waitForPortOpen(websocketPort)

      const result = await stopRuntime(runtime, 'SIGTERM')

      expect(result.code).toBe(0)
      await waitForPortClosed(httpPort)
      await waitForPortClosed(websocketPort)
    },
    TEST_TIMEOUT
  )

  it(
    'cleans up WebSocket listener when HTTP bind fails',
    async () => {
      const httpPort = await getFreePort()
      const websocketPort = await getFreePort()
      const blocker = await createBlockingServer(httpPort)
      blockingServers.add(blocker)

      const runtime = spawnRuntime({ httpPort, websocketPort })
      const websocketStarted = await waitForPortOpenWhileProcessAlive(runtime, websocketPort, 6_000)
      const result = await waitForExit(runtime)

      expect(websocketStarted).toBe(true)
      expect(result.code).not.toBe(0)
      await waitForPortClosed(websocketPort)
    },
    TEST_TIMEOUT
  )

  it(
    'keeps HTTP and WebSocket session state isolated',
    async () => {
      const httpPort = await getFreePort()
      const websocketPort = await getFreePort()
      const runtime = spawnRuntime({ httpPort, websocketPort })

      await waitForPortOpen(httpPort)
      await waitForPortOpen(websocketPort)

      const createSessionResponse = await httpRequest('POST', httpPort, '/api/sessions', {})
      expect(createSessionResponse.status).toBe(200)
      const firstSessionId = String((createSessionResponse.body as { sessionId: string }).sessionId)
      expect(firstSessionId.length).toBeGreaterThan(0)

      const firstSessionBeforeWebSocket = await httpRequest('GET', httpPort, `/api/sessions/${firstSessionId}`)
      expect(firstSessionBeforeWebSocket.status).toBe(200)

      const ws = await connectWebSocket(websocketPort)
      ws.close()
      await waitForWebSocketClose(ws)

      const firstSessionAfterWebSocket = await httpRequest('GET', httpPort, `/api/sessions/${firstSessionId}`)
      expect(firstSessionAfterWebSocket.status).toBe(200)

      const secondSessionResponse = await httpRequest('POST', httpPort, '/api/sessions', {})
      expect(secondSessionResponse.status).toBe(200)
      const secondSessionId = String((secondSessionResponse.body as { sessionId: string }).sessionId)
      expect(secondSessionId.length).toBeGreaterThan(0)
      expect(secondSessionId).not.toBe(firstSessionId)

      const secondSessionAfterWebSocket = await httpRequest('GET', httpPort, `/api/sessions/${secondSessionId}`)
      expect(secondSessionAfterWebSocket.status).toBe(200)

      const deleteFirstSessionResponse = await httpRequest('DELETE', httpPort, `/api/sessions/${firstSessionId}`)
      expect(deleteFirstSessionResponse.status).toBe(200)
      expect((deleteFirstSessionResponse.body as { success: boolean }).success).toBe(true)

      const deletedFirstSessionResponse = await httpRequest('GET', httpPort, `/api/sessions/${firstSessionId}`)
      expect(deletedFirstSessionResponse.status).toBe(404)

      const secondSessionStillPresent = await httpRequest('GET', httpPort, `/api/sessions/${secondSessionId}`)
      expect(secondSessionStillPresent.status).toBe(200)

      const deleteSecondSessionResponse = await httpRequest('DELETE', httpPort, `/api/sessions/${secondSessionId}`)
      expect(deleteSecondSessionResponse.status).toBe(200)
      expect((deleteSecondSessionResponse.body as { success: boolean }).success).toBe(true)

      const deletedSecondSessionResponse = await httpRequest('GET', httpPort, `/api/sessions/${secondSessionId}`)
      expect(deletedSecondSessionResponse.status).toBe(404)
    },
    TEST_TIMEOUT
  )
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

function spawnRuntime({
  httpPort,
  websocketPort,
  extraEnv = {},
}: {
  httpPort: number
  websocketPort: number
  extraEnv?: NodeJS.ProcessEnv
}): RuntimeProcess {
  let stdout = ''
  let stderr = ''

  const child = spawn(process.execPath, ['--import', 'tsx', 'src/agent.ts'], {
    cwd: WORKDIR,
    env: {
      ...process.env,
      LLM_BASE_URL: process.env.LLM_BASE_URL ?? 'http://127.0.0.1:1/v1',
      LLM_MODEL: process.env.LLM_MODEL ?? 'test-model',
      LLM_API: process.env.LLM_API ?? 'openai-completions',
      HTTP_PORT: String(httpPort),
      WEBSOCKET_PORT: String(websocketPort),
      ...extraEnv,
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  })

  child.stdout.on('data', (chunk: Buffer) => {
    stdout += chunk.toString()
  })

  child.stderr.on('data', (chunk: Buffer) => {
    stderr += chunk.toString()
  })

  const runtime = {
    child,
    stdout: () => stdout,
    stderr: () => stderr,
  }

  runtimeProcesses.add(runtime)
  return runtime
}

async function stopRuntime(runtime: RuntimeProcess, signal: NodeJS.Signals): Promise<ExitResult> {
  if (runtime.child.exitCode !== null || runtime.child.signalCode !== null) {
    return {
      code: runtime.child.exitCode,
      signal: runtime.child.signalCode,
    }
  }

  runtime.child.kill(signal)
  try {
    return await waitForExit(runtime)
  } catch {
    runtime.child.kill('SIGKILL')
    return await waitForExit(runtime)
  }
}

async function waitForExit(runtime: RuntimeProcess, timeoutMs = DEFAULT_WAIT_TIMEOUT): Promise<ExitResult> {
  if (runtime.child.exitCode !== null || runtime.child.signalCode !== null) {
    return {
      code: runtime.child.exitCode,
      signal: runtime.child.signalCode,
    }
  }

  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      reject(new Error(`Process did not exit within ${timeoutMs}ms\nSTDOUT:\n${runtime.stdout()}\nSTDERR:\n${runtime.stderr()}`))
    }, timeoutMs)

    runtime.child.once('exit', (code, signal) => {
      clearTimeout(timeout)
      resolve({
        code,
        signal,
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

async function httpRequest(
  method: string,
  port: number,
  path: string,
  body?: unknown
): Promise<{ status: number; body: unknown }> {
  const response = await fetch(`http://127.0.0.1:${port}${path}`, {
    method,
    headers: body !== undefined ? { 'content-type': 'application/json' } : undefined,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  })

  const text = await response.text()
  const parsed = text.length > 0 ? JSON.parse(text) : null
  return {
    status: response.status,
    body: parsed,
  }
}

async function connectWebSocket(port: number): Promise<WebSocket> {
  const ws = new WebSocket(`ws://127.0.0.1:${port}`)
  websocketClients.add(ws)

  await new Promise<void>((resolve, reject) => {
    const timeout = setTimeout(() => {
      reject(new Error(`WebSocket did not connect on port ${port}`))
    }, DEFAULT_WAIT_TIMEOUT)

    ws.once('open', () => {
      clearTimeout(timeout)
      resolve()
    })

    ws.once('error', (err) => {
      clearTimeout(timeout)
      reject(err)
    })
  })

  return ws
}

async function waitForWebSocketClose(ws: WebSocket, timeoutMs = DEFAULT_WAIT_TIMEOUT): Promise<void> {
  if (ws.readyState === WebSocket.CLOSED) {
    return
  }

  await new Promise<void>((resolve, reject) => {
    const timeout = setTimeout(() => {
      reject(new Error(`WebSocket did not close within ${timeoutMs}ms`))
    }, timeoutMs)

    ws.once('close', () => {
      clearTimeout(timeout)
      resolve()
    })

    ws.once('error', (err) => {
      clearTimeout(timeout)
      reject(err)
    })
  })
}

async function closeWebSocket(ws: WebSocket): Promise<void> {
  if (ws.readyState === WebSocket.CLOSED || ws.readyState === WebSocket.CLOSING) {
    return
  }

  ws.close()
  try {
    await waitForWebSocketClose(ws, 2_000)
  } catch {
    ws.terminate()
  }
}

async function waitForPortOpen(port: number, timeoutMs = DEFAULT_WAIT_TIMEOUT): Promise<void> {
  await waitForPortState(port, true, timeoutMs)
}

async function waitForPortClosed(port: number, timeoutMs = DEFAULT_WAIT_TIMEOUT): Promise<void> {
  await waitForPortState(port, false, timeoutMs)
}

async function waitForPortState(port: number, shouldBeOpen: boolean, timeoutMs: number): Promise<void> {
  const startedAt = Date.now()

  while (Date.now() - startedAt < timeoutMs) {
    const open = await canConnect(port)
    if (open === shouldBeOpen) {
      return
    }
    await delay(100)
  }

  const expectation = shouldBeOpen ? 'open' : 'closed'
  throw new Error(`Timed out waiting for port ${port} to become ${expectation}`)
}

async function waitForPortOpenWhileProcessAlive(
  runtime: RuntimeProcess,
  port: number,
  timeoutMs: number
): Promise<boolean> {
  const startedAt = Date.now()

  while (Date.now() - startedAt < timeoutMs) {
    const open = await canConnect(port)
    if (open) {
      return true
    }

    if (runtime.child.exitCode !== null || runtime.child.signalCode !== null) {
      return false
    }

    await delay(100)
  }

  return false
}

async function canConnect(port: number): Promise<boolean> {
  return new Promise((resolve) => {
    const socket = new Socket()

    socket.setTimeout(300)

    socket.once('connect', () => {
      socket.destroy()
      resolve(true)
    })

    socket.once('timeout', () => {
      socket.destroy()
      resolve(false)
    })

    socket.once('error', () => {
      socket.destroy()
      resolve(false)
    })

    socket.connect(port, '127.0.0.1')
  })
}
