# Telegram Bot Integration Design

**Date:** 2026-03-16  
**Status:** Approved  
**Approach:** HTTP API + Telegram Webhook

## Overview

Add a Telegram bot microservice that connects to the PI Agent via HTTP API. The bot runs in a separate container and communicates with the agent over HTTP, receiving Telegram updates via webhooks (production) or polling (development).

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                      Docker Compose                         │
│  ┌─────────────────┐    ┌─────────────────┐                │
│  │  Agent Container │    │ Telegram Service │               │
│  │                 │    │    (new)         │               │
│  │  - WebSocket    │    │                 │               │
│  │  - HTTP API     │◄──►│  - HTTP Client  │               │
│  │  (port 8888)    │    │  - Webhook      │               │
│  └─────────────────┘    └─────────────────┘                │
│           │                       │                         │
│           └───────────┬───────────┘                         │
│                       ▼                                     │
│              Reverse Proxy (Caddy)                          │
│                 (port 443)                                  │
└─────────────────────────────────────────────────────────────┘
                            │
                            ▼
                    Telegram API
```

## HTTP API Design

Base URL: `http://agent:8888/api`

| Method | Endpoint | Description |
|--------|----------|-------------|
| `POST` | `/sessions` | Create new agent session, returns session ID |
| `POST` | `/sessions/:id/prompt` | Send prompt to session, returns events |
| `GET` | `/sessions/:id` | Get session status |
| `DELETE` | `/sessions/:id` | Dispose session |

### Request/Response Examples

**Create session:**
```bash
POST /api/sessions
Response: { "sessionId": "abc123", "createdAt": "2026-03-16T10:00:00Z" }
```

**Send prompt:**
```bash
POST /api/sessions/abc123/prompt
Body: { "prompt": "List files in /workspace" }
Response: { "events": [...], "status": "completed" }
```

**Delete session:**
```bash
DELETE /api/sessions/abc123
Response: { "success": true }
```

## Telegram Bot Integration

- **Webhook endpoint:** `https://your-domain.com/telegram/webhook`
- **Polling mode:** For local development without HTTPS
- **Session mapping:** `telegram_user_id` → `agent_session_id`
- **Message flow:**
  1. User sends message to bot
  2. Webhook receives update → look up or create session
  3. Send prompt to HTTP API
  4. Stream events back as Telegram messages (markdown supported)

## Session Management

- Each Telegram user gets their own agent session
- Sessions stored in-memory with user ID as key
- Auto-cleanup after 30 minutes of inactivity
- Session state: `{ userId, sessionId, createdAt, lastActivity }`

## Docker Compose Configuration

```yaml
services:
  agent:
    build: .
    ports:
      - "8888:8888"
    environment:
      - LLM_BASE_URL=${LLM_BASE_URL}
      - LLM_MODEL=${LLM_MODEL}
      - OPENAI_API_KEY=${OPENAI_API_KEY}

  telegram:
    build: ./telegram-service
    depends_on:
      - agent
    environment:
      - TELEGRAM_BOT_TOKEN=${TELEGRAM_BOT_TOKEN}
      - AGENT_API_URL=http://agent:8888
      - WEBHOOK_URL=${WEBHOOK_URL}

  caddy:
    image: caddy:2
    ports:
      - "80:80"
      - "443:443"
    volumes:
      - ./Caddyfile:/etc/caddy/Caddyfile
    depends_on:
      - telegram
```

## Components to Create

### telegram-service/
- `src/index.ts` - Main entry point
- `src/bot.ts` - Telegram bot logic
- `src/http-client.ts` - Agent API client
- `src/session-store.ts` - In-memory session mapping
- `package.json`

### Root files
- `docker-compose.yml` - Compose both services
- `Caddyfile` - Reverse proxy config

## Error Handling

- **Agent session timeout:** Auto-cleanup after 30min inactivity
- **API errors:** Return 4xx/5xx with error message
- **Telegram API errors:** Retry with exponential backoff
- **Webhook verification failures:** Log and reject
- **Invalid session:** Create new session automatically

## Environment Variables

### Agent Container
| Variable | Required | Description |
|----------|----------|-------------|
| `LLM_BASE_URL` | Yes | LLM API base URL |
| `LLM_MODEL` | Yes | Model identifier |
| `OPENAI_API_KEY` | No | API key if needed |

### Telegram Service
| Variable | Required | Description |
|----------|----------|-------------|
| `TELEGRAM_BOT_TOKEN` | Yes | Bot token from @BotFather |
| `AGENT_API_URL` | Yes | Agent HTTP API URL |
| `WEBHOOK_URL` | No | Production webhook URL |
| `SESSION_TIMEOUT` | No | Session timeout in ms (default: 1800000) |

## Security Considerations

- Webhook secret token validation for production
- Rate limiting on API endpoints
- Session isolation between users
- Input sanitization for prompts