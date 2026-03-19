# PI Agent Container Design

## Overview

Create a Docker container that runs a pi-agent following Layer 1 and Layer 2 of the pi-agent framework from the blog post. The agent will have file read and list tools, configurable LLM endpoint, and support both single-prompt and interactive REPL modes.

## Architecture

```
┌─────────────────────┐
│  Docker Container   │
├─────────────────────┤
│  Node.js 20+        │
│  ├─ @mariozechner/pi-ai           │
│  └─ @mariozechner/pi-agent-core   │
│  Agent with tools   │
└─────────────────────┘
```

## Configuration

Environment variables (required):
- `LLM_BASE_URL` - Base URL for LLM endpoint (e.g., http://host:11434/v1)
- `LLM_API_KEY` - API key for authentication
- `LLM_MODEL` - Model ID to use (e.g., llama3.1:8b)

Environment variables (optional):
- `AGENT_PROMPT` - Initial prompt to send to agent (if not set, starts REPL)
- `LLM_API` - API type for custom endpoints (default: "openai-completions")

## Components

### package.json
- Node.js project with TypeScript
- Dependencies: @mariozechner/pi-ai, @mariozechner/pi-agent-core
- Dev dependencies: typescript, @types/node, tsx

### src/agent.ts
- Model configuration using getModel with custom endpoint
- Agent initialization with streamFn
- Tool definitions: read_file, list_files
- Event subscription for streaming output
- REPL mode or single-prompt mode based on AGENT_PROMPT env var

### Dockerfile
- Node.js 20-slim base image
- Copy package files and install dependencies
- Copy source code
- Build TypeScript
- Set entry point

### .env.example
Template for required environment variables

## Tool Definitions

### read_file
- Reads file contents from workspace
- Parameter: path (string)
- Returns file content or error

### list_files
- Lists files in a directory
- Parameter: path (string, default: ".")
- Returns file list or error

## Error Handling

- Missing required env vars: print error and exit with code 1
- Tool execution errors: return error message to LLM for context
- LLM connection errors: log error, attempt retry with exponential backoff (max 3 retries)

## Build and Run

```bash
# Build
docker build -t pi-agent .

# Run with environment
docker run -it --rm \
  -e LLM_BASE_URL=http://host:11434/v1 \
  -e LLM_API_KEY=your-key \
  -e LLM_MODEL=llama3.1:8b \
  pi-agent

# Run with prompt
docker run --rm \
  -e LLM_BASE_URL=http://host:11434/v1 \
  -e LLM_API_KEY=your-key \
  -e LLM_MODEL=llama3.1:8b \
  -e AGENT_PROMPT="What files are in the current directory?" \
  pi-agent
```

## Success Criteria

1. Container builds successfully
2. Agent connects to configurable LLM endpoint
3. Tools (read_file, list_files) work correctly
4. REPL mode accepts user input when AGENT_PROMPT is not set
5. Single-prompt mode works when AGENT_PROMPT is set
6. Error messages are clear and actionable