# PI Agent Websocket Server Design

## Overview

Add a third mode to the PI Agent container that runs a websocket server, allowing multiple clients to connect and interact with isolated agent instances.

## Motivation

- **REPL mode**: Single user, terminal-based, blocks on input
- **AGENT_PROMPT mode**: Single prompt execution, exits when complete
- **Websocket mode**: Multiple concurrent connections, each with isolated agent session, suitable for web UI clients, programmatic access

## Architecture

### Components

1. **WebsocketServer** - Manages connections and port listening
2. **Per-connection Agent** - Each client gets own Agent instance via `createAgent()`
3. **EventBridge** - Subscribes to Agent events and forwards to client

### Data Flow

```
Client                          Server
  │                               │
  ├── connect (websocket) ──────► │
  │                               ├── Create Agent instance
  │                               ├── Subscribe to all events
  │
  ├── {"type":"prompt", ────────►
  │   "content":"..."}
  │                               ├── Run agent.prompt()
  │                               ├── Agent emits events
  │◄── {"type":"agent_start"} ───┤
  │◄── {"type":"message_update"}─┤
  │◄── {"type":"tool_execution_..}│
  │◄── {"type":"agent_end"} ──────┤
  │
  ├── disconnect ───────────────► │
  │                               ├── Agent orphaned (GC)
```

## Configuration

| Environment Variable | Required | Default | Description |
|---------------------|----------|---------|-------------|
| `WEBSOCKET_PORT` | No | 8080 | Port for websocket server |
| `LLM_BASE_URL` | Yes | - | LLM API endpoint |
| `LLM_MODEL` | Yes | - | Model identifier |
| `LLM_API` | No | openai-completions | API type |
| `LLM_API_KEY` | No | - | API key |

### Launch Modes

| Mode | Condition | Behavior |
|------|-----------|----------|
| REPL | No env vars set | Interactive terminal REPL |
| Single Prompt | `AGENT_PROMPT` set | Execute once, exit |
| Websocket | `WEBSOCKET_MODE=true` set | Start websocket server |

## Message Protocol

### Client → Server

**Prompt** (start agent execution):
```json
{"type":"prompt","content":"What files are in /app?"}
```

**Disconnect** (optional, clean shutdown):
```json
{"type":"disconnect"}
```

### Server → Client

All Agent events are forwarded as JSON:

```json
{"type":"agent_start"}
{"type":"turn_start"}
{"type":"message_start","message":{"role":"user","content":"..."}}
{"type":"message_end","message":{"role":"user","content":"..."}}
{"type":"message_start","message":{"role":"assistant","content":""}}
{"type":"message_update","assistantMessageEvent":{"type":"text_delta","delta":"Hello"}}
{"type":"message_end","message":{"role":"assistant","content":"Hello"}}
{"type":"tool_execution_start","toolName":"read_file","args":{"path":"."}}
{"type":"tool_execution_update","toolName":"read_file","output":"..."}
{"type":"tool_execution_end","toolName":"read_file","isError":false,"result":{...}}
{"type":"turn_end","message":{...},"toolResults":[...]}
{"type":"agent_end","messages":[...]}
```

**Error event** (server-side errors):
```json
{"type":"error","message":"Failed to create agent: ..."}
```

## Supported Events

All events from `@mariozechner/pi-agent-core`:

| Event | Forwarded | Description |
|-------|-----------|-------------|
| `agent_start` | Yes | Agent begins processing |
| `agent_end` | Yes | Agent completes with all messages |
| `turn_start` | Yes | New turn begins |
| `turn_end` | Yes | Turn completes |
| `message_start` | Yes | Any message begins |
| `message_update` | Yes | Assistant message delta (streaming) |
| `message_end` | Yes | Message completes |
| `tool_execution_start` | Yes | Tool begins |
| `tool_execution_update` | Yes | Tool streams progress |
| `tool_execution_end` | Yes | Tool completes |

## Implementation Details

### Dependencies

Add `ws` package for websocket server:
```json
"ws": "^8.16.0"
```

### Error Handling

- **Invalid client JSON**: Send `{"type":"error","message":"Invalid JSON"}`, continue connection
- **Agent creation failure**: Send error event, keep connection alive for retry
- **Agent execution failure**: Send error event with message
- **Client disconnect mid-prompt**: Agent continues running, result discarded
- **Websocket send failure**: Log error, close connection

### Connection Lifecycle

1. Client connects
2. Server accepts, waits for prompt
3. Client sends prompt → Server creates Agent, runs prompt
4. Events stream to client until `agent_end`
5. Agent completes → Server keeps connection open for next prompt
6. Client disconnects → Agent instance orphaned (GC)

### Multiple Concurrent Clients

Each connection is completely isolated:
- Separate Agent instance
- Separate message history
- Separate tool execution state

## Testing Strategy

1. Unit test event serialization
2. Integration test with websocket client library
3. Verify all event types are forwarded
4. Test concurrent connections don't interfere
5. Test disconnect handling

## Future Considerations

- Authentication/authorization for connections
- Connection limits to prevent resource exhaustion
- Shared agent pool for efficiency
- Binary message support for file transfers