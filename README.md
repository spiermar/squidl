# PI Agent Container

A multi-service TypeScript application providing an AI agent with file system tools, accessible via WebSocket, HTTP API, or Telegram bot.

## Services

| Service | Port | Description |
|---------|------|-------------|
| `agent-service` | 8888 | WebSocket/HTTP server for AI agent interactions |
| `telegram-service` | 3000 | Telegram bot interface to the agent |
| `frontend-service` | 8080 | Static frontend served via nginx |
| `caddy` | 80/443 | Reverse proxy with automatic HTTPS |

## Prerequisites

- Docker and Docker Compose
- LLM configuration (see Environment Variables)

## Quick Start

### Using Docker Compose (Recommended)

1. Create a `.env` file from the example:
   ```bash
   cp .env.example .env
   ```

2. Edit `.env` with your configuration

3. Build and start all services:
   ```bash
   docker compose up --build
   ```

4. Services will be available at:
   - Agent WebSocket: `ws://localhost:8888`
   - Telegram bot: Configure your bot token and webhook

### Building Individual Services

```bash
# Build agent-service
docker compose build agent

# Build telegram-service
docker compose build telegram

# Build all services
docker compose build
```

## Environment Variables

### Agent Service

| Variable | Required | Description |
|----------|----------|-------------|
| `LLM_BASE_URL` | Yes | Base URL for LLM API |
| `LLM_MODEL` | Yes | Model identifier |
| `LLM_API` | No | API type (default: "openai-completions") |
| `OPENAI_API_KEY` | No | API key for authentication |
| `WEBSOCKET_PORT` | No | Port for WebSocket server (default: 8888) |
| `HTTP_PORT` | No | Port for HTTP server (default: 3000) |

### Telegram Service

| Variable | Required | Description |
|----------|----------|-------------|
| `TELEGRAM_BOT_TOKEN` | Yes | Telegram bot token |
| `AGENT_API_URL` | Yes | URL to agent service (default: http://agent:8888) |
| `WEBHOOK_URL` | No | Public webhook URL for Telegram |
| `WEBHOOK_SECRET` | No | Secret for webhook verification |

## Development

### Agent Service

```bash
cd agent-service
npm install
npm run dev      # Development with hot reload
npm run build    # Build to dist/
npm run start    # Run compiled code
```

### Telegram Service

```bash
cd telegram-service
npm install
npm run dev      # Development with hot reload
npm run build    # Build to dist/
npm run start    # Run compiled code
```

## Project Structure

```
pi-agent-container/
├── agent-service/           # AI agent service
│   ├── src/
│   │   ├── agent.ts         # Main agent implementation
│   │   ├── websocket-server.ts
│   │   └── http-server.ts
│   ├── Dockerfile
│   ├── package.json
│   └── tsconfig.json
├── telegram-service/        # Telegram bot service
│   ├── src/
│   ├── Dockerfile
│   ├── package.json
│   └── tsconfig.json
├── frontend-service/        # Static frontend
│   ├── index.html
│   ├── nginx.conf
│   └── Dockerfile
├── docker-compose.yml
├── Caddyfile               # Caddy reverse proxy config
└── .env.example
```

## WebSocket Protocol

Connect to `ws://localhost:8888` and send JSON messages:

```typescript
// Send a prompt
{ "type": "prompt", "content": "your prompt here" }

// Disconnect
{ "type": "disconnect" }

// Server responds with AgentEvent objects as JSON
```

## HTTP API

When running in HTTP mode, the agent provides a REST API:

```bash
# Create a session
POST /api/sessions

# Send a prompt
POST /api/sessions/:id/prompt
{ "prompt": "your prompt here" }

# Get session info
GET /api/sessions/:id

# Delete session
DELETE /api/sessions/:id
```
