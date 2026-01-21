"use client";

import { useState, useCallback, useRef, useEffect } from "react";
import { ChatMessage, EvaluationResult, ApiResponse } from "@/types";

// Maximum number of messages to keep in memory to prevent unbounded growth
const MAX_MESSAGES = 200;

interface UseChatOptions {
  userId: string;
  scenarioId?: string;
  assignmentId?: string;
}

interface UseChatReturn {
  sessionId: string | null;
  messages: ChatMessage[];
  isLoading: boolean;
  evaluation: EvaluationResult | null;
  error: string | null;
  initSession: () => Promise<void>;
  sendMessage: (content: string) => Promise<void>;
  getEvaluation: () => Promise<void>;
  reset: () => void;
}

interface SessionResponse {
  id: string;
  transcript: Array<{ role: string; content: string }>;
}

interface MessageResponse {
  response: string;
}

interface EvaluateApiResponse {
  evaluation: {
    id?: string;
    evaluation: string;
    grade: string | null;
    numericScore: number;
  };
  session: {
    id: string;
    status: string;
    endedAt: string;
  };
}

export function useChat({
  userId,
  scenarioId,
  assignmentId,
}: UseChatOptions): UseChatReturn {
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [evaluation, setEvaluation] = useState<EvaluationResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  const abortControllerRef = useRef<AbortController | null>(null);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      abortControllerRef.current?.abort();
    };
  }, []);

  const initSession = useCallback(async () => {
    setIsLoading(true);
    setError(null);

    abortControllerRef.current?.abort();
    abortControllerRef.current = new AbortController();

    try {
      // Build request body based on session type (discriminated union)
      const requestBody = assignmentId
        ? { type: "assignment", assignmentId }
        : { type: "free_practice", userId, modelType: "chat" as const, scenarioId };

      const response = await fetch("/api/sessions", {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-user-id": userId },
        body: JSON.stringify(requestBody),
        signal: abortControllerRef.current.signal,
      });

      const data: ApiResponse<SessionResponse> = await response.json();

      if (!data.ok) {
        throw new Error(data.error.message);
      }

      setSessionId(data.data.id);
      // Get initial message from transcript (first assistant message)
      const initialMessage = data.data.transcript?.find(t => t.role === "assistant")?.content || "";
      setMessages([
        {
          role: "assistant",
          content: initialMessage,
          timestamp: new Date(),
        },
      ]);
    } catch (err) {
      if (err instanceof Error && err.name === "AbortError") {
        return;
      }
      const errorMessage =
        err instanceof Error ? err.message : "Failed to start session";
      setError(errorMessage);
    } finally {
      setIsLoading(false);
    }
  }, [userId, scenarioId, assignmentId]);

  const sendMessage = useCallback(
    async (content: string) => {
      if (!sessionId || !content.trim()) return;

      setIsLoading(true);
      setError(null);

      // Optimistic update with size limit
      const userMessage: ChatMessage = {
        role: "user",
        content,
        timestamp: new Date(),
      };
      setMessages((prev) => {
        const updated = [...prev, userMessage];
        // Keep only the most recent messages if we exceed the limit
        return updated.length > MAX_MESSAGES ? updated.slice(-MAX_MESSAGES) : updated;
      });

      abortControllerRef.current?.abort();
      abortControllerRef.current = new AbortController();

      try {
        const response = await fetch(`/api/sessions/${sessionId}/message`, {
          method: "POST",
          headers: { "Content-Type": "application/json", "x-user-id": userId },
          body: JSON.stringify({ content }),
          signal: abortControllerRef.current.signal,
        });

        const data: ApiResponse<MessageResponse> = await response.json();

        if (!data.ok) {
          throw new Error(data.error.message);
        }

        setMessages((prev) => {
          const assistantMessage: ChatMessage = {
            role: "assistant",
            content: data.data.response,
            timestamp: new Date(),
          };
          const updated = [...prev, assistantMessage];
          // Keep only the most recent messages if we exceed the limit
          return updated.length > MAX_MESSAGES ? updated.slice(-MAX_MESSAGES) : updated;
        });
      } catch (err) {
        if (err instanceof Error && err.name === "AbortError") {
          return;
        }
        // Rollback optimistic update
        setMessages((prev) =>
          prev.map((msg, idx) =>
            idx === prev.length - 1 && msg.role === "user"
              ? { ...msg, failed: true }
              : msg
          )
        );
        const errorMessage =
          err instanceof Error ? err.message : "Failed to send message";
        setError(errorMessage);
      } finally {
        setIsLoading(false);
      }
    },
    [userId, sessionId]
  );

  const getEvaluation = useCallback(async () => {
    if (!sessionId) return;

    setIsLoading(true);
    setError(null);

    abortControllerRef.current?.abort();
    abortControllerRef.current = new AbortController();

    try {
      const response = await fetch(`/api/sessions/${sessionId}/evaluate`, {
        method: "POST",
        headers: { "x-user-id": userId },
        signal: abortControllerRef.current.signal,
      });

      const data: ApiResponse<EvaluateApiResponse> = await response.json();

      if (!data.ok) {
        throw new Error(data.error.message);
      }

      // Set evaluation with full markdown content
      setEvaluation({
        evaluation: data.data.evaluation.evaluation,
      });
    } catch (err) {
      if (err instanceof Error && err.name === "AbortError") {
        return;
      }
      const errorMessage =
        err instanceof Error ? err.message : "Failed to get evaluation";
      setError(errorMessage);
    } finally {
      setIsLoading(false);
    }
  }, [userId, sessionId]);

  const reset = useCallback(() => {
    abortControllerRef.current?.abort();
    setSessionId(null);
    setMessages([]);
    setEvaluation(null);
    setError(null);
    setIsLoading(false);
  }, []);

  return {
    sessionId,
    messages,
    isLoading,
    evaluation,
    error,
    initSession,
    sendMessage,
    getEvaluation,
    reset,
  };
}
