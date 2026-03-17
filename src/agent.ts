import { createAgentSession, SessionManager, createCodingTools, DefaultResourceLoader } from "@mariozechner/pi-coding-agent";
import { getModel, streamSimple } from "@mariozechner/pi-ai";
import * as fs from "fs";
import * as readline from "readline";
import * as path from "path";
import { WebsocketServer } from "./websocket-server.js";
import type { Model } from "@mariozechner/pi-ai";

function createModel(): Model<any> {
  const baseUrl = process.env.LLM_BASE_URL;
  const modelId = process.env.LLM_MODEL;
  const api = process.env.LLM_API;

  if (baseUrl && modelId) {
    return {
      id: modelId,
      name: modelId,
      api: (api || "openai-completions") as "openai-completions",
      provider: "openai",
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

export async function createAgent() {
  const model = createModel();

  const resourceLoader = new DefaultResourceLoader({
    cwd: process.cwd(),
    systemPromptOverride: () => `You are a helpful assistant that speaks like a pirate. Always end responses with "Arrr!"`,
  });
  await resourceLoader.reload();

  // Discover AGENTS.md files walking up from cwd
  const discovered = resourceLoader.getAgentsFiles().agentsFiles;
  console.log("Discovered context files:");
  for (const file of discovered) {
	  console.log(`  - ${file.path} (${file.content.length} chars)`);
  }

  const { session } = await createAgentSession({
    cwd: process.cwd(),
    model,
    thinkingLevel: "medium",
    tools: createCodingTools(process.cwd()),
    resourceLoader: resourceLoader,
    sessionManager: SessionManager.inMemory(),
  });

  const apiKey = process.env.OPENAI_API_KEY;
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
  const session = await createAgent();
  await withRetry(() => session.prompt(prompt));
  console.log();
}

async function runRepl(): Promise<void> {
  const session = await createAgent();
  
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
  const port = parseInt(process.env.WEBSOCKET_PORT || "8888", 10);
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