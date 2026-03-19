# PI Coding Agent Migration Design

**Date:** 2026-03-08  
**Topic:** Migrate from pi-agent-core to pi-coding-agent

## Overview

Migrate the PI Agent container from using `pi-agent-core` with manually-defined tools to `pi-coding-agent` which provides built-in file tools, session persistence, and auto-compaction.

## Goals

1. Add built-in coding tools (read, write, edit, bash, grep, find, ls)
2. Enable session persistence via JSONL files
3. Keep existing run modes (REPL, single prompt, WebSocket)

## Dependencies

Replace `@mariozechner/pi-agent-core` with `@mariozechner/pi-coding-agent`:

```json
- "@mariozechner/pi-agent-core": "^0.55.3"
+ "@mariozechner/pi-coding-agent": "^0.55.3"
```

## Architecture

### Before (pi-agent-core)

- Manually define `readFileTool` and `listFilesTool`
- Create `Agent` with initial state
- No session persistence

### After (pi-coding-agent)

```typescript
import { createAgentSession, SessionManager, createCodingTools } from "@mariozechner/pi-coding-agent";
import { getModel, streamSimple } from "@mariozechner/pi-ai";

// Session persistence
const sessionDir = path.join(process.cwd(), ".sessions");
fs.mkdirSync(sessionDir, { recursive: true });
const sessionFile = path.join(sessionDir, "agent.jsonl");
const sessionManager = SessionManager.open(sessionFile);

// Create session with built-in tools
const { session } = await createAgentSession({
  model: getModel("anthropic", "claude-sonnet-4-20250514"),
  thinkingLevel: "medium",
  sessionManager,
  tools: createCodingTools(process.cwd()),
});

// Set streaming function
session.agent.streamFn = streamSimple;
```

### Removed

- Manual tool definitions (~40 lines)
- `validateEnv()`, `createModel()`, `loadAgentInstructions()` — replaced by pi-coding-agent defaults
- Direct `Agent` instantiation

### Added

- Session persistence via `SessionManager`
- Auto-compaction for long conversations
- 7 built-in tools: read, write, edit, bash, grep, find, ls

## Run Modes

### REPL Mode

```typescript
async function runRepl() {
  const sessionManager = SessionManager.continueRecent(process.cwd());
  const { session } = await createAgentSession({ ... });
  // REPL loop with session.prompt()
}
```

### Single Prompt Mode

```typescript
async function runPrompt(prompt: string) {
  const sessionManager = SessionManager.create(process.cwd());
  const { session } = await createAgentSession({ ... });
  await session.prompt(prompt);
}
```

### WebSocket Mode

Each WebSocket connection gets its own session via `SessionManager.create()`. Update `WebsocketServer` to create a session instead of an agent.

## Event Handling

Subscription changes from `agent.subscribe()` to `session.subscribe()`. Event types remain compatible.

```typescript
session.subscribe((event) => {
  if (event.type === "message_update" && event.assistantMessageEvent.type === "text_delta") {
    process.stdout.write(event.assistantMessageEvent.delta);
  }
  // ... existing handlers
});
```

New events:
- `auto_compaction_start` / `auto_compaction_end`

## Configuration

### Environment Variables

- `LLM_BASE_URL` — still used for custom model endpoints
- `LLM_MODEL` — model ID (or use pi-coding-agent's model registry)
- `LLM_API_KEY` — optional, for custom endpoints
- `LLM_API` — optional, defaults to "openai-completions"

### Tool Scope

Use `createCodingTools(workspace)` to scope tools to a specific directory. This supports running the agent from a different cwd than the workspace.

## Migration Path

1. Update package.json dependencies
2. Rewrite agent.ts to use createAgentSession
3. Update WebsocketServer for session-based model
4. Test all three run modes
5. Verify session persistence works

## Notes

- pi-coding-agent re-exports pi-agent-core types, so existing type imports continue to work
- Auto-compaction triggers when context approaches the model's window limit
- Sessions stored in `.sessions/agent.jsonl` — append-only, crash-safe