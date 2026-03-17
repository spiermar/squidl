# PI Agent Container

A TypeScript-based PI Agent container providing an AI agent with file system tools. Runs as a WebSocket server or HTTP server.

## Prerequisites

- Docker
- LLM configuration (see Environment Variables below)

## Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `LLM_BASE_URL` | Yes | Base URL for LLM API |
| `LLM_MODEL` | Yes | Model identifier |
| `LLM_API` | No | API type (default: "openai-completions") |
| `OPENAI_API_KEY` | No | API key for authentication |
| `WEBSOCKET_PORT` | No | Port for WebSocket server (default: 8888) |
| `HTTP_PORT` | No | Port for HTTP server (default: 3000) |
| `HTTP_MODE` | No | If set, runs HTTP server instead of WebSocket server |

## Build the Container

```bash
docker build -t pi-agent .
```

## Run the Container

### WebSocket Mode (Default)

Run the WebSocket server to accept connections:

```bash
docker run --rm \
  -e LLM_BASE_URL=http://host.docker.internal:11434/v1 \
  -e LLM_MODEL=llama3 \
  -e OPENAI_API_KEY=ollama \
  -p 8888:8888 \
  -v $(pwd)/workspace:/app/workspace \
  pi-agent
```

Connect to `ws://localhost:8888` to interact with the agent via WebSocket.

### HTTP Mode

Run the HTTP server:

```bash
docker run --rm \
  -e LLM_BASE_URL=http://host.docker.internal:11434/v1 \
  -e LLM_MODEL=llama3 \
  -e OPENAI_API_KEY=ollama \
  -e HTTP_MODE=true \
  -p 3000:3000 \
  -v $(pwd)/workspace:/app/workspace \
  pi-agent
```

## Volume Mount

The `workspace` directory is not copied into the image. Mount your workspace to `/app/workspace` to provide agent instructions and working files:

```bash
-v /path/to/your/workspace:/app/workspace
```

The workspace should contain `AGENTS.md` with agent instructions (optional - the agent will work without it).