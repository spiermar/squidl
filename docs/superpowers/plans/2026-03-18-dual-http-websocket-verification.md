# Dual HTTP/WebSocket Runtime Verification Record

- Date: 2026-03-18
- Scope: Task 7 quality-review verification artifact and operator-impact notes

## Commands Run

1. `npm run build`
2. `LLM_BASE_URL=http://localhost:11434/v1 LLM_MODEL=llama3.1:8b HTTP_MODE=true WEBSOCKET_MODE=true HTTP_PORT=4310 WEBSOCKET_PORT=4311 npm run start` (backgrounded), then TCP probes to ports `4310` and `4311`, then shutdown
3. `LLM_BASE_URL=http://localhost:11434/v1 LLM_MODEL=llama3.1:8b HTTP_PORT=4320 WEBSOCKET_PORT=4321 npm run start` (backgrounded), then TCP probes to ports `4320` and `4321`, then shutdown

## Expected vs Actual

### Verification 1 - Build

- Timestamp start: 2026-03-18T17:55:08+00:00
- Timestamp end: 2026-03-18T17:55:16+00:00
- Expected: TypeScript build succeeds with exit code `0`
- Actual: `npm run build` completed successfully (`tsc` finished with no reported errors)

### Verification 2 - Mode vars set

- Timestamp start: 2026-03-18T17:55:38+00:00
- Timestamp end: 2026-03-18T17:55:41+00:00
- Expected: Both listeners start even when `HTTP_MODE` and `WEBSOCKET_MODE` are set; probes to `4310` and `4311` succeed
- Actual:
  - Startup log shows `HTTP API server listening on port 4310`
  - Startup log shows `Websocket server listening on port 4311`
  - Probe output: `PORT_OK 4310`, `PORT_OK 4311`

### Verification 3 - Default dual startup

- Timestamp start: 2026-03-18T17:55:56+00:00
- Timestamp end: 2026-03-18T17:55:59+00:00
- Expected: Both listeners start by default with no mode flags; probes to `4320` and `4321` succeed
- Actual:
  - Startup log shows `HTTP API server listening on port 4320`
  - Startup log shows `Websocket server listening on port 4321`
  - Probe output: `PORT_OK 4320`, `PORT_OK 4321`

## Behavior Change and Operator Impact

- Always-on dual listeners: startup now brings up HTTP and WebSocket listeners together in one process.
- `HTTP_MODE` and `WEBSOCKET_MODE` no longer affect startup behavior and should be treated as no-op compatibility env vars.
- Migration impact: deployment manifests/scripts that previously toggled single-protocol startup via mode flags should be updated to manage exposure using ports/network policy instead.
- How to run with both exposed ports:
  - Example: `HTTP_PORT=3000 WEBSOCKET_PORT=8888 LLM_BASE_URL=http://localhost:11434/v1 LLM_MODEL=llama3.1:8b npm run start`
  - Container/orchestration must expose both ports (for example, Docker `-p 3000:3000 -p 8888:8888` or equivalent service mapping).
