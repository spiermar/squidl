# Agent Development Guide

This file provides instructions for agentic coding agents operating in this repository.

## Project Overview

This is a TypeScript-based PI Agent container that provides an AI agent with file system tools. The agent runs as a REPL, processes prompts from environment variables, or can run as a WebSocket server for remote connections.

## Build, Lint, and Test Commands

### Build
```bash
npm run build        # Compile TypeScript to JavaScript (outputs to dist/)
npm run dev          # Run in development mode with tsx (hot reload)
npm run start        # Run the compiled JavaScript from dist/
```

### Running a Single Test
This project currently has **no test framework configured**. To add tests, consider installing:
- `vitest` - Modern test runner (recommended for TypeScript)
- `jest` - More traditional test framework

Example when tests are added:
```bash
# With vitest
npx vitest run --test-name-pattern="test name"

# With jest
npx jest --testNamePattern="test name"
```

### Type Checking
```bash
npx tsc --noEmit      # Type-check without emitting files
```

## Code Style Guidelines

### General
- **No semicolons** at statement ends
- **2-space indentation**
- **Single quotes** for strings
- **ESM modules** (type: "module" in package.json)
- **Strict TypeScript** enabled (strict: true in tsconfig.json)

### Imports
- Use named imports where possible: `import { Agent } from "@mariozechner/pi-coding-agent"`
- Use type-only imports for types: `import type { AgentEvent } from "@mariozechner/pi-agent-core"`
- Group imports: external packages first, then local modules
- Use `* as` namespace import for Node.js built-ins: `import * as fs from "fs"`
- Always include `.js` extension for local imports: `import { WebsocketServer } from "./websocket-server.js"`

### Types
- Use `Type.Object()` from pi-ai for tool parameter schemas
- Use `Static<typeof ...>` to extract TypeScript types from schemas
- Always type function parameters and return values
- Use `unknown` type when catching errors, then narrow with `instanceof Error`

### Naming Conventions
- **PascalCase** for types: `ReadFileParams`, `ClientMessage`
- **camelCase** for variables, functions, and object keys
- **SCREAMING_SNAKE_CASE** for constants: `MAX_CONNECTIONS`
- Prefix interfaces with descriptive names: `ClientMessage`
- Descriptive names - avoid single letters except in loops

### Error Handling
- Always wrap potentially failing code in try/catch
- When catching errors, handle both Error objects and primitive values:
  ```typescript
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    // use message...
  }
  ```
- Return error details in tool response objects, not throw
- For WebSocket: use `sendError` helper to send error messages to clients

### Functions
- Use async/await for asynchronous operations
- Keep functions focused and small (< 50 lines when possible)
- Use function declarations or arrow functions consistently
- Use generic types for reusable functions: `async function withRetry<T>(fn: () => Promise<T>)`

### Classes
- Use private fields for encapsulation: `private wss: WSServer | null`
- Validate constructor parameters with early throws
- Implement proper cleanup with `dispose()` or `stop()` methods
- Use signal handlers for graceful shutdown

### Tool Implementation Pattern
Follow this pattern for agent tools:
```typescript
const toolParams = Type.Object({
  paramName: Type.String({ description: "Param description" }),
});
type ToolParams = Static<typeof toolParams>;

const tool: AgentTool<typeof toolParams> = {
  name: "tool_name",
  label: "Tool Label",
  description: "What the tool does",
  parameters: toolParams,
  execute: async (_id, params: ToolParams) => {
    try {
      // Tool logic
      return { content: [{ type: "text", text: result }], details: {} };
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      return { content: [{ type: "text", text: `Error: ${message}` }], details: { error: message } };
    }
  },
};
```

## Environment Variables

Required:
- `LLM_BASE_URL` - Base URL for LLM API (e.g., http://localhost:11434/v1)
- `LLM_MODEL` - Model identifier (e.g., llama3.1:8b)

Optional:
- `LLM_API` - API type (default: "openai-completions")
- `OPENAI_API_KEY` - API key for authentication
- `AGENT_PROMPT` - If set, runs single prompt instead of REPL
- `WEBSOCKET_PORT` - Port for WebSocket server (default: 8080)
- `WEBSOCKET_MODE` - If set, runs WebSocket server instead of REPL

See `.env.example` for reference.

## File Structure

```
/home/opencode/workspace/pi-agent-container/
├── src/
│   ├── agent.ts              # Main agent implementation (REPL/prompt mode)
│   └── websocket-server.ts   # WebSocket server for remote connections
├── dist/                     # Compiled JavaScript output
├── workspace/                # Agent instructions loaded at runtime
├── package.json
├── tsconfig.json
└── .env.example
```

## Development Workflow

1. Make changes in `src/agent.ts` or `src/websocket-server.ts`
2. Run `npm run dev` to test changes
3. Run `npm run build` before deploying
4. Test the built version with `npm run start`

## WebSocket Server Protocol

When running in `WEBSOCKET_MODE`, clients can send messages:
```typescript
// Client message format
{ type: "prompt", content: "your prompt here" }
{ type: "disconnect" }

// Server sends AgentEvent objects as JSON
```

## Notes

- The codebase is small (~320 lines combined) - keep changes focused and minimal
- No linting or formatting tools are currently configured - manually ensure code consistency
- The agent uses `createCodingTools` from pi-coding-agent for file system access
- Session management supports both creating new sessions and continuing recent sessions