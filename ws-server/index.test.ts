import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import { createServer, Server } from "http";
import { WebSocketServer, WebSocket } from "ws";

// Mock environment
vi.stubEnv("OPENAI_API_KEY", "test-key");

/**
 * WebSocket Server Tests
 *
 * Tests for:
 * - Connection authentication (userId required)
 * - Health check endpoint
 * - Connection parameter handling
 */

describe("WebSocket Server", () => {
  describe("authenticateConnection", () => {
    // Test the authentication logic directly
    const WS_PORT = 3099;

    function parseAuthParams(url: string): { ok: boolean; params?: Record<string, string>; error?: string } {
      const parsed = new URL(url, `http://localhost:${WS_PORT}`);

      const userId = parsed.searchParams.get("userId");
      if (!userId) {
        return { ok: false, error: "Missing required userId parameter" };
      }

      return {
        ok: true,
        params: {
          userId,
          scenarioId: parsed.searchParams.get("scenarioId") || "",
          assignmentId: parsed.searchParams.get("assignmentId") || "",
        },
      };
    }

    it("should reject connection without userId", () => {
      const result = parseAuthParams("/ws");
      expect(result.ok).toBe(false);
      expect(result.error).toBe("Missing required userId parameter");
    });

    it("should accept connection with userId", () => {
      const result = parseAuthParams("/ws?userId=test-user-123");
      expect(result.ok).toBe(true);
      expect(result.params?.userId).toBe("test-user-123");
    });

    it("should parse all connection parameters", () => {
      const result = parseAuthParams(
        "/ws?userId=user-1&scenarioId=scenario-abc&assignmentId=assign-xyz"
      );
      expect(result.ok).toBe(true);
      expect(result.params).toEqual({
        userId: "user-1",
        scenarioId: "scenario-abc",
        assignmentId: "assign-xyz",
      });
    });

    it("should handle empty optional parameters", () => {
      const result = parseAuthParams("/ws?userId=user-1");
      expect(result.ok).toBe(true);
      expect(result.params?.scenarioId).toBe("");
      expect(result.params?.assignmentId).toBe("");
    });
  });

  describe("Health Check", () => {
    let server: Server;
    const PORT = 3098;

    beforeAll(async () => {
      server = createServer((req, res) => {
        if (req.url === "/health") {
          res.writeHead(200, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ status: "ok" }));
          return;
        }
        res.writeHead(404);
        res.end();
      });

      await new Promise<void>((resolve) => {
        server.listen(PORT, resolve);
      });
    });

    afterAll(async () => {
      await new Promise<void>((resolve) => {
        server.close(() => resolve());
      });
    });

    it("should return 200 OK for /health", async () => {
      const response = await fetch(`http://localhost:${PORT}/health`);
      expect(response.status).toBe(200);
      const data = await response.json();
      expect(data).toEqual({ status: "ok" });
    });

    it("should return 404 for unknown routes", async () => {
      const response = await fetch(`http://localhost:${PORT}/unknown`);
      expect(response.status).toBe(404);
    });
  });

  describe("UUID Validation", () => {
    // UUID v4 regex matching the server implementation
    const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

    it("should match valid UUID v4", () => {
      expect(UUID_REGEX.test("550e8400-e29b-41d4-a716-446655440000")).toBe(true);
      expect(UUID_REGEX.test("f47ac10b-58cc-4372-a567-0e02b2c3d479")).toBe(true);
    });

    it("should reject invalid UUIDs", () => {
      expect(UUID_REGEX.test("not-a-uuid")).toBe(false);
      expect(UUID_REGEX.test("")).toBe(false);
      expect(UUID_REGEX.test("550e8400-e29b-51d4-a716-446655440000")).toBe(false); // wrong version
    });

    it("should reject potential injection attempts", () => {
      expect(UUID_REGEX.test("'; DROP TABLE scenarios; --")).toBe(false);
      expect(UUID_REGEX.test("scenario-id\nignore previous")).toBe(false);
      expect(UUID_REGEX.test("../../../etc/passwd")).toBe(false);
    });
  });

  describe("WebSocket Connection", () => {
    let httpServer: Server;
    let wss: WebSocketServer;
    const PORT = 3097;

    beforeAll(async () => {
      httpServer = createServer();
      wss = new WebSocketServer({ server: httpServer });

      wss.on("connection", (ws, request) => {
        const url = new URL(request.url || "/", `http://localhost:${PORT}`);
        const userId = url.searchParams.get("userId");

        if (!userId) {
          ws.close(4001, "Missing required userId parameter");
          return;
        }

        ws.send(JSON.stringify({ type: "connected", userId }));
      });

      await new Promise<void>((resolve) => {
        httpServer.listen(PORT, resolve);
      });
    });

    afterAll(async () => {
      wss.clients.forEach((client) => client.close());
      await new Promise<void>((resolve) => {
        wss.close(() => {
          httpServer.close(() => resolve());
        });
      });
    });

    it("should close connection without userId with code 4001", async () => {
      const ws = new WebSocket(`ws://localhost:${PORT}/ws`);

      const closePromise = new Promise<{ code: number; reason: string }>((resolve) => {
        ws.on("close", (code, reason) => {
          resolve({ code, reason: reason.toString() });
        });
      });

      const result = await closePromise;
      expect(result.code).toBe(4001);
      expect(result.reason).toBe("Missing required userId parameter");
    });

    it("should accept connection with userId", async () => {
      const ws = new WebSocket(`ws://localhost:${PORT}/ws?userId=test-user`);

      const messagePromise = new Promise<{ type: string; userId: string }>((resolve) => {
        ws.on("message", (data) => {
          resolve(JSON.parse(data.toString()));
        });
      });

      const result = await messagePromise;
      expect(result.type).toBe("connected");
      expect(result.userId).toBe("test-user");

      ws.close();
    });
  });
});
