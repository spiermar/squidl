# Dual HTTP and WebSocket Runtime Design

**Date:** 2026-03-18  
**Status:** Approved (design)  
**Selected Approach:** Parallel startup orchestrator in `main()`

## Goal

Change runtime behavior so the agent process starts both HTTP and WebSocket servers at the same time, while keeping session state separate between protocols.

## Scope

In scope:
- Start both HTTP and WebSocket listeners by default in a single process
- Keep HTTP and WebSocket sessions isolated
- Fail fast if either server fails to start
- Graceful shutdown for both listeners on process signals

Out of scope:
- New runtime mode flags
- Cross-protocol session sharing
- Multi-process orchestration

## Current Context

- `src/agent.ts` currently chooses one mode (`HTTP_MODE` or WebSocket default)
- `src/http-server.ts` already exposes Express session APIs with an in-memory session map
- `src/websocket-server.ts` already supports per-connection agent sessions

The existing architecture already has protocol-level separation, so the change is primarily startup orchestration and lifecycle coordination.

## Options Considered

### 1) Parallel startup orchestrator (recommended)

Start both listeners in `main()` concurrently, fail process on either startup error, and keep existing session implementations unchanged.

Pros:
- Minimal code change
- Lowest regression risk
- Directly satisfies required behavior

Cons:
- Less explicit future runtime configurability than a dedicated config model

### 2) Dedicated ServerManager abstraction

Create a new lifecycle manager class for both listeners.

Pros:
- Cleaner extension path for future runtime modes

Cons:
- More refactor than needed for the requested behavior

### 3) Split into separate processes

Run HTTP and WebSocket as separate processes/containers.

Pros:
- Strong isolation and independent scaling

Cons:
- Operational complexity beyond this scope

## Architecture

Single process, dual listener startup:

1. Parse ports (`HTTP_PORT`, `WEBSOCKET_PORT`) with current defaults (`3000`, `8888`)
2. Create WebSocket server instance
3. Start HTTP and WebSocket servers concurrently
4. If either startup fails, trigger startup cleanup for any listener that already started, then exit non-zero
5. On SIGINT/SIGTERM, gracefully stop both servers, then exit

## Component Design

### `src/agent.ts`

- Replace mode branching with always-on dual startup
- Remove behavior dependency on `HTTP_MODE` and `WEBSOCKET_MODE`
- Introduce a unified startup function that orchestrates both listeners
- Introduce unified cleanup to stop both listeners safely

### `src/http-server.ts`

- Keep existing routes and HTTP session map unchanged
- Replace fire-and-forget startup with a startup contract that is fail-fast aware:
  - `startHttpServer(port)` returns a Promise that resolves only when the HTTP server emits `listening`
  - the Promise rejects on startup `error` events (including `EADDRINUSE`)
  - on success, the resolved value includes the created `http.Server` for coordinated shutdown

### `src/websocket-server.ts`

- Keep existing class and per-connection session flow unchanged
- Continue using `stop()` for shutdown coordination

## Session Isolation

Isolation remains explicit and unchanged:

- HTTP sessions remain in HTTP server in-memory map keyed by HTTP-generated session IDs
- WebSocket sessions remain connection-scoped agents created in WebSocket connection handler
- No shared store or cross-protocol lookup is introduced

## Data Flow

HTTP flow:
1. Client creates session via `POST /api/sessions`
2. HTTP server creates and stores a session in its own map
3. Client prompts via `POST /api/sessions/:id/prompt`

WebSocket flow:
1. Client opens socket
2. WebSocket server creates one agent session for that connection
3. Client sends `prompt` messages over socket

Both flows run concurrently in process, but state does not cross boundaries.

## Error Handling

Startup errors:
- If either listener fails to bind (e.g., `EADDRINUSE`), startup is considered failed
- On startup failure, orchestrator attempts to stop any listener that already started successfully
- Process exits with non-zero status after cleanup attempt (fail-fast)

Runtime errors:
- Keep current protocol-local error handling in HTTP routes and WebSocket handlers

Shutdown errors:
- Attempt shutdown for both listeners
- Log shutdown failures
- Exit process after cleanup attempt

## Testing Strategy

Build and type safety:
- `npm run build`

Automated runtime checks:
1. Add process-level integration tests for startup behavior:
   - app starts both listeners on each launch
   - `HTTP_MODE` and `WEBSOCKET_MODE` are ignored
   - one-port bind failure returns non-zero exit code
   - SIGINT/SIGTERM shuts down both listeners cleanly

2. Recommended implementation style for these tests:
   - spawn the built app as a child process with controlled env and ports
   - probe listeners using HTTP and WebSocket clients
   - assert exit codes and shutdown behavior

Manual smoke checks:
1. Start app and verify both ports are listening
2. Exercise HTTP session create/prompt/delete
3. Exercise WebSocket prompt/stream/disconnect
4. Validate protocol isolation by creating sessions in both paths and confirming no cross-access
5. Start with one occupied port and confirm process exits non-zero

## Acceptance Criteria

- App starts both HTTP and WebSocket listeners on every launch by default
- `HTTP_MODE` and `WEBSOCKET_MODE` no longer control startup behavior
- If either server fails at startup, process exits with non-zero code
- If either server fails during startup, any already-started listener is shut down before process exit
- HTTP and WebSocket sessions remain separate and independent
- SIGINT/SIGTERM triggers graceful stop for both listeners

## Risks and Mitigations

- Risk: startup race or unhandled rejection during parallel startup
  - Mitigation: explicit Promise error handling and fail-fast exit path

- Risk: incomplete shutdown handling if one listener already failed
  - Mitigation: defensive cleanup that attempts stop/close only for initialized listeners
