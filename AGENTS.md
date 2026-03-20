# Agent Development Guide

This file provides instructions for agentic coding agents operating in this repository.

## Project Overview

A multi-service TypeScript application with three main services:

- **agent-service**: AI agent with file system tools, runs as WebSocket or HTTP server
- **telegram-service**: Telegram bot interface to the agent
- **frontend-service**: Static frontend served via nginx

## Services Architecture

```
┌─────────────────┐     ┌─────────────────┐
│ telegram-service│────▶│  agent-service  │
└─────────────────┘     │  (WebSocket)    │
                        └─────────────────┘
                              ▲
┌─────────────────┐           │
│     caddy       │───────────┘
│ (reverse proxy) │
└─────────────────┘
```

## Build, Lint, and Test Commands

### Agent Service
```bash
cd agent-service
npm run build                 # Compile TypeScript to dist/
npm run dev                   # Run in development mode with tsx
npm run start                 # Run compiled JavaScript
npm test                      # Run all tests with vitest
npx vitest run                # Run all tests
npx vitest run tests/unit/websocket-server.test.ts  # Run single test file
npx vitest run -t "test name"                       # Run tests matching pattern
npx vitest watch              # Run tests in watch mode
npx tsc --noEmit              # Type check without emitting
```

### Telegram Service
```bash
cd telegram-service
npm run build                 # Compile TypeScript to dist/
npm run dev                   # Run in development mode with tsx
npm run start                 # Run compiled JavaScript
node --test src/**/*.test.ts  # Run all tests (uses node:test)
node --test src/webhook-config.test.ts  # Run single test file
npx tsc --noEmit              # Type check without emitting
```

### Docker Compose
```bash
docker compose up --build    # Build and start all services
docker compose build agent   # Build specific service
docker compose up -d         # Start in detached mode
docker compose down          # Stop all services
```

## Code Style Guidelines

### General
- **No semicolons** at statement ends
- **2-space indentation**
- **Single quotes** for strings
- **ESM modules** (type: "module" in package.json)
- **Strict TypeScript** enabled (strict: true in tsconfig.json)
- Keep lines under 100 characters when possible

### Imports
- Use named imports where possible: `import { Agent } from "@mariozechner/pi-coding-agent"`
- Use type-only imports for types: `import type { AgentEvent } from "@mariozechner/pi-agent-core"`
- Group imports: external packages first, then local modules
- Use `import * as` namespace import for Node.js built-ins: `import { createServer } from 'node:net'`
- Always include `.js` extension for local imports: `import { WebsocketServer } from "./websocket-server.js"`
- Use `node:` prefix for Node built-ins: `import assert from 'node:assert/strict'`

### Types
- Always type function parameters and return values
- Use `unknown` type when catching errors, then narrow with `instanceof Error`
- Use type assertions only when necessary: `(server as unknown as { wss: unknown }).wss`
- Prefer type aliases for complex types: `type RuntimeListener = { name: string; stop: () => Promise<void> }`
- Use `interface` for object shapes that may be extended

### Naming Conventions
- **PascalCase** for types, interfaces, and classes: `WebsocketServer`, `ClientMessage`
- **camelCase** for variables, functions, and object keys
- **SCREAMING_SNAKE_CASE** for constants: `MAX_CONNECTIONS`
- Descriptive names - avoid single letters except in loops
- Private class fields: `private wss: WSServer | null`
- Async functions should indicate async behavior in name when needed

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
- For WebSocket/APIs: use helper functions to send error messages to clients
- Log errors with context: `console.error('Websocket error:', err.message)`

### Functions
- Use async/await for asynchronous operations
- Keep functions focused and small (< 50 lines when possible)
- Use arrow functions for callbacks and inline functions
- Use function declarations for top-level exported functions
- Use generic types for reusable functions: `async function withRetry<T>(fn: () => Promise<T>)`
- Return early to reduce nesting

### Classes
- Use private fields for encapsulation: `private wss: WSServer | null`
- Validate constructor parameters with early throws
- Implement proper cleanup with `dispose()` or `stop()` methods
- Use signal handlers for graceful shutdown
- Store instance state in fields, not closures

### Testing
- agent-service uses **vitest**: `import { describe, expect, it, vi } from 'vitest'`
- telegram-service uses **node:test**: `import test from 'node:test'`
- Use `vi.fn()` for mocks in vitest tests
- Clean up resources in `afterEach` hooks
- Test error conditions, not just happy paths
- Mock external dependencies at the module boundary

## Environment Variables

### Agent Service
| Variable | Required | Description |
|----------|----------|-------------|
| `LLM_BASE_URL` | Yes | Base URL for LLM API |
| `LLM_MODEL` | Yes | Model identifier |
| `LLM_API` | No | API type (default: "openai-completions") |
| `OPENAI_API_KEY` | No | API key for authentication |
| `WEBSOCKET_PORT` | No | WebSocket port (default: 8888) |
| `HTTP_PORT` | No | HTTP API port (default: 3000) |

### Telegram Service
| Variable | Required | Description |
|----------|----------|-------------|
| `TELEGRAM_BOT_TOKEN` | Yes | Telegram bot token |
| `AGENT_API_URL` | Yes | Agent service URL |
| `WEBHOOK_URL` | No | Public webhook URL |
| `WEBHOOK_SECRET` | No | Webhook secret |

See `.env.example` for reference.

## File Structure

```
pi-agent-container/
├── agent-service/
│   ├── src/
│   │   ├── agent.ts              # Main agent implementation
│   │   ├── websocket-server.ts   # WebSocket server
│   │   └── http-server.ts        # HTTP REST API
│   ├── tests/
│   │   ├── unit/                 # Unit tests
│   │   └── integration/          # Integration tests
│   ├── dist/                     # Compiled output
│   ├── Dockerfile
│   ├── package.json
│   └── tsconfig.json
├── telegram-service/
│   ├── src/
│   │   ├── index.ts              # Telegram bot entry point
│   │   ├── http-client.ts        # Agent API client
│   │   └── *.test.ts             # Tests alongside source
│   ├── dist/
│   ├── Dockerfile
│   ├── package.json
│   └── tsconfig.json
├── frontend-service/
│   ├── index.html
│   ├── nginx.conf
│   └── Dockerfile
├── docker-compose.yml
├── Caddyfile
└── .env.example
```

## Development Workflow

1. Make changes in the appropriate service's `src/` directory
2. Run `npm run dev` in that service's directory to test changes
3. Run `npx tsc --noEmit` to type check before committing
4. Run relevant tests before committing changes
5. Run `npm run build` before deploying
6. Test with Docker Compose: `docker compose up --build`

## API Reference

### WebSocket Protocol
```typescript
// Client -> Server
{ type: "prompt", content: "your prompt here" }
{ type: "disconnect" }

// Server -> Client (AgentEvent objects as JSON)
{ type: "error", message: "error description" }
```

### HTTP API
```bash
GET  /healthz                    # Health check
POST /api/sessions               # Create session -> { sessionId, createdAt }
POST /api/sessions/:id/prompt    # Send prompt -> { status, result }
GET  /api/sessions/:id           # Get session info
DELETE /api/sessions/:id         # Delete session
```

## Notes

- Each service has its own `package.json` and `tsconfig.json`
- No linting or formatting tools configured - manually ensure consistency
- Agent uses `createCodingTools` from pi-coding-agent for file system access
- Both WebSocket and HTTP servers run simultaneously in agent-service
