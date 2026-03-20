import { createAgentSession, SessionManager, createCodingTools, DefaultResourceLoader } from "@mariozechner/pi-coding-agent";
import { getModel, streamSimple } from "@mariozechner/pi-ai";
import { WebsocketServer } from "./websocket-server.js";
import { startHttpServer } from "./http-server.js";
import webToolsExtension from "./web-tools.js"
import type { Model } from "@mariozechner/pi-ai";

type RuntimeListener = {
  name: string
  stop: () => Promise<void>
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
  return createSession(SessionManager.inMemory())
}

export async function createSession(sessionManager: SessionManager) {
  const model = createModel();

  const resourceLoader = new DefaultResourceLoader({
    cwd: process.cwd(),
    systemPromptOverride: () => `You are a helpful assistant that speaks like a pirate. Always end responses with "Arrr!"`,
    extensionFactories: [webToolsExtension],
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
    sessionManager,
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

async function startWebsocketListener(): Promise<RuntimeListener> {
  const port = parseInt(process.env.WEBSOCKET_PORT || "8888", 10);
  const server = new WebsocketServer(port);
  await server.start();

  return {
    name: 'websocket',
    stop: async () => {
      await server.stop()
    },
  }
}

async function startHttpListener(): Promise<RuntimeListener> {
  const port = parseInt(process.env.HTTP_PORT || "3000", 10);
  const server = await startHttpServer(port)

  return {
    name: 'http',
    stop: async () => {
      await new Promise<void>((resolve, reject) => {
        server.close((err?: Error) => {
          if (err) {
            reject(err)
            return
          }
          console.log('HTTP API server stopped')
          resolve()
        })
      })
    },
  }
}

async function stopListeners(listeners: RuntimeListener[]): Promise<void> {
  await Promise.all(
    listeners.map(async (listener) => {
      try {
        await listener.stop()
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : String(err)
        console.error(`Failed to stop ${listener.name} listener: ${message}`)
      }
    })
  )
}

function registerSignalCleanup(listeners: RuntimeListener[]): { isShuttingDown: () => boolean } {
  let shuttingDown = false

  const handleShutdown = async () => {
    if (shuttingDown) {
      return
    }
    shuttingDown = true

    await stopListeners(listeners)
    process.exit(0)
  }

  process.once('SIGINT', () => {
    void handleShutdown()
  })

  process.once('SIGTERM', () => {
    void handleShutdown()
  })

  return {
    isShuttingDown: () => shuttingDown,
  }
}

async function main() {
  const startedListeners: RuntimeListener[] = []
  const signalCleanup = registerSignalCleanup(startedListeners)

  const startup = await Promise.allSettled([
    startHttpListener().then((listener) => {
      startedListeners.push(listener)
      return listener
    }),
    startWebsocketListener().then((listener) => {
      startedListeners.push(listener)
      return listener
    }),
  ])

  const failures: string[] = []

  for (const result of startup) {
    if (result.status === 'fulfilled') {
      continue
    }

    const message = result.reason instanceof Error ? result.reason.message : String(result.reason)
    failures.push(message)
  }

  if (failures.length > 0) {
    if (signalCleanup.isShuttingDown()) {
      return
    }

    // Keep startup fail-fast semantics: if either listener fails, exit non-zero.
    await stopListeners(startedListeners)
    console.error(`Failed to start listeners: ${failures.join(' | ')}`)
    process.exit(1)
  }
}

main();
