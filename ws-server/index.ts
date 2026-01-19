import { createServer, IncomingMessage } from "http";
import { WebSocketServer, WebSocket } from "ws";
import { URL } from "url";
import { config } from "dotenv";
import { RealtimeSession } from "./realtime-session.js";

// Load environment variables from parent directory
config({ path: "../.env" });

const WS_PORT = parseInt(process.env.WS_PORT || "3001", 10);

interface ConnectionParams {
  scenarioId?: string;
  assignmentId?: string;
}

function parseQueryParams(request: IncomingMessage): ConnectionParams {
  const url = new URL(request.url || "/", `http://localhost:${WS_PORT}`);
  return {
    scenarioId: url.searchParams.get("scenarioId") || undefined,
    assignmentId: url.searchParams.get("assignmentId") || undefined,
  };
}

// Create HTTP server
const server = createServer((req, res) => {
  // Health check endpoint
  if (req.url === "/health") {
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ status: "ok" }));
    return;
  }

  res.writeHead(404);
  res.end();
});

// Create WebSocket server
const wss = new WebSocketServer({ server });

// Track active sessions
const sessions = new Map<WebSocket, RealtimeSession>();

wss.on("connection", async (ws: WebSocket, request: IncomingMessage) => {
  const params = parseQueryParams(request);

  console.log(
    `[WS] New connection - scenarioId: ${params.scenarioId}, assignmentId: ${params.assignmentId}`
  );

  // Create a new RealtimeSession for this connection
  const session = new RealtimeSession(ws, params);
  sessions.set(ws, session);

  // Attempt to connect to OpenAI Realtime API
  try {
    await session.connect();
  } catch (error) {
    console.error("[WS] Failed to connect to OpenAI:", error);
    ws.close(1011, "Failed to connect to OpenAI Realtime API");
    return;
  }

  ws.on("close", () => {
    console.log("[WS] Client disconnected");
    const session = sessions.get(ws);
    if (session) {
      session.disconnect();
      sessions.delete(ws);
    }
  });

  ws.on("error", (error) => {
    console.error("[WS] WebSocket error:", error);
    const session = sessions.get(ws);
    if (session) {
      session.disconnect();
      sessions.delete(ws);
    }
  });
});

// Handle server shutdown gracefully
process.on("SIGTERM", () => {
  console.log("[WS] Received SIGTERM, shutting down...");
  wss.clients.forEach((client) => {
    client.close(1001, "Server shutting down");
  });
  server.close(() => {
    console.log("[WS] Server closed");
    process.exit(0);
  });
});

process.on("SIGINT", () => {
  console.log("[WS] Received SIGINT, shutting down...");
  wss.clients.forEach((client) => {
    client.close(1001, "Server shutting down");
  });
  server.close(() => {
    console.log("[WS] Server closed");
    process.exit(0);
  });
});

server.listen(WS_PORT, () => {
  console.log(`[WS] WebSocket relay server listening on port ${WS_PORT}`);
  console.log(`[WS] Health check available at http://localhost:${WS_PORT}/health`);
});
