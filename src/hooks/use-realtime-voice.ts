"use client";

/**
 * useRealtimeVoice - Hook for managing realtime voice conversations
 *
 * Handles:
 * - WebSocket connection to backend relay server
 * - Microphone capture via AudioWorklet (PCM16 at 24kHz)
 * - Audio playback from AI responses
 * - Transcript accumulation for display
 * - Evaluation request after session ends
 * - Proper cleanup on unmount
 */

import { useState, useCallback, useRef, useEffect } from "react";
import { AudioPlayer, base64EncodeAudio } from "@/lib/audio";
import type {
  ConnectionStatus,
  EvaluationResult,
  TranscriptTurn,
} from "@/types";

// ============================================================================
// Types
// ============================================================================

export interface UseRealtimeVoiceOptions {
  userId: string;
  scenarioId?: string;
  assignmentId?: string;
  onTranscript?: (turn: TranscriptTurn) => void;
}

export interface UseRealtimeVoiceReturn {
  isConnected: boolean;
  isListening: boolean;
  sessionId: string | null;
  evaluation: EvaluationResult | null;
  connectionStatus: ConnectionStatus;
  error: string | null;
  connect: () => Promise<void>;
  startListening: () => Promise<void>;
  stopListening: () => void;
  disconnect: () => void;
  requestEvaluation: () => Promise<void>;
}

interface RealtimeMessageEvent {
  type: string;
  session_id?: string;
  delta?: string;
  transcript?: string;
  error?: {
    type: string;
    code: string;
    message: string;
  };
}

// ============================================================================
// Hook Implementation
// ============================================================================

export function useRealtimeVoice(
  options: UseRealtimeVoiceOptions
): UseRealtimeVoiceReturn {
  const { userId, scenarioId, assignmentId, onTranscript } = options;

  // State
  const [isConnected, setIsConnected] = useState(false);
  const [isListening, setIsListening] = useState(false);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [evaluation, setEvaluation] = useState<EvaluationResult | null>(null);
  const [connectionStatus, setConnectionStatus] =
    useState<ConnectionStatus>("disconnected");
  const [error, setError] = useState<string | null>(null);

  // Refs for resources that need cleanup
  const wsRef = useRef<WebSocket | null>(null);
  const audioPlayerRef = useRef<AudioPlayer | null>(null);
  const mediaStreamRef = useRef<MediaStream | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const workletNodeRef = useRef<AudioWorkletNode | null>(null);
  const isListeningRef = useRef(false);
  const turnIndexRef = useRef(0);
  const currentTranscriptRef = useRef("");

  // Keep isListeningRef in sync with state
  useEffect(() => {
    isListeningRef.current = isListening;
  }, [isListening]);

  // ============================================================================
  // WebSocket Message Handler
  // ============================================================================

  const handleMessage = useCallback(
    (event: RealtimeMessageEvent) => {
      switch (event.type) {
        case "session.id":
          if (event.session_id) {
            setSessionId(event.session_id);
          }
          break;

        case "response.audio.delta":
          if (event.delta && audioPlayerRef.current) {
            audioPlayerRef.current.queueBase64Audio(event.delta);
          }
          break;

        case "response.audio_transcript.delta":
          if (event.delta) {
            currentTranscriptRef.current += event.delta;
          }
          break;

        case "response.audio_transcript.done":
          // Finalize the assistant message
          if (currentTranscriptRef.current && onTranscript) {
            const turn: TranscriptTurn = {
              id: `assistant_${Date.now()}`,
              session_id: "",
              role: "assistant",
              content: currentTranscriptRef.current,
              turn_index: turnIndexRef.current++,
              created_at: new Date().toISOString(),
            };
            onTranscript(turn);
            currentTranscriptRef.current = "";
          }
          break;

        case "conversation.item.input_audio_transcription.completed":
          // User speech transcript
          if (event.transcript && onTranscript) {
            const turn: TranscriptTurn = {
              id: `user_${Date.now()}`,
              session_id: "",
              role: "user",
              content: event.transcript,
              turn_index: turnIndexRef.current++,
              created_at: new Date().toISOString(),
            };
            onTranscript(turn);
          }
          break;

        case "input_audio_buffer.speech_started":
          // User started speaking - stop AI playback
          audioPlayerRef.current?.stopPlayback();
          break;

        case "error":
          console.error("Realtime API error:", event.error);
          setError(event.error?.message ?? "Unknown error");
          setConnectionStatus("disconnected");
          break;

        default:
          // Log other events for debugging
          if (process.env.NODE_ENV === "development") {
            console.log("Realtime event:", event.type);
          }
      }
    },
    [onTranscript]
  );

  // ============================================================================
  // Connection Management
  // ============================================================================

  const connect = useCallback(async () => {
    // Clear previous state
    setError(null);
    setSessionId(null);
    setEvaluation(null);
    setConnectionStatus("connecting");
    turnIndexRef.current = 0;
    currentTranscriptRef.current = "";

    // Build WebSocket URL
    const wsUrl =
      process.env.NEXT_PUBLIC_WS_URL ?? "ws://localhost:3004";
    const params = new URLSearchParams();
    params.set("userId", userId);
    params.set("model", "phone");
    params.set("record", "true");
    if (scenarioId) {
      params.set("scenario_id", scenarioId);
    }
    if (assignmentId) {
      params.set("assignment_id", assignmentId);
    }

    const url = `${wsUrl}/ws?${params.toString()}`;

    try {
      // Initialize audio player
      audioPlayerRef.current = new AudioPlayer({
        sampleRate: 24000,
        maxQueueSize: 150,
      });
      await audioPlayerRef.current.initialize();

      // Connect WebSocket
      const ws = new WebSocket(url);
      wsRef.current = ws;

      ws.onopen = () => {
        setIsConnected(true);
        setConnectionStatus("connected");
      };

      ws.onclose = () => {
        setIsConnected(false);
        setConnectionStatus("disconnected");
      };

      ws.onerror = (wsError) => {
        console.error("WebSocket error:", wsError);
        setError("WebSocket connection error");
        setConnectionStatus("disconnected");
      };

      ws.onmessage = (msgEvent) => {
        try {
          const data = JSON.parse(msgEvent.data) as RealtimeMessageEvent;
          handleMessage(data);
        } catch (parseError) {
          console.error("Failed to parse WebSocket message:", parseError);
        }
      };
    } catch (connectError) {
      const errorMessage =
        connectError instanceof Error
          ? connectError.message
          : "Connection failed";
      setError(errorMessage);
      setConnectionStatus("disconnected");
      throw connectError;
    }
  }, [userId, scenarioId, assignmentId, handleMessage]);

  // ============================================================================
  // Microphone Capture
  // ============================================================================

  const startListening = useCallback(async () => {
    if (!wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) {
      setError("Not connected to realtime API");
      return;
    }

    try {
      // Get microphone access
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          sampleRate: 24000,
          channelCount: 1,
          echoCancellation: true,
          noiseSuppression: true,
        },
      });
      mediaStreamRef.current = stream;

      // Create audio context
      const audioContext = new AudioContext({ sampleRate: 24000 });
      audioContextRef.current = audioContext;

      // Load AudioWorklet processor
      await audioContext.audioWorklet.addModule("/audio-processor.js");

      // Create source from microphone
      const source = audioContext.createMediaStreamSource(stream);

      // Create worklet node
      const workletNode = new AudioWorkletNode(audioContext, "audio-processor");
      workletNodeRef.current = workletNode;

      // Handle audio data from worklet
      workletNode.port.onmessage = (event: MessageEvent<{ type: string; pcm16: Int16Array }>) => {
        if (!isListeningRef.current) return;
        if (event.data.type !== "audio") return;

        const { pcm16 } = event.data;
        const base64 = base64EncodeAudio(pcm16);

        // Send to OpenAI via relay
        if (wsRef.current?.readyState === WebSocket.OPEN) {
          wsRef.current.send(
            JSON.stringify({
              type: "input_audio_buffer.append",
              audio: base64,
            })
          );
        }
      };

      // Connect the audio graph
      source.connect(workletNode);
      workletNode.connect(audioContext.destination);

      setIsListening(true);
      setError(null);
    } catch (micError) {
      const errorMessage =
        micError instanceof Error
          ? micError.message
          : "Failed to start microphone";
      console.error("Failed to start microphone:", micError);
      setError(errorMessage);
    }
  }, []);

  const stopListening = useCallback(() => {
    setIsListening(false);

    // Stop media stream tracks
    if (mediaStreamRef.current) {
      mediaStreamRef.current.getTracks().forEach((track) => track.stop());
      mediaStreamRef.current = null;
    }

    // Disconnect and clean up worklet node
    if (workletNodeRef.current) {
      workletNodeRef.current.disconnect();
      workletNodeRef.current = null;
    }

    // Close audio context
    if (audioContextRef.current) {
      audioContextRef.current.close().catch(console.error);
      audioContextRef.current = null;
    }
  }, []);

  // ============================================================================
  // Disconnect and Cleanup
  // ============================================================================

  const disconnect = useCallback(() => {
    stopListening();

    // Close WebSocket
    if (wsRef.current) {
      wsRef.current.close();
      wsRef.current = null;
    }

    // Close audio player
    if (audioPlayerRef.current) {
      audioPlayerRef.current.close().catch(console.error);
      audioPlayerRef.current = null;
    }

    setIsConnected(false);
    setConnectionStatus("disconnected");
    // Don't clear sessionId - keep it for evaluation
  }, [stopListening]);

  // ============================================================================
  // Evaluation
  // ============================================================================

  const requestEvaluation = useCallback(async () => {
    if (!sessionId) {
      setError("No session ID available for evaluation");
      return;
    }

    try {
      const baseUrl =
        process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3003";
      const response = await fetch(
        `${baseUrl}/api/sessions/${sessionId}/evaluate`,
        {
          method: "POST",
        }
      );

      if (!response.ok) {
        throw new Error("Evaluation request failed");
      }

      const data = (await response.json()) as { ok: boolean; data?: EvaluationResult };
      if (data.ok && data.data) {
        setEvaluation(data.data);
      }
    } catch (evalError) {
      const errorMessage =
        evalError instanceof Error
          ? evalError.message
          : "Evaluation request failed";
      console.error("Evaluation failed:", evalError);
      setError(errorMessage);
    }
  }, [sessionId]);

  // ============================================================================
  // Cleanup on Unmount
  // ============================================================================

  useEffect(() => {
    return () => {
      // Clean up all resources
      if (wsRef.current) {
        wsRef.current.close();
      }

      if (mediaStreamRef.current) {
        mediaStreamRef.current.getTracks().forEach((track) => track.stop());
      }

      if (workletNodeRef.current) {
        workletNodeRef.current.disconnect();
      }

      if (audioContextRef.current) {
        audioContextRef.current.close().catch(() => {
          // Ignore errors during cleanup
        });
      }

      if (audioPlayerRef.current) {
        audioPlayerRef.current.close().catch(() => {
          // Ignore errors during cleanup
        });
      }
    };
  }, []);

  // ============================================================================
  // Return Hook Interface
  // ============================================================================

  return {
    isConnected,
    isListening,
    sessionId,
    evaluation,
    connectionStatus,
    error,
    connect,
    startListening,
    stopListening,
    disconnect,
    requestEvaluation,
  };
}
