import { createAgentSession, SessionManager, createCodingTools, DefaultResourceLoader } from "@mariozechner/pi-coding-agent";
import { getModel, streamSimple, Type, Static } from "@mariozechner/pi-ai";
import * as fs from "fs";
import * as readline from "readline";
import * as path from "path";
import { WebsocketServer } from "./websocket-server.js";
import type { AgentTool } from "@mariozechner/pi-agent-core";
import type { Model } from "@mariozechner/pi-ai";

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

function createModel(): Model<any> {
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
      input: ["text"] as const,
      cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
      contextWindow: 202752,
      maxTokens: 8192,
    };
  }

  return getModel("anthropic", "claude-sonnet-4-20250514");
}

export async function createAgent(): Promise<any> {
  const sessionManager = SessionManager.create(process.cwd());
  return createSession(sessionManager);
}

export async function createSession(sessionManager: any) {
  const model = createModel();
  const agentInstructions = loadAgentInstructions();
  const basePrompt = "You are a helpful assistant with access to file tools. Be concise.";
  const systemPrompt = agentInstructions ? `${basePrompt}\n\n${agentInstructions}` : basePrompt;

  const resourceLoader = new DefaultResourceLoader({
    cwd: process.cwd(),
    systemPrompt,
  });

  const { session } = await createAgentSession({
    model,
    thinkingLevel: "medium",
    sessionManager,
    tools: createCodingTools(process.cwd()),
    resourceLoader,
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

async function withRetry<T>(fn: () => Promise<T>, maxRetries = 3): Promise<T> {
  let lastError: Error | undefined;
  
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      return await fn();
    } catch (err) {
      lastError = err instanceof Error ? err : new Error(String(err));
      console.error(`Attempt ${attempt}/${maxRetries} failed: ${lastError.message}`);
      
      if (attempt < maxRetries) {
        const delay = Math.pow(2, attempt) * 1000;
        console.log(`Retrying in ${delay}ms...`);
        await new Promise(resolve => setTimeout(resolve, delay));
      }
    }
  }
  
  throw lastError || new Error("Operation failed after retries");
}

async function runPrompt(prompt: string): Promise<void> {
  const sessionManager = SessionManager.create(process.cwd());
  const session = await createSession(sessionManager);
  await withRetry(() => session.prompt(prompt));
  console.log();
}

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

main();