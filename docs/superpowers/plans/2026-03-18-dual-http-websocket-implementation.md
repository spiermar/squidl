# Dual HTTP and WebSocket Runtime Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Start HTTP and WebSocket servers on every launch in one process, fail fast on startup errors, and preserve separate session state for each protocol.

**Architecture:** Keep existing protocol handlers (`src/http-server.ts`, `src/websocket-server.ts`) and replace mode switching in `src/agent.ts` with a single startup orchestrator. Startup runs both listeners concurrently and performs partial-start cleanup if either listener fails. Shutdown remains graceful through one signal path that stops both listeners.

**Tech Stack:** TypeScript, Node.js runtime, Express, ws, Vitest (new), native child process APIs

---

## File Structure Map

- Modify: `package.json`
  - Add a `test` script and Vitest dev dependency
- Modify: `src/http-server.ts`
  - Change startup API to resolve on `listening`, reject on startup `error`, and return `http.Server`
- Modify: `src/websocket-server.ts`
  - Make `start()` reject on startup failure so dual startup can fail fast
- Modify: `src/agent.ts`
  - Always start both listeners in parallel; remove mode-gated startup behavior
  - Add coordinated startup failure cleanup and signal shutdown for both listeners
- Create: `tests/integration/dual-runtime.test.ts`
  - Process-level integration tests for startup, fail-fast behavior, and signal shutdown
- Modify: `README.md`
  - Document always-on dual-listener behavior and remove mode-specific guidance

### Task 1: Add Test Harness for Runtime Integration Checks

**Files:**
- Modify: `package.json`
- Create: `tests/integration/dual-runtime.test.ts`

- [ ] **Step 1: Add minimal test tooling config**

```json
{
  "scripts": {
    "test": "vitest run"
  },
  "devDependencies": {
    "vitest": "^2.1.8"
  }
}
```

- [ ] **Step 2: Install dependencies**

Run: `npm install`
Expected: PASS and `package-lock.json` updated with Vitest packages

- [ ] **Step 3: Add failing integration test skeleton**

```ts
import { describe, it, expect } from 'vitest'

describe('dual runtime startup', () => {
  it('starts both listeners', async () => {
    expect(false).toBe(true)
  })
})
```

- [ ] **Step 4: Run tests to verify behavior-driven failure**

Run: `npm test`
Expected: FAIL with assertion error from `starts both listeners`

- [ ] **Step 5: Commit harness setup**

```bash
git add package.json package-lock.json tests/integration/dual-runtime.test.ts
git commit -m "test: add runtime integration test harness"
```

### Task 2: Specify Failing Runtime Behavior Tests (TDD)

**Files:**
- Modify: `tests/integration/dual-runtime.test.ts`

- [ ] **Step 1: Add failing test for always-on dual listeners**

```ts
it('starts HTTP and WebSocket on every launch', async () => {
  const proc = await startAgentProcess({ HTTP_PORT: '39100', WEBSOCKET_PORT: '39101' })
  await expect(waitForHttpReady(39100)).resolves.toBeUndefined()
  await expect(waitForWsReady(39101)).resolves.toBeUndefined()
  await stopProcess(proc)
})
```

- [ ] **Step 2: Add failing test for ignored mode flags**

```ts
it('ignores HTTP_MODE and WEBSOCKET_MODE flags', async () => {
  const proc = await startAgentProcess({
    HTTP_MODE: 'true',
    WEBSOCKET_MODE: '',
    HTTP_PORT: '39110',
    WEBSOCKET_PORT: '39111',
  })
  await expect(waitForHttpReady(39110)).resolves.toBeUndefined()
  await expect(waitForWsReady(39111)).resolves.toBeUndefined()
  await stopProcess(proc)
})
```

- [ ] **Step 3: Add failing test for one-port conflict fail-fast**

```ts
it('exits non-zero when one listener cannot bind', async () => {
  const blocker = await createBlockingHttpServer(39120)
  const proc = await startAgentProcess({ HTTP_PORT: '39120', WEBSOCKET_PORT: '39121' })
  const exitCode = await waitForExit(proc)
  expect(exitCode).not.toBe(0)
  await closeBlockingServer(blocker)
})
```

- [ ] **Step 4: Add failing test for signal shutdown of both listeners**

```ts
it('shuts down both listeners on SIGTERM', async () => {
  const proc = await startAgentProcess({ HTTP_PORT: '39130', WEBSOCKET_PORT: '39131' })
  await waitForHttpReady(39130)
  await waitForWsReady(39131)
  proc.kill('SIGTERM')
  await waitForExit(proc)
  await expect(waitForHttpRefused(39130)).resolves.toBeUndefined()
  await expect(waitForWsRefused(39131)).resolves.toBeUndefined()
})
```

- [ ] **Step 5: Add failing test for symmetric partial-start cleanup (HTTP blocked)**

```ts
it('cleans up WebSocket listener when HTTP bind fails', async () => {
  const blocker = await createBlockingHttpServer(39160)
  const proc = await startAgentProcess({ HTTP_PORT: '39160', WEBSOCKET_PORT: '39161' })

  await waitForExit(proc)
  await closeBlockingServer(blocker)

  await expect(waitForWsRefused(39161)).resolves.toBeUndefined()
})
```

- [ ] **Step 6: Add failing cross-protocol isolation check**

```ts
it('keeps HTTP and WebSocket session state isolated', async () => {
  const proc = await startAgentProcess({ HTTP_PORT: '39140', WEBSOCKET_PORT: '39141' })
  const httpSessionId = await createHttpSession(39140)
  const wsClient = await connectWs(39141)
  wsClient.send(JSON.stringify({ type: 'prompt', content: 'say hello' }))
  await expect(waitForWsEvent(wsClient, 'agent_end')).resolves.toBeTruthy()

  await deleteHttpSession(39140, httpSessionId)

  wsClient.send(JSON.stringify({ type: 'prompt', content: 'say hello again' }))
  await expect(waitForWsEvent(wsClient, 'agent_end')).resolves.toBeTruthy()
  await stopProcess(proc)
})
```

- [ ] **Step 7: Run tests and verify failures are for missing behavior**

Run: `npm test -- tests/integration/dual-runtime.test.ts`
Expected: FAIL due to startup behavior mismatches (before implementation)

- [ ] **Step 8: Commit failing behavior tests**

```bash
git add tests/integration/dual-runtime.test.ts
git commit -m "test: define dual runtime startup and shutdown expectations"
```

### Task 3: Implement HTTP Startup Contract for Fail-Fast Orchestration

**Files:**
- Modify: `src/http-server.ts`

- [ ] **Step 1: Update type imports and startup signature**

```ts
import { createServer, type Server } from 'node:http'

export async function startHttpServer(port: number): Promise<Server> {
```

- [ ] **Step 2: Implement startup Promise that resolves on `listening`**

```ts
return new Promise((resolve, reject) => {
  const server = createServer(app)
  const onStartupError = (err: Error) => reject(err)
  server.once('error', onStartupError)
  server.listen(port, () => {
    server.off('error', onStartupError)
    console.log(`HTTP API server listening on port ${port}`)
    resolve(server)
  })
})
```

- [ ] **Step 3: Ensure route logic and session storage remain unchanged**

Run: `npm run build`
Expected: PASS

- [ ] **Step 4: Commit HTTP startup contract change**

```bash
git add src/http-server.ts
git commit -m "refactor: make http startup awaitable and fail-fast"
```

### Task 4: Make WebSocket Startup Reject on Bind Errors

**Files:**
- Modify: `src/websocket-server.ts`

- [ ] **Step 1: Add Promise rejection path to `start()`**

```ts
async start(): Promise<void> {
  return new Promise((resolve, reject) => {
    this.wss = new WSServer({ port: this.port })
    const onStartupError = (err: Error) => reject(err)
    this.wss.once('listening', () => {
      this.wss?.off('error', onStartupError)
      resolve()
    })
    this.wss.once('error', onStartupError)
  })
}
```

- [ ] **Step 2: Keep runtime error logging after startup**

```ts
this.wss.on('error', (err: Error) => {
  console.error('Websocket server error:', err.message)
})
```

- [ ] **Step 3: Run targeted integration test to verify fail-fast wiring**

Run: `npm test -- tests/integration/dual-runtime.test.ts -t "cannot bind"`
Expected: PASS

- [ ] **Step 4: Commit WebSocket startup fix**

```bash
git add src/websocket-server.ts
git commit -m "fix: reject websocket startup on bind failure"
```

### Task 5: Replace Mode Split with Dual Startup Orchestrator

**Files:**
- Modify: `src/agent.ts`

- [ ] **Step 1: Write failing assertions in tests for partial-start cleanup**

```ts
it('cleans up already-started listener when peer startup fails', async () => {
  const blocker = await createBlockingWebSocketServer(39151)
  const proc = await startAgentProcess({ HTTP_PORT: '39150', WEBSOCKET_PORT: '39151' })
  await waitForExit(proc)
  await closeBlockingWsServer(blocker)

  await expect(waitForHttpRefused(39150)).resolves.toBeUndefined()
})
```

- [ ] **Step 2: Implement unified dual startup and fail-fast cleanup**

```ts
const websocketServer = new WebsocketServer(websocketPort)
let httpServer: Server | null = null

const httpStartup = startHttpServer(httpPort)
const wsStartup = websocketServer.start()

try {
  const [startedHttp] = await Promise.all([httpStartup, wsStartup])
  httpServer = startedHttp
} catch (err: unknown) {
  const httpResult = await Promise.allSettled([httpStartup])
  if (httpResult[0].status === 'fulfilled') {
    httpServer = httpResult[0].value
  }
  await Promise.allSettled([
    websocketServer.stop(),
    httpServer ? closeHttpServer(httpServer) : Promise.resolve(),
  ])
  process.exit(1)
}
```

- [ ] **Step 3: Add one cleanup path for `SIGINT` and `SIGTERM`**

```ts
const cleanup = async () => {
  await Promise.allSettled([
    websocketServer.stop(),
    httpServer ? closeHttpServer(httpServer) : Promise.resolve(),
  ])
  process.exit(0)
}
```

- [ ] **Step 4: Remove mode-branch startup behavior**

Run: `npm run build`
Expected: PASS; startup path no longer branches on mode flags

- [ ] **Step 5: Run full runtime integration suite**

Run: `npm test -- tests/integration/dual-runtime.test.ts`
Expected: PASS, including partial-start cleanup and isolation checks

- [ ] **Step 6: Commit orchestrator update**

```bash
git add src/agent.ts tests/integration/dual-runtime.test.ts
git commit -m "feat: start http and websocket listeners concurrently"
```

### Task 6: Update Runtime Documentation

**Files:**
- Modify: `README.md`

- [ ] **Step 1: Update behavior description and env table**

```md
A TypeScript-based PI Agent container providing an AI agent with file system tools. Runs HTTP and WebSocket servers concurrently.
```

```md
| `WEBSOCKET_PORT` | No | Port for WebSocket server (default: 8888) |
| `HTTP_PORT` | No | Port for HTTP server (default: 3000) |
```

- [ ] **Step 2: Replace mode-specific run sections with dual-listener run example**

```bash
docker run --rm \
  -e LLM_BASE_URL=http://host.docker.internal:11434/v1 \
  -e LLM_MODEL=llama3 \
  -e OPENAI_API_KEY=ollama \
  -p 3000:3000 -p 8888:8888 \
  -v $(pwd)/workspace:/app/workspace \
  pi-agent
```

- [ ] **Step 3: Verify doc accuracy against running app**

Run: `npm run build && npm run start`
Expected: startup logs show both HTTP and WebSocket listeners

- [ ] **Step 4: Commit documentation updates**

```bash
git add README.md
git commit -m "docs: document always-on dual server runtime"
```

### Task 7: Final Verification and Delivery Checkpoint

**Files:**
- Verify only (no required file edits)

- [ ] **Step 1: Run full verification suite**

Run: `npm run build && npm test`
Expected: PASS

- [ ] **Step 2: Validate acceptance criteria manually**

Run:
- `HTTP_PORT=39200 WEBSOCKET_PORT=39201 npm run start`
- probe `http://localhost:39200/api/sessions`
- connect to `ws://localhost:39201`

Expected:
- both listeners active
- independent sessions for HTTP and WebSocket

- [ ] **Step 3: Capture release-ready notes in PR/body**

```md
- always-on dual listener startup
- fail-fast on startup bind errors with partial-start cleanup
- signal-driven graceful shutdown for both listeners
- runtime integration tests covering startup and shutdown semantics
```

- [ ] **Step 4: Commit any final fixes if needed**

```bash
git add -A
git commit -m "chore: finalize dual runtime verification"
```
