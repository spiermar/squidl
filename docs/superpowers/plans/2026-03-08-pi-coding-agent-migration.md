# PI Coding Agent Migration Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Migrate from pi-agent-core to pi-coding-agent to add built-in file tools and session persistence

**Architecture:** Replace manual Agent + tools setup with createAgentSession + tool factories. Use SessionManager for file-based persistence. Keep existing REPL, single prompt, and WebSocket run modes.

**Tech Stack:** TypeScript, pi-coding-agent, pi-ai, ws (WebSocket)

---

### Task 1: Update package.json dependencies

**Files:**
- Modify: `package.json:11`

**Step 1: Update dependency**

Replace pi-agent-core with pi-coding-agent:

```json
  "dependencies": {
-   "@mariozechner/pi-agent-core": "^0.55.3",
+   "@mariozechner/pi-coding-agent": "^0.55.3",
    "@mariozechner/pi-ai": "^0.55.3",
    "ws": "^8.19.0"
  },
```

**Step 2: Install dependencies**

Run: `npm install`

**Step 3: Commit**

```bash
git add package.json package-lock.json
git commit -m "chore: replace pi-agent-core with pi-coding-agent"
```

---

### Task 2: Update src/agent.ts imports

**Files:**
- Modify: `src/agent.ts:1-8`

**Step 1: Replace imports**

Change:
```typescript
import { Agent } from "@mariozechner/pi-agent-core";
import { streamSimple, Type, Static } from "@mariozechner/pi-ai";
import * as fs from "fs";
import * as readline from "readline";
import { WebsocketServer } from "./websocket-server.js";
import type { AgentTool } from "@mariozechner/pi-agent-core";
import type { Model } from "@mariozechner/pi-ai";
import type { Context, AssistantMessage } from "@mariozechner/pi-ai";
```

To:
```typescript
import { createAgentSession, SessionManager, createCodingTools } from "@mariozechner/pi-coding-agent";
import { getModel, streamSimple, Type, Static } from "@mariozechner/pi-ai";
import * as fs from "fs";
import * as readline from "readline";
import * as path from "path";
import { WebsocketServer } from "./websocket-server.js";
import type { AgentTool } from "@mariozechner/pi-agent-core";
import type { Model } from "@mariozechner/pi-ai";
```

**Step 2: Commit**

```bash
git add src/agent.ts
git commit -m "refactor: update imports for pi-coding-agent"
```

---

### Task 3: Remove manual tool definitions

**Files:**
- Modify: `src/agent.ts` (lines 10-52)

**Step 1: Remove readFileTool and listFilesTool**

Delete these from the file:
```typescript
const readFileParams = Type.Object({
  path: Type.String({ description: "Path to the file" }),
});

type ReadFileParams = Static<typeof readFileParams>;

const readFileTool: AgentTool<typeof readFileParams> = {
  name: "read_file",
  label: "Read File",
  description: "Read the contents of a file",
  parameters: readFileParams,
  execute: async (_id, params: ReadFileParams) => {
    try {
      const content = fs.readFileSync(params.path, "utf-8");
      return { content: [{ type: "text", text: content }], details: {} };
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      return { content: [{ type: "text", text: `Error: ${message}` }], details: { error: message } };
    }
  },
};

const listFilesParams = Type.Object({
  path: Type.String({ description: "Directory path", default: "." }),
});

type ListFilesParams = Static<typeof listFilesParams>;

const listFilesTool: AgentTool<typeof listFilesParams> = {
  name: "list_files",
  label: "List Files",
  description: "List files in a directory",
  parameters: listFilesParams,
  execute: async (_id, params: ListFilesParams) => {
    try {
      const files = fs.readdirSync(params.path);
      return { content: [{ type: "text", text: files.join("\n") }], details: { count: files.length } };
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      return { content: [{ type: "text", text: `Error: ${message}` }], details: { error: message } };
    }
  },
};
```

**Step 2: Commit**

```bash
git add src/agent.ts
git commit -m "refactor: remove manual tool definitions"
```

---

### Task 4: Replace helper functions

**Files:**
- Modify: `src/agent.ts` (lines 54-100)

**Step 1: Replace validateEnv, createModel, createStreamFn, loadAgentInstructions**

Replace:
```typescript
function validateEnv(): void {
  const required = ["LLM_BASE_URL", "LLM_MODEL"];
  const missing = required.filter((key) => !process.env[key]?.trim());
  
  if (missing.length > 0) {
    console.error(`Error: Missing required environment variables: ${missing.join(", ")}`);
    process.exit(1);
  }
}

function createModel(): Model<"openai-completions"> {
  const baseUrl = process.env.LLM_BASE_URL!;
  const modelId = process.env.LLM_MODEL!;
  const api = process.env.LLM_API || "openai-completions";

  return {
    id: modelId,
    name: modelId,
    api: api as "openai-completions",
    provider: "custom",
    baseUrl,
    reasoning: true,
    input: ["text"],
    cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
    contextWindow: 202752,
    maxTokens: 8192,
  };
}

function createStreamFn() {
  const apiKey = process.env.LLM_API_KEY;
  
  return (model: any, context: any, options?: any) => {
    return streamSimple(model, context, {
      ...options,
      ...(apiKey && { apiKey }),
    });
  };
}

function loadAgentInstructions(): string {
  try {
    return fs.readFileSync("workspace/AGENTS.md", "utf-8");
  } catch {
    return "";
  }
}
```

With a simpler session setup function:
```typescript
function getSessionFile(): string {
  const sessionDir = path.join(process.cwd(), ".sessions");
  fs.mkdirSync(sessionDir, { recursive: true });
  return path.join(sessionDir, "agent.jsonl");
}

function loadAgentInstructions(): string {
  try {
    return fs.readFileSync("workspace/AGENTS.md", "utf-8");
  } catch {
    return "";
  }
}

function createModel(): ReturnType<typeof getModel> {
  const baseUrl = process.env.LLM_BASE_URL;
  const modelId = process.env.LLM_MODEL;
  const api = process.env.LLM_API;

  if (baseUrl && modelId) {
    return {
      id: modelId,
      name: modelId,
      api: (api || "openai-completions") as "openai-completions",
      provider: "custom",
      baseUrl,
      reasoning: true,
      input: ["text"],
      cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
      contextWindow: 202752,
      maxTokens: 8192,
    };
  }

  return getModel("anthropic", "claude-sonnet-4-20250514");
}
```

**Step 2: Commit**

```bash
git add src/agent.ts
git commit -m "refactor: simplify model creation for pi-coding-agent"
```

---

### Task 5: Rewrite createAgent function

**Files:**
- Modify: `src/agent.ts` (lines 102-138)

**Step 1: Replace createAgent with session creation**

Replace:
```typescript
export async function createAgent(): Promise<Agent> {
  const model = createModel();
  const streamFn = createStreamFn();
  const agentInstructions = loadAgentInstructions();
  const basePrompt = "You are a helpful assistant with access to file tools. Be concise.";
  const systemPrompt = agentInstructions ? `${basePrompt}\n\n${agentInstructions}` : basePrompt;
  
  const agent = new Agent({
    initialState: {
      systemPrompt,
      model,
      tools: [readFileTool, listFilesTool],
      thinkingLevel: "medium",
    },
    streamFn,
  });

  agent.subscribe((event) => {
    if (event.type === "agent_start") {
      console.log("\nAgent started");
    }
    if (event.type === "message_update" && event.assistantMessageEvent.type === "text_delta") {
      process.stdout.write(event.assistantMessageEvent.delta);
    }
    if (event.type === "tool_execution_start") {
      console.log(`\n[${event.toolName}] ${JSON.stringify(event.args)}`);
    }
    if (event.type === "tool_execution_end") {
      console.log(`Result: ${event.isError ? "ERROR" : "OK"}`);
    }
    if (event.type === "agent_end") {
      console.log("\nAgent finished");
    }
  });

  return agent;
}
```

With session creation:
```typescript
export async function createSession(sessionManager: any) {
  const model = createModel();
  const agentInstructions = loadAgentInstructions();
  const basePrompt = "You are a helpful assistant with access to file tools. Be concise.";
  const systemPrompt = agentInstructions ? `${basePrompt}\n\n${agentInstructions}` : basePrompt;

  const { session } = await createAgentSession({
    model,
    systemPrompt,
    thinkingLevel: "medium",
    sessionManager,
    tools: createCodingTools(process.cwd()),
  });

  const apiKey = process.env.LLM_API_KEY;
  session.agent.streamFn = (model: any, context: any, options?: any) => {
    return streamSimple(model, context, {
      ...options,
      ...(apiKey && { apiKey }),
    });
  };

  session.subscribe((event) => {
    if (event.type === "agent_start") {
      console.log("\nAgent started");
    }
    if (event.type === "message_update" && event.assistantMessageEvent.type === "text_delta") {
      process.stdout.write(event.assistantMessageEvent.delta);
    }
    if (event.type === "tool_execution_start") {
      console.log(`\n[${event.toolName}] ${JSON.stringify(event.args)}`);
    }
    if (event.type === "tool_execution_end") {
      console.log(`Result: ${event.isError ? "ERROR" : "OK"}`);
    }
    if (event.type === "agent_end") {
      console.log("\nAgent finished");
    }
  });

  return session;
}
```

**Step 2: Commit**

```bash
git add src/agent.ts
git commit -m "refactor: rewrite createAgent to createSession with pi-coding-agent"
```

---

### Task 6: Update runPrompt function

**Files:**
- Modify: `src/agent.ts` (lines 161-165)

**Step 1: Update runPrompt**

Replace:
```typescript
async function runPrompt(prompt: string): Promise<void> {
  const agent = await createAgent();
  await withRetry(() => agent.prompt(prompt));
  console.log();
}
```

With:
```typescript
async function runPrompt(prompt: string): Promise<void> {
  const sessionManager = SessionManager.create(process.cwd());
  const session = await createSession(sessionManager);
  await withRetry(() => session.prompt(prompt));
  console.log();
}
```

**Step 2: Commit**

```bash
git add src/agent.ts
git commit -m "refactor: update runPrompt for session-based model"
```

---

### Task 7: Update runRepl function

**Files:**
- Modify: `src/agent.ts` (lines 167-207)

**Step 1: Update runRepl**

Replace the REPL function to use session:
```typescript
async function runRepl(): Promise<void> {
  const sessionManager = SessionManager.continueRecent(process.cwd());
  const session = await createSession(sessionManager);
  
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  const cleanup = () => {
    session.dispose();
    rl.close();
  };

  process.on("SIGINT", cleanup);
  process.on("SIGTERM", cleanup);

  console.log("PI Agent REPL (type 'exit' to quit)\n");

  const ask = () => {
    rl.question("You: ", async (input) => {
      const trimmed = input.trim();
      if (trimmed === "exit") {
        cleanup();
        return;
      }
      if (!trimmed) {
        ask();
        return;
      }
      try {
        await withRetry(() => session.prompt(trimmed));
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : String(err);
        console.error(`Error: ${message}`);
      }
      console.log();
      ask();
    });
  };

  ask();
}
```

**Step 2: Commit**

```bash
git add src/agent.ts
git commit -m "refactor: update runRepl for session-based model"
```

---

### Task 8: Update main function

**Files:**
- Modify: `src/agent.ts` (lines 223-237)

**Step 1: Simplify main**

Replace:
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

With:
```typescript
async function main() {
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

**Step 2: Commit**

```bash
git add src/agent.ts
git commit -m "refactor: simplify main - remove validateEnv call"
```

---

### Task 9: Update WebSocketServer

**Files:**
- Modify: `src/websocket-server.ts`

**Step 1: Update WebSocketServer to use sessions**

The WebSocketServer needs to create a session per connection instead of an agent. Update to use `createSession` with a new session manager per connection.

```typescript
import { createSession, SessionManager } from "./agent.js";

export class WebsocketServer {
  // ... existing code

  async handleConnection(ws: WebSocket) {
    const sessionManager = SessionManager.create(process.cwd());
    const session = await createSession(sessionManager);
    
    // Handle messages and events
    // ... existing logic adapted for session.prompt()
  }
}
```

**Step 2: Test build**

Run: `npm run build`

**Step 3: Commit**

```bash
git add src/websocket-server.ts
git commit -m "refactor: update WebSocketServer for session-based model"
```

---

### Task 10: Verify and test

**Files:**
- Test: All run modes

**Step 1: Test single prompt mode**

```bash
AGENT_PROMPT="What files are in the current directory?" npm run dev
```

Expected: Agent responds with file listing using built-in tools

**Step 2: Test REPL mode**

```bash
npm run dev
# Type: What is 2+2?
# Expected: Agent responds
# Type: exit
```

**Step 3: Type check**

Run: `npx tsc --noEmit`

**Step 4: Final commit**

```bash
git add .
git commit -m "feat: migrate to pi-coding-agent with session persistence"
```