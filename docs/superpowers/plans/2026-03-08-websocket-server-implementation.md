# Websocket Server Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add websocket server mode to PI Agent container, allowing multiple clients to connect and interact with isolated agent instances via JSON events.

**Architecture:** New `runWebsocketServer()` function using `ws` package. Each connection creates own Agent instance and subscribes to all events, forwarding them as JSON to client.

**Tech Stack:** Node.js, TypeScript, `ws` package, @mariozechner/pi-agent-core

---

### Task 1: Add ws dependency

**Files:**
- Modify: `package.json`

**Step 1: Add ws to dependencies**

Run: `npm install ws@^8.16.0`
Expected: Package installed

**Step 2: Add @types/ws to devDependencies**

Run: `npm install -D @types/ws@^8.5.0`
Expected: Types installed

**Step 3: Commit**

```bash
git add package.json package-lock.json
git commit -m "chore: add ws websocket dependency"
```

---

### Task 2: Create WebsocketServer class

**Files:**
- Create: `src/websocket-server.ts`

**Step 1: Write WebsocketServer class**

```typescript
import { WebSocket, WebSocketServer as WSServer } from "ws";
import type { Agent, AgentEvent } from "@mariozechner/pi-agent-core";
import { createAgent } from "./agent.js";

interface ClientMessage {
  type: "prompt" | "disconnect";
  content?: string;
}

export class WebsocketServer {
  private wss: WSServer | null = null;
  private port: number;

  constructor(port: number = 8080) {
    this.port = port;
  }

  async start(): Promise<void> {
    return new Promise((resolve) => {
      this.wss = new WSServer({ port: this.port });

      this.wss.on("listening", () => {
        console.log(`Websocket server listening on port ${this.port}`);
        resolve();
      });

      this.wss.on("connection", (ws: WebSocket) => {
        this.handleConnection(ws);
      });

      this.wss.on("error", (err: Error) => {
        console.error("Websocket server error:", err.message);
      });
    });
  }

  private async handleConnection(ws: WebSocket): Promise<void> {
    console.log("Client connected");

    const agent = await createAgent();
    const agentId = Math.random().toString(36).slice(2, 9);

    agent.subscribe((event: AgentEvent) => {
      this.sendEvent(ws, event);
    });

    ws.on("message", (data: Buffer) => {
      this.handleMessage(ws, data.toString(), agent);
    });

    ws.on("close", () => {
      console.log(`Client disconnected (agent ${agentId})`);
    });

    ws.on("error", (err: Error) => {
      console.error(`Websocket error for agent ${agentId}:`, err.message);
    });
  }

  private handleMessage(ws: WebSocket, data: string, agent: Agent): void {
    try {
      const message: ClientMessage = JSON.parse(data);

      if (message.type === "prompt" && message.content) {
        agent.prompt(message.content).catch((err: Error) => {
          this.sendError(ws, err.message);
        });
      } else if (message.type === "disconnect") {
        ws.close();
      }
    } catch (err: unknown) {
      const errorMessage = err instanceof Error ? err.message : String(err);
      this.sendError(ws, `Invalid message: ${errorMessage}`);
    }
  }

  private sendEvent(ws: WebSocket, event: AgentEvent): void {
    try {
      const message = JSON.stringify(event);
      ws.send(message);
    } catch (err: unknown) {
      const errorMessage = err instanceof Error ? err.message : String(err);
      console.error("Failed to send event:", errorMessage);
    }
  }

  private sendError(ws: WebSocket, message: string): void {
    try {
      ws.send(JSON.stringify({ type: "error", message }));
    } catch (err: unknown) {
      console.error("Failed to send error:", err);
    }
  }

  async stop(): Promise<void> {
    return new Promise((resolve) => {
      if (this.wss) {
        this.wss.close(() => {
          console.log("Websocket server stopped");
          resolve();
        });
      } else {
        resolve();
      }
    });
  }
}
```

**Step 2: Commit**

```bash
git add src/websocket-server.ts
git commit -m "feat: add WebsocketServer class"
```

---

### Task 3: Add WEBSOCKET_PORT and WEBSOCKET_MODE env vars

**Files:**
- Modify: `.env.example`
- Modify: `src/agent.ts`

**Step 1: Update .env.example**

Add to file:
```
WEBSOCKET_PORT=8080
WEBSOCKET_MODE=
```

**Step 2: Commit**

```bash
git add .env.example
git commit -m "chore: add WEBSOCKET_PORT and WEBSOCKET_MODE env vars"
```

---

### Task 4: Update main() to support websocket mode

**Files:**
- Modify: `src/agent.ts`

**Step 1: Add websocket import and main logic**

Add import at top:
```typescript
import { WebsocketServer } from "./websocket-server.js";
```

**Step 2: Add websocket run function**

Add after `runRepl`:
```typescript
async function runWebsocketServer(): Promise<void> {
  const port = parseInt(process.env.WEBSOCKET_PORT || "8080", 10);
  const server = new WebsocketServer(port);

  const cleanup = () => {
    server.stop().then(() => process.exit(0));
  };

  process.on("SIGINT", cleanup);
  process.on("SIGTERM", cleanup);

  await server.start();
}
```

**Step 3: Update main() function**

Replace main():
```typescript
async function main() {
  validateEnv();

  const prompt = process.env.AGENT_PROMPT;
  const websocketMode = process.env.WEBSOCKET_MODE;

  if (websocketMode) {
    await runWebsocketServer();
  } else if (prompt) {
    await runPrompt(prompt);
  } else {
    await runRepl();
  }
}
```

**Step 4: Commit**

```bash
git add src/agent.ts
git commit -m "feat: add websocket server mode"
```

---

### Task 5: Test websocket server

**Files:**
- Test: Manual testing with websocket client

**Step 1: Build the project**

Run: `npm run build`
Expected: Compiles without errors

**Step 2: Start server with test env**

Run in background:
```bash
WEBSOCKET_MODE=true LLM_BASE_URL=http://localhost:11434/v1 LLM_MODEL=llama3.1:8b npm run start
```

Expected: "Websocket server listening on port 8080"

**Step 3: Test with websocket client**

Create test client `test-websocket.js`:
```javascript
import WebSocket from "ws";

const ws = new WebSocket("ws://localhost:8080");

ws.on("open", () => {
  console.log("Connected, sending prompt...");
  ws.send(JSON.stringify({ type: "prompt", content: "What is 2+2?" }));
});

ws.on("message", (data) => {
  const event = JSON.parse(data.toString());
  console.log("Event:", event.type);
  if (event.type === "agent_end") {
    ws.close();
  }
});

ws.on("close", () => {
  console.log("Disconnected");
  process.exit(0);
});
```

Run: `node test-websocket.js`
Expected: Events stream to console

**Step 4: Commit**

```bash
git add .
git commit -m "test: verify websocket server works"
```

---

### Task 6: Verify all event types are forwarded

**Files:**
- Test: Check event coverage

**Step 1: Verify event types**

Check that WebsocketServer.handleConnection subscribes to all events from Agent. The `agent.subscribe()` callback receives all events by default. Confirm no filtering is applied.

**Step 2: Test tool execution events**

Send prompt that triggers tool: "List files in ."
Expected events:
- `agent_start`
- `turn_start`
- `message_start` (user)
- `message_end` (user)
- `message_start` (assistant)
- `message_update` (text delta)
- `message_end` (assistant with tool call)
- `tool_execution_start`
- `tool_execution_update` (if tool streams)
- `tool_execution_end`
- `turn_end`
- `agent_end`

**Step 3: Commit**

```bash
git add .
git commit -m "test: verify all agent events forwarded via websocket"
```

---

### Task 7: Update Dockerfile

**Files:**
- Modify: `Dockerfile`

**Step 1: Verify package-lock.json in .dockerignore**

Ensure ws is installed in container (already in package.json).

**Step 2: Commit**

```bash
git add Dockerfile
git commit -m "chore: update Dockerfile for websocket mode"
```

---

### Task 8: Clean up test file

**Files:**
- Delete: `test-websocket.js`

**Step 1: Remove test file**

Run: `rm test-websocket.js`

**Step 2: Commit**

```bash
git add .
git commit -m "chore: remove test file"
```

---

**Plan complete and saved to `docs/plans/2026-03-08-websocket-server-implementation.md`. Two execution options:**

**1. Subagent-Driven (this session)** - I dispatch fresh subagent per task, review between tasks, fast iteration

**2. Parallel Session (separate)** - Open new session with executing-plans, batch execution with checkpoints

**Which approach?**