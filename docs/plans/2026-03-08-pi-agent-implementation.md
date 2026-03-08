# PI Agent Container Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Create a Docker container that runs a pi-agent with file tools, configurable LLM endpoint via environment variables, supporting both single-prompt and REPL modes.

**Architecture:** Build a Node.js/TypeScript project using @mariozechner/pi-ai and @mariozechner/pi-agent-core packages. The agent reads configuration from environment variables and implements read_file and list_files tools. Support both interactive REPL mode and single-prompt execution.

**Tech Stack:** Node.js 20+, TypeScript, @mariozechner/pi-ai, @mariozechner/pi-agent-core, Docker

---

### Task 1: Initialize Node.js project

**Files:**
- Create: `package.json`
- Create: `tsconfig.json`
- Create: `.env.example`

**Step 1: Create package.json**

```json
{
  "name": "pi-agent-container",
  "version": "1.0.0",
  "type": "module",
  "scripts": {
    "build": "tsc",
    "start": "node dist/agent.js",
    "dev": "tsx src/agent.ts"
  },
  "dependencies": {
    "@mariozechner/pi-ai": "^1.0.0",
    "@mariozechner/pi-agent-core": "^1.0.0"
  },
  "devDependencies": {
    "@types/node": "^20.0.0",
    "tsx": "^4.0.0",
    "typescript": "^5.0.0"
  }
}
```

**Step 2: Create tsconfig.json**

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "bundler",
    "esModuleInterop": true,
    "strict": true,
    "outDir": "./dist",
    "rootDir": "./src",
    "declaration": true,
    "skipLibCheck": true
  },
  "include": ["src/**/*"],
  "exclude": ["node_modules", "dist"]
}
```

**Step 3: Create .env.example**

```
LLM_BASE_URL=http://localhost:11434/v1
LLM_API_KEY=
LLM_MODEL=llama3.1:8b
LLM_API=openai-completions
AGENT_PROMPT=
```

**Step 4: Commit**

```bash
git add package.json tsconfig.json .env.example
git commit -m "chore: initialize Node.js project with dependencies"
```

---

### Task 2: Create agent implementation

**Files:**
- Create: `src/agent.ts`

**Step 1: Write src/agent.ts**

```typescript
import { Agent } from "@mariozechner/pi-agent-core";
import { getModel, streamSimple, Type } from "@mariozechner/pi-ai";
import * as fs from "fs";
import * as readline from "readline";
import type { AgentTool } from "@mariozechner/pi-agent-core";

const readFileParams = Type.Object({
  path: Type.String({ description: "Path to the file" }),
});

const readFileTool: AgentTool = {
  name: "read_file",
  label: "Read File",
  description: "Read the contents of a file",
  parameters: readFileParams,
  execute: async (_id, params) => {
    try {
      const content = fs.readFileSync(params.path, "utf-8");
      return { content: [{ type: "text", text: content }], details: {} };
    } catch (err: any) {
      return { content: [{ type: "text", text: `Error: ${err.message}` }], details: {} };
    }
  },
};

const listFilesParams = Type.Object({
  path: Type.String({ description: "Directory path", default: "." }),
});

const listFilesTool: AgentTool = {
  name: "list_files",
  label: "List Files",
  description: "List files in a directory",
  parameters: listFilesParams,
  execute: async (_id, params) => {
    try {
      const files = fs.readdirSync(params.path);
      return { content: [{ type: "text", text: files.join("\n") }], details: { count: files.length } };
    } catch (err: any) {
      return { content: [{ type: "text", text: `Error: ${err.message}` }], details: {} };
    }
  },
};

function validateEnv(): void {
  const required = ["LLM_BASE_URL", "LLM_MODEL"];
  const missing = required.filter((key) => !process.env[key]);
  
  if (missing.length > 0) {
    console.error(`Error: Missing required environment variables: ${missing.join(", ")}`);
    process.exit(1);
  }
}

function createModel() {
  const baseUrl = process.env.LLM_BASE_URL!;
  const apiKey = process.env.LLM_API_KEY || undefined;
  const modelId = process.env.LLM_MODEL!;
  const api = process.env.LLM_API || "openai-completions";

  return getModel("openai-completions", modelId, {
    provider: "custom",
    baseUrl,
    reasoning: false,
    input: ["text"],
    cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
    contextWindow: 128000,
    maxTokens: 8192,
  }, { apiKey });
}

async function createAgent(): Promise<Agent> {
  const model = createModel();
  
  const agent = new Agent({
    initialState: {
      systemPrompt: "You are a helpful assistant with access to file tools. Be concise.",
      model,
      tools: [readFileTool, listFilesTool],
      thinkingLevel: "off",
    },
    streamFn: streamSimple,
  });

  agent.subscribe((event) => {
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

async function runPrompt(prompt: string): Promise<void> {
  const agent = await createAgent();
  await agent.prompt(prompt);
  console.log();
}

async function runRepl(): Promise<void> {
  const agent = await createAgent();
  
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  console.log("PI Agent REPL (type 'exit' to quit)\n");

  const ask = () => {
    rl.question("You: ", async (input) => {
      const trimmed = input.trim();
      if (trimmed === "exit") {
        rl.close();
        return;
      }
      if (!trimmed) {
        ask();
        return;
      }
      try {
        await agent.prompt(trimmed);
      } catch (err: any) {
        console.error(`Error: ${err.message}`);
      }
      console.log();
      ask();
    });
  };

  ask();
}

async function main() {
  validateEnv();

  const prompt = process.env.AGENT_PROMPT;
  
  if (prompt) {
    await runPrompt(prompt);
  } else {
    await runRepl();
  }
}

main();
```

**Step 2: Commit**

```bash
git add src/agent.ts
git commit -m "feat: implement pi-agent with file tools"
```

---

### Task 3: Create Dockerfile

**Files:**
- Create: `Dockerfile`

**Step 1: Write Dockerfile**

```dockerfile
FROM node:20-slim

WORKDIR /app

COPY package*.json ./
RUN npm install

COPY tsconfig.json ./
COPY src ./src
RUN npm run build

FROM node:20-slim

WORKDIR /app

COPY package*.json ./
RUN npm install --omit=dev

COPY --from=0 /app/dist ./dist

ENV NODE_ENV=production

CMD ["node", "dist/agent.js"]
```

**Step 2: Commit**

```bash
git add Dockerfile
git commit -m "feat: add Dockerfile for container"
```

---

### Task 4: Build and verify container

**Files:**
- Test: Build and basic smoke test

**Step 1: Build the container**

Run: `docker build -t pi-agent .`
Expected: Build succeeds without errors

**Step 2: Test missing env vars error**

Run: `docker run --rm pi-agent 2>&1`
Expected: Error message about missing LLM_BASE_URL

**Step 3: Verify help/error message is clear**

Check that error output indicates which env vars are needed

**Step 4: Commit**

```bash
git add .
git commit -m "test: add Dockerfile and verify build"
```

---

### Task 5: Integration test with local Ollama (optional)

**Files:**
- Test: Verify agent works with actual LLM

**Step 1: Start Ollama (if available)**

Run: `ollama serve` (in background)

**Step 2: Run agent with test prompt**

```bash
docker run --rm \
  -e LLM_BASE_URL=http://host.docker.internal:11434/v1 \
  -e LLM_MODEL=llama3.1:8b \
  -e AGENT_PROMPT="What is 2+2?" \
  pi-agent
```

Expected: Agent responds with answer

**Step 3: Test file tools**

```bash
docker run --rm \
  -e LLM_BASE_URL=http://host.docker.internal:11434/v1 \
  -e LLM_MODEL=llama3.1:8b \
  -e AGENT_PROMPT="What files are in /app?" \
  pi-agent
```

Expected: Lists files from container's /app directory

---

### Task 6: Final commit and cleanup

**Step 1: Add .dockerignore**

```
node_modules
dist
.git
.env
```

**Step 2: Commit**

```bash
git add .dockerignore
git commit -m "chore: add .dockerignore"
```

---

**Plan complete.**

**Two execution options:**

**1. Subagent-Driven (this session)** - I dispatch fresh subagent per task, review between tasks, fast iteration

**2. Parallel Session (separate)** - Open new session with executing-plans, batch execution with checkpoints

Which approach?