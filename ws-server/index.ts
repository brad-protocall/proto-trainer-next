import { createServer, IncomingMessage } from "http";
import { WebSocketServer, WebSocket } from "ws";
import { URL } from "url";
import { config } from "dotenv";
import { RealtimeSession } from "./realtime-session.js";

// Load environment variables from parent directory
config({ path: "../.env" });

// Fail fast if required environment variables are missing
if (!process.env.OPENAI_API_KEY) {
  console.error("[WS] FATAL: OPENAI_API_KEY environment variable is required");
  process.exit(1);
}

const WS_PORT = parseInt(process.env.WS_PORT || "3004", 10);

interface ConnectionParams {
  userId: string;
  scenarioId?: string;
  assignmentId?: string;
}

type AuthResult = {
  ok: true;
  params: ConnectionParams;
} | {
  ok: false;
  error: string;
};

function authenticateConnection(request: IncomingMessage): AuthResult {
  const url = new URL(request.url || "/", `http://localhost:${WS_PORT}`);

  // Require userId for all connections
  const userId = url.searchParams.get("userId");
  if (!userId) {
    return { ok: false, error: "Missing required userId parameter" };
  }

  return {
    ok: true,
    params: {
      userId,
      scenarioId: url.searchParams.get("scenarioId") || undefined,
      assignmentId: url.searchParams.get("assignmentId") || undefined,
    },
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
  // Authenticate the connection
  const auth = authenticateConnection(request);
  if (!auth.ok) {
    console.warn(`[WS] Authentication failed: ${auth.error}`);
    ws.close(4001, auth.error);
    return;
  }

  const { params } = auth;
  console.log(
    `[WS] New connection - userId: ${params.userId}, scenarioId: ${params.scenarioId}, assignmentId: ${params.assignmentId}`
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
      sessions.delete(ws);
      // Persist transcripts before final cleanup
      session.disconnect().catch((err) => {
        console.error("[WS] Error during disconnect:", err);
      });
    }
  });

  ws.on("error", (error) => {
    console.error("[WS] WebSocket error:", error);
    const session = sessions.get(ws);
    if (session) {
      sessions.delete(ws);
      session.disconnect().catch((err) => {
        console.error("[WS] Error during disconnect:", err);
      });
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
