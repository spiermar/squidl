import { Agent } from "@mariozechner/pi-agent-core";
import { streamSimple, Type, Static } from "@mariozechner/pi-ai";
import * as fs from "fs";
import * as readline from "readline";
import type { AgentTool } from "@mariozechner/pi-agent-core";
import type { Model } from "@mariozechner/pi-ai";
import type { Context, AssistantMessage } from "@mariozechner/pi-ai";

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

async function createAgent(): Promise<Agent> {
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
  const agent = await createAgent();
  await withRetry(() => agent.prompt(prompt));
  console.log();
}

async function runRepl(): Promise<void> {
  const agent = await createAgent();
  
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  const cleanup = () => {
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
        await withRetry(() => agent.prompt(trimmed));
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