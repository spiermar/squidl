import { WebSocket, WebSocketServer as WSServer } from "ws";
import type { Agent, AgentEvent } from "@mariozechner/pi-agent-core";
import { createAgent } from "./agent.js";

interface ClientMessage {
  type: "prompt" | "disconnect";
  content?: string;
}

const MAX_CONNECTIONS = 10;

export class WebsocketServer {
  private wss: WSServer | null = null;
  private port: number;
  private connectionCount = 0;

  constructor(port: number = 8080) {
    if (typeof port !== "number" || port < 1 || port > 65535 || !Number.isInteger(port)) {
      throw new Error(`Invalid port: ${port}. Must be an integer between 1 and 65535.`);
    }
    this.port = port;
  }

  async start(): Promise<void> {
    return new Promise((resolve) => {
      this.wss = new WSServer({ port: this.port });

      this.wss.on("listening", () => {
        console.log(`Websocket server listening on port ${this.port}`);
        resolve();
      });

      this.wss.on("connection", (ws: WebSocket) => {
        this.handleConnection(ws);
      });

      this.wss.on("error", (err: Error) => {
        console.error("Websocket server error:", err.message);
      });
    });
  }

  private async handleConnection(ws: WebSocket): Promise<void> {
    if (this.connectionCount >= MAX_CONNECTIONS) {
      this.sendError(ws, "Connection limit exceeded. Please try again later.");
      ws.close();
      return;
    }

    this.connectionCount++;
    console.log("Client connected");

    const agentId = Math.random().toString(36).slice(2, 9);
    let agent: Agent;
    let unsubscribe: (() => void) | undefined;

    try {
      agent = await createAgent();
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      this.sendError(ws, `Failed to create agent: ${message}`);
      ws.close();
      return;
    }

    try {
      unsubscribe = agent.subscribe((event: AgentEvent) => {
        this.sendEvent(ws, event);
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      console.error(`Failed to subscribe to agent ${agentId}: ${message}`);
    }

    ws.on("message", (data: Buffer) => {
      this.handleMessage(ws, data.toString(), agent);
    });

    ws.on("close", () => {
      this.connectionCount--;
      console.log(`Client disconnected (agent ${agentId})`);
      if (unsubscribe) {
        unsubscribe();
      }
      if (typeof (agent as any).dispose === "function") {
        (agent as any).dispose();
      } else {
        console.log(`Agent ${agentId} orphaned for garbage collection`);
      }
    });

    ws.on("error", (err: Error) => {
      console.error(`Websocket error for agent ${agentId}:`, err.message);
    });
  }

  private handleMessage(ws: WebSocket, data: string, agent: Agent): void {
    try {
      const message: ClientMessage = JSON.parse(data);

      if (message.type === "prompt" && message.content) {
        agent.prompt(message.content).catch((err: Error) => {
          this.sendError(ws, err.message);
        });
      } else if (message.type === "disconnect") {
        ws.close();
      }
    } catch (err: unknown) {
      const errorMessage = err instanceof Error ? err.message : String(err);
      this.sendError(ws, `Invalid message: ${errorMessage}`);
    }
  }

  private sendEvent(ws: WebSocket, event: AgentEvent): void {
    try {
      const message = JSON.stringify(event);
      ws.send(message);
    } catch (err: unknown) {
      const errorMessage = err instanceof Error ? err.message : String(err);
      console.error("Failed to send event:", errorMessage);
    }
  }

  private sendError(ws: WebSocket, message: string): void {
    try {
      ws.send(JSON.stringify({ type: "error", message }));
    } catch (err: unknown) {
      console.error("Failed to send error:", err);
    }
  }

  async stop(): Promise<void> {
    return new Promise((resolve) => {
      if (this.wss) {
        this.wss.close(() => {
          console.log("Websocket server stopped");
          resolve();
        });
      } else {
        resolve();
      }
    });
  }
}