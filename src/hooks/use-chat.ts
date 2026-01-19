"use client";

import { useState, useCallback, useRef, useEffect } from "react";
import { ChatMessage, EvaluationResult, ApiResponse } from "@/types";

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
  session_id: string;
  initial_message: string;
}

interface MessageResponse {
  response: string;
}

interface EvaluationResponse {
  evaluation: string;
  transcript_turns: Array<{
    role: "user" | "assistant";
    content: string;
    turn_index: number;
  }>;
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
      const response = await fetch("/api/sessions", {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-user-id": userId },
        body: JSON.stringify({ scenario_id: scenarioId, assignment_id: assignmentId }),
        signal: abortControllerRef.current.signal,
      });

      const data: ApiResponse<SessionResponse> = await response.json();

      if (!data.ok) {
        throw new Error(data.error.message);
      }

      setSessionId(data.data.session_id);
      setMessages([
        {
          role: "assistant",
          content: data.data.initial_message,
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

      // Optimistic update
      const userMessage: ChatMessage = {
        role: "user",
        content,
        timestamp: new Date(),
      };
      setMessages((prev) => [...prev, userMessage]);

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

        setMessages((prev) => [
          ...prev,
          {
            role: "assistant",
            content: data.data.response,
            timestamp: new Date(),
          },
        ]);
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

      const data: ApiResponse<EvaluationResponse> = await response.json();

      if (!data.ok) {
        throw new Error(data.error.message);
      }

      setEvaluation({
        evaluation: data.data.evaluation,
        transcript_turns: data.data.transcript_turns.map((turn) => ({
          id: `turn-${turn.turn_index}`,
          session_id: sessionId,
          role: turn.role,
          content: turn.content,
          turn_index: turn.turn_index,
          created_at: new Date().toISOString(),
        })),
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
