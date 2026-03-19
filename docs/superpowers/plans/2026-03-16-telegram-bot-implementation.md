# Telegram Bot Integration Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Create a Telegram bot microservice that connects to the PI Agent via HTTP API, enabling users to interact with the agent through Telegram.

**Architecture:** HTTP API + Telegram Webhook approach - add HTTP endpoints to the agent for session management, create a separate Telegram service that uses webhooks (production) or polling (development), connect via docker-compose.

**Tech Stack:** TypeScript, Express.js (for HTTP API), Grammy (Telegram bot library), docker-compose

---

## Pre-requisites

1. Create new git worktree for implementation:
```bash
git worktree add -b telegram-bot ../pi-agent-telegram
cd ../pi-agent-telegram
```

---

## Phase 1: Add HTTP API to Agent

### Task 1: Install Express and add HTTP server

**Files:**
- Modify: `package.json` - add express and types
- Create: `src/http-server.ts` - HTTP API server

**Step 1: Update package.json dependencies**

```bash
cd /home/opencode/workspace/pi-agent-telegram
npm install express && npm install -D @types/express
```

**Step 2: Create HTTP server with session endpoints**

Create `src/http-server.ts`:

```typescript
import express, { Request, Response } from "express";
import { createSession, disposeSession } from "./session-manager.js";

const app = express();
app.use(express.json());

const sessions = new Map<string, { dispose: () => void; createdAt: Date }>();

app.post("/api/sessions", (req: Request, res: Response) => {
  const sessionId = Math.random().toString(36).slice(2, 11);
  // Session creation logic - will integrate with agent session
  sessions.set(sessionId, { dispose: () => {}, createdAt: new Date() });
  res.json({ sessionId, createdAt: new Date().toISOString() });
});

app.post("/api/sessions/:id/prompt", async (req: Request, res: Response) => {
  const { id } = req.params;
  const { prompt } = req.body;
  
  const session = sessions.get(id);
  if (!session) {
    return res.status(404).json({ error: "Session not found" });
  }
  
  // Send prompt to agent and collect events
  res.json({ status: "completed", events: [] });
});

app.get("/api/sessions/:id", (req: Request, res: Response) => {
  const session = sessions.get(req.params.id);
  if (!session) {
    return res.status(404).json({ error: "Session not found" });
  }
  res.json({ sessionId: req.params.id, createdAt: session.createdAt });
});

app.delete("/api/sessions/:id", (req: Request, res: Response) => {
  const session = sessions.get(req.params.id);
  if (session) {
    session.dispose();
    sessions.delete(req.params.id);
  }
  res.json({ success: true });
});

export function startHttpServer(port: number): void {
  app.listen(port, () => {
    console.log(`HTTP API server listening on port ${port}`);
  });
}
```

**Step 3: Integrate HTTP server with main agent**

Modify `src/agent.ts` to start HTTP server alongside WebSocket server.

**Step 4: Commit**

```bash
git add package.json src/http-server.ts src/agent.ts
git commit -m "feat: add HTTP API server for session management"
```

---

## Phase 2: Create Telegram Service

### Task 2: Set up Telegram service project

**Files:**
- Create: `telegram-service/package.json`
- Create: `telegram-service/tsconfig.json`
- Create: `telegram-service/src/index.ts`

**Step 1: Create telegram-service directory structure**

```bash
mkdir -p telegram-service/src
```

**Step 2: Create package.json**

```json
{
  "name": "telegram-service",
  "version": "1.0.0",
  "type": "module",
  "scripts": {
    "build": "tsc",
    "start": "node dist/index.js",
    "dev": "tsx src/index.ts"
  },
  "dependencies": {
    "grammy": "^1.21.0",
    "axios": "^1.6.0"
  },
  "devDependencies": {
    "@types/node": "^22.0.0",
    "tsx": "^4.20.0",
    "typescript": "^5.7.0"
  }
}
```

**Step 3: Create tsconfig.json**

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "bundler",
    "esModuleInterop": true,
    "strict": true,
    "outDir": "dist",
    "rootDir": "src"
  }
}
```

**Step 4: Create basic bot entry point**

Create `telegram-service/src/index.ts`:

```typescript
import { Bot } from "grammy";
import axios from "axios";

const bot = new Bot(process.env.TELEGRAM_BOT_TOKEN || "");
const agentUrl = process.env.AGENT_API_URL || "http://localhost:8888";

const userSessions = new Map<number, string>();

bot.on("message:text", async (ctx) => {
  const userId = ctx.from?.id;
  if (!userId) return;

  let sessionId = userSessions.get(userId);

  if (!sessionId) {
    const response = await axios.post(`${agentUrl}/api/sessions`);
    sessionId = response.data.sessionId;
    userSessions.set(userId, sessionId);
  }

  const response = await axios.post(
    `${agentUrl}/api/sessions/${sessionId}/prompt`,
    { prompt: ctx.message.text }
  );

  await ctx.reply(response.data.result || "Done");
});

bot.start();
```

**Step 5: Commit**

```bash
git add telegram-service/
git commit -m "feat: add Telegram bot service skeleton"
```

---

### Task 3: Add session management and HTTP client

**Files:**
- Create: `telegram-service/src/http-client.ts`
- Create: `telegram-service/src/session-store.ts`
- Modify: `telegram-service/src/index.ts`

**Step 1: Create HTTP client**

Create `telegram-service/src/http-client.ts`:

```typescript
import axios from "axios";

const DEFAULT_TIMEOUT = 60000;

export interface SessionInfo {
  sessionId: string;
  createdAt: string;
}

export interface PromptResponse {
  events: any[];
  status: string;
}

export class AgentHttpClient {
  private baseUrl: string;
  private timeout: number;

  constructor(baseUrl: string, timeout = DEFAULT_TIMEOUT) {
    this.baseUrl = baseUrl;
    this.timeout = timeout;
  }

  async createSession(): Promise<SessionInfo> {
    const response = await axios.post(`${this.baseUrl}/api/sessions`, {}, { timeout: this.timeout });
    return response.data;
  }

  async sendPrompt(sessionId: string, prompt: string): Promise<PromptResponse> {
    const response = await axios.post(
      `${this.baseUrl}/api/sessions/${sessionId}/prompt`,
      { prompt },
      { timeout: this.timeout }
    );
    return response.data;
  }

  async deleteSession(sessionId: string): Promise<void> {
    await axios.delete(`${this.baseUrl}/api/sessions/${sessionId}`);
  }

  async getSession(sessionId: string): Promise<SessionInfo | null> {
    try {
      const response = await axios.get(`${this.baseUrl}/api/sessions/${sessionId}`);
      return response.data;
    } catch (err: any) {
      if (err.response?.status === 404) return null;
      throw err;
    }
  }
}
```

**Step 2: Create session store**

Create `telegram-service/src/session-store.ts`:

```typescript
export interface UserSession {
  userId: number;
  sessionId: string;
  createdAt: Date;
  lastActivity: Date;
}

const SESSION_TIMEOUT = parseInt(process.env.SESSION_TIMEOUT || "1800000", 10);

export class SessionStore {
  private sessions = new Map<number, UserSession>();
  private cleanupInterval: NodeJS.Timeout | null = null;

  getOrCreate(userId: number, createFn: () => Promise<string>): string | null {
    const existing = this.sessions.get(userId);
    if (existing) {
      existing.lastActivity = new Date();
      return existing.sessionId;
    }
    return null;
  }

  set(userId: number, sessionId: string): void {
    this.sessions.set(userId, {
      userId,
      sessionId,
      createdAt: new Date(),
      lastActivity: new Date(),
    });
  }

  delete(userId: number): void {
    this.sessions.delete(userId);
  }

  startCleanup(agentClient: any, intervalMs = 60000): void {
    this.cleanupInterval = setInterval(async () => {
      const now = new Date();
      for (const [userId, session] of this.sessions) {
        if (now.getTime() - session.lastActivity.getTime() > SESSION_TIMEOUT) {
          try {
            await agentClient.deleteSession(session.sessionId);
          } catch (err) {
            console.error(`Failed to delete session ${session.sessionId}:`, err);
          }
          this.sessions.delete(userId);
        }
      }
    }, intervalMs);
  }

  stopCleanup(): void {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
      this.cleanupInterval = null;
    }
  }
}
```

**Step 3: Update main bot to use new modules**

Modify `telegram-service/src/index.ts` to integrate the HTTP client and session store.

**Step 4: Commit**

```bash
git add telegram-service/src/
git commit -m "feat: add HTTP client and session management to telegram service"
```

---

### Task 4: Add webhook support

**Files:**
- Modify: `telegram-service/src/index.ts`

**Step 1: Add webhook endpoint**

Update `index.ts` to support both webhook and polling modes:

```typescript
import express from "express";

const useWebhook = !!process.env.WEBHOOK_URL;

if (useWebhook) {
  await bot.api.setWebhook(process.env.WEBHOOK_URL + "/webhook");
  
  const webhookApp = express();
  webhookApp.use(express.json());
  
  webhookApp.post("/webhook", async (req, res) => {
    await bot.handleUpdate(req.body);
    res.send("OK");
  });
  
  webhookApp.listen(3000, () => {
    console.log("Webhook server listening on port 3000");
  });
} else {
  bot.start();
}
```

**Step 2: Commit**

```bash
git add telegram-service/src/index.ts
git commit -m "feat: add webhook support for production"
```

---

## Phase 3: Docker Compose Setup

### Task 5: Create docker-compose.yml

**Files:**
- Create: `docker-compose.yml`

**Step 1: Write docker-compose.yml**

```yaml
services:
  agent:
    build: .
    ports:
      - "8888:8888"
    environment:
      - LLM_BASE_URL=${LLM_BASE_URL}
      - LLM_MODEL=${LLM_MODEL}
      - OPENAI_API_KEY=${OPENAI_API_KEY}
    healthcheck:
      test: ["CMD", "curl", "-f", "http://localhost:8888/api/sessions"]
      interval: 30s
      timeout: 10s
      retries: 3

  telegram:
    build: ./telegram-service
    ports:
      - "3000:3000"
    depends_on:
      agent:
        condition: service_healthy
    environment:
      - TELEGRAM_BOT_TOKEN=${TELEGRAM_BOT_TOKEN}
      - AGENT_API_URL=http://agent:8888
      - WEBHOOK_URL=${WEBHOOK_URL}

  caddy:
    image: caddy:2
    ports:
      - "80:80"
      - "443:443"
    volumes:
      - ./Caddyfile:/etc/caddy/Caddyfile
    depends_on:
      - telegram
```

**Step 2: Create Telegram service Dockerfile**

Create `telegram-service/Dockerfile`:

```dockerfile
FROM node:20.11.0-slim

WORKDIR /app

COPY package*.json ./
RUN npm install

COPY tsconfig.json ./
COPY src ./src
RUN npm run build

FROM node:20.11.0-slim

WORKDIR /app

COPY package*.json ./
RUN npm install --omit=dev

COPY --from=0 /app/dist .

ENV NODE_ENV=production

CMD ["node", "index.js"]
```

**Step 3: Commit**

```bash
git add docker-compose.yml telegram-service/Dockerfile
git commit -m "feat: add docker-compose configuration"
```

---

### Task 6: Create Caddyfile for reverse proxy

**Files:**
- Create: `Caddyfile`

**Step 1: Write Caddyfile**

```
:80 {
    reverse_proxy /telegram/* localhost:3000
    reverse_proxy /* localhost:8888
}
```

**Step 2: Commit**

```bash
git add Caddyfile
git commit -m "feat: add Caddy reverse proxy config"
```

---

## Phase 4: Connect Agent HTTP API to Agent Sessions

### Task 7: Integrate HTTP API with actual agent sessions

**Files:**
- Modify: `src/http-server.ts`

**Step 1: Connect HTTP endpoints to real agent sessions**

The current HTTP server skeleton needs to integrate with the agent's SessionManager. Update to use the actual agent session:

```typescript
import { SessionManager } from "@mariozechner/pi-coding-agent";
import { createSession } from "./agent.js";

const sessions = new Map<string, { session: any; createdAt: Date }>();

app.post("/api/sessions", async (req: Request, res: Response) => {
  const sessionId = Math.random().toString(36).slice(2, 11);
  const sessionManager = SessionManager.create(process.cwd());
  const session = await createSession(sessionManager);
  
  sessions.set(sessionId, { session, createdAt: new Date() });
  res.json({ sessionId, createdAt: new Date().toISOString() });
});

app.post("/api/sessions/:id/prompt", async (req: Request, res: Response) => {
  const session = sessions.get(req.params.id);
  if (!session) {
    return res.status(404).json({ error: "Session not found" });
  }
  
  const { prompt } = req.body;
  await session.session.prompt(prompt);
  
  res.json({ status: "completed" });
});

app.delete("/api/sessions/:id", (req: Request, res: Response) => {
  const session = sessions.get(req.params.id);
  if (session) {
    session.session.dispose();
    sessions.delete(req.params.id);
  }
  res.json({ success: true });
});
```

**Step 2: Run tests**

```bash
npm run build
```

**Step 3: Commit**

```bash
git add src/http-server.ts
git commit -m "feat: integrate HTTP API with agent sessions"
```

---

## Phase 5: Testing

### Task 8: Test the integration

**Step 1: Test locally with polling mode**

```bash
# Set up .env file
TELEGRAM_BOT_TOKEN=your_bot_token
AGENT_API_URL=http://localhost:8888

# Run telegram service
cd telegram-service && npm run dev

# Run agent
cd .. && npm run dev
```

**Step 2: Test with actual Telegram bot**

Send a message to your bot and verify the response.

**Step 3: Test webhook mode (requires HTTPS)**

Use ngrok for local HTTPS:
```bash
ngrok http 3000
# Set WEBHOOK_URL to your ngrok URL
```

**Step 4: Commit**

```bash
git commit -m "test: verify telegram bot integration"
```

---

## Summary

This implementation plan creates:

1. **HTTP API in agent** (`src/http-server.ts`) - Session management endpoints
2. **Telegram service** (`telegram-service/`) - Bot with webhook/polling support
3. **Docker compose** - Orchestrates both services with Caddy reverse proxy
4. **Session store** - Per-user session management with auto-cleanup

The plan follows TDD where applicable, uses minimal implementation to pass tests, and commits frequently with descriptive messages.