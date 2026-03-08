# PI Agent Container

A TypeScript-based PI Agent container providing an AI agent with file system tools. Runs as a REPL or processes prompts from environment variables.

## Prerequisites

- Docker
- LLM configuration (see Environment Variables below)

## Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `LLM_BASE_URL` | Yes | Base URL for LLM API |
| `LLM_MODEL` | Yes | Model identifier |
| `LLM_API` | No | API type (default: "openai-completions") |
| `LLM_API_KEY` | No | API key for authentication |
| `AGENT_PROMPT` | No | If set, runs single prompt instead of REPL |
| `WEBSOCKET_MODE` | No | If set, runs WebSocket server instead of REPL |
| `WEBSOCKET_PORT` | No | Port for WebSocket server (default: 8080) |

## Build the Container

```bash
docker build -t pi-agent .
```

## Run the Container

### REPL Mode (Interactive)

Run in interactive REPL mode:

```bash
docker run -it --rm \
  -e LLM_BASE_URL=http://host.docker.internal:11434/v1 \
  -e LLM_MODEL=llama3 \
  -e LLM_API_KEY=ollama \
  -v $(pwd)/workspace:/app/workspace \
  pi-agent
```

### AGENT_PROMPT Mode

Run a single prompt and exit:

```bash
docker run --rm \
  -e LLM_BASE_URL=http://host.docker.internal:11434/v1 \
  -e LLM_MODEL=llama3 \
  -e LLM_API_KEY=ollama \
  -e AGENT_PROMPT="List files in the current directory" \
  -v $(pwd)/workspace:/app/workspace \
  pi-agent
```

### WebSocket Mode

Run the WebSocket server to accept connections:

```bash
docker run --rm \
  -e LLM_BASE_URL=http://host.docker.internal:11434/v1 \
  -e LLM_MODEL=llama3 \
  -e LLM_API_KEY=ollama \
  -e WEBSOCKET_MODE=true \
  -p 8080:8080 \
  -v $(pwd)/workspace:/app/workspace \
  pi-agent
```

Connect to `ws://localhost:8080` to interact with the agent via WebSocket.

## Volume Mount

The `workspace` directory is not copied into the image. Mount your workspace to `/app/workspace` to provide agent instructions and working files:

```bash
-v /path/to/your/workspace:/app/workspace
```

The workspace should contain `AGENTS.md` with agent instructions (optional - the agent will work without it).