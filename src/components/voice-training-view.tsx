"use client";

import { useState, useCallback, useEffect, useRef } from "react";
import Image from "next/image";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import {
  LiveKitRoom,
  RoomAudioRenderer,
  useVoiceAssistant,
  BarVisualizer,
  VoiceAssistantControlBar,
  useConnectionState,
  useLocalParticipant,
} from "@livekit/components-react";
import "@livekit/components-styles";
import type { ConnectionState } from "livekit-client";
import type { Assignment, ConnectionStatus, EvaluationResult } from "@/types";
import SessionFeedback from "./session-feedback";
import { useAudioRecorder } from "@/hooks/use-audio-recorder";

// Shared constants matching the agent's AGENT_ATTRS
const AGENT_ATTRS = {
  SESSION_ID: "session.id",
  ERROR: "error",
} as const;

interface VoiceTrainingViewProps {
  assignment: Assignment | null;
  userId: string;
  onComplete: () => void;
}

/**
 * Map LiveKit ConnectionState to our ConnectionStatus type
 */
function toConnectionStatus(state: ConnectionState): ConnectionStatus {
  switch (state) {
    case "connected":
      return "connected";
    case "connecting":
    case "reconnecting":
      return "connecting";
    case "disconnected":
    default:
      return "disconnected";
  }
}

function ConnectionStatusIndicator({ status, agentState }: { status: ConnectionStatus; agentState?: string }) {
  // When agentState is provided, refine "connected" to show agent readiness
  const isAgentReady = agentState === "listening" || agentState === "speaking" || agentState === "thinking";

  let config;
  if (status === "connected" && agentState !== undefined && !isAgentReady) {
    config = { color: "bg-yellow-500 animate-pulse", text: "Preparing simulator..." };
  } else if (status === "connected" && isAgentReady) {
    config = { color: "bg-green-500", text: "Ready" };
  } else {
    const statusConfig = {
      disconnected: { color: "bg-gray-500", text: "Disconnected" },
      connecting: { color: "bg-yellow-500 animate-pulse", text: "Connecting..." },
      connected: { color: "bg-green-500", text: "Connected" },
      error: { color: "bg-red-500", text: "Error" },
    };
    config = statusConfig[status];
  }

  return (
    <div className="flex items-center gap-2">
      <div className={`w-2 h-2 rounded-full ${config.color}`} />
      <span className="text-sm text-gray-400 font-marfa">{config.text}</span>
    </div>
  );
}

/**
 * Evaluation retry logic: transcripts may still be persisting after disconnect.
 * Polls every 1.5s (fast) for transcripts, then waits for LLM evaluation.
 * Total max wait: ~50s. Agent transcript persistence can take 20-30s.
 *
 * onPhase callback lets the UI show progress with elapsed time.
 */
async function requestEvaluationWithRetry(
  sessionId: string,
  userId: string,
  onPhase?: (phase: "saving" | "evaluating", elapsedSec?: number) => void,
): Promise<EvaluationResult> {
  const initialDelayMs = 3000;
  const maxRetries = 30;
  const retryDelayMs = 1500;
  const startTime = Date.now();

  const elapsed = () => Math.round((Date.now() - startTime) / 1000);

  // Brief initial wait for agent to detect disconnect
  onPhase?.("saving", 0);
  await new Promise((resolve) => setTimeout(resolve, initialDelayMs));

  for (let attempt = 0; attempt < maxRetries; attempt++) {
    onPhase?.("saving", elapsed());

    const response = await fetch(
      `/api/sessions/${sessionId}/evaluate`,
      {
        method: "POST",
        headers: { "x-user-id": userId },
      }
    );

    // 425 = transcripts not yet persisted, wait and retry
    if (response.status === 425 && attempt < maxRetries - 1) {
      await new Promise((resolve) => setTimeout(resolve, retryDelayMs));
      continue;
    }

    if (!response.ok) {
      const errorData = await response.json().catch(() => null);
      throw new Error(errorData?.error?.message || "Evaluation request failed");
    }

    // Transcripts found — now generating feedback (LLM call, ~10-15s)
    onPhase?.("evaluating", elapsed());
    const data = await response.json();
    if (data.ok && data.data) {
      return { evaluation: data.data.evaluation?.evaluation ?? data.data.evaluation };
    }
  }

  throw new Error("Feedback is still being prepared. Go back to the dashboard and select 'Feedback' from the session menu.");
}

/**
 * Inner component rendered inside <LiveKitRoom> to access LiveKit hooks.
 */
function VoiceSessionUI({
  sessionId,
  evaluation,
  evaluating,
  evalPhase,
  error,
  isFreePractice,
  scenarioTitle,
  onSessionId,
  onError,
  onGetFeedback,
  onStopRecording,
}: {
  sessionId: string | null;
  evaluation: EvaluationResult | null;
  evaluating: boolean;
  evalPhase: "saving" | "evaluating";
  error: string | null;
  isFreePractice: boolean;
  scenarioTitle: string;
  onSessionId: (id: string) => void;
  onError: (msg: string) => void;
  onGetFeedback: () => void;
  onStopRecording: (fn: () => Promise<Blob | null>) => void;
}) {
  const { state: agentState, audioTrack, agentAttributes } = useVoiceAssistant();
  const { microphoneTrack } = useLocalParticipant();
  const lkConnectionState = useConnectionState();
  const connectionStatus = toConnectionStatus(lkConnectionState);
  const isConnected = connectionStatus === "connected";

  // Extract MediaStreamTracks for recording
  const localMSTrack = microphoneTrack?.track?.mediaStreamTrack ?? null;
  const remoteMSTrack = audioTrack?.publication?.track?.mediaStreamTrack ?? null;

  // Recording: starts when both tracks available, stops via stopRecording
  const { stopRecording } = useAudioRecorder({
    localTrack: localMSTrack,
    remoteTrack: remoteMSTrack,
    enabled: isConnected,
  });

  // Pass stopRecording to parent so it can stop before clearing connection
  useEffect(() => {
    onStopRecording(stopRecording);
  }, [stopRecording, onStopRecording]);

  // Read session ID from agent participant attributes
  useEffect(() => {
    const sid = agentAttributes?.[AGENT_ATTRS.SESSION_ID];
    if (sid && !sessionId) {
      onSessionId(sid);
    }

    const agentError = agentAttributes?.[AGENT_ATTRS.ERROR];
    if (agentError) {
      onError(agentError);
    }
  }, [agentAttributes, sessionId, onSessionId, onError]);

  return (
    <>
      {/* Connection Status Bar */}
      <div className="px-4 py-2 border-b border-gray-700 flex items-center justify-between">
        <ConnectionStatusIndicator status={connectionStatus} agentState={agentState} />
        <div className="flex items-center gap-2">
          {error && (
            <span className="text-red-400 text-sm font-marfa">{error}</span>
          )}
        </div>
      </div>

      {/* Session Area */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {!isConnected && !evaluation && (
          <div className="text-center py-8">
            <p className="text-gray-400 font-marfa">
              Connecting to voice session...
            </p>
          </div>
        )}

        {isConnected && !evaluation && (
          <div className="flex flex-col items-center justify-center h-full gap-6">
            {/* Audio Visualizer */}
            <div className="w-full max-w-md h-32 bg-gray-800 rounded-lg overflow-hidden">
              <BarVisualizer
                state={agentState}
                barCount={5}
                trackRef={audioTrack}
                className="w-full h-full"
              />
            </div>

            <p className="text-white font-marfa font-medium text-lg">
              {agentState === "speaking"
                ? "Caller is speaking..."
                : agentState === "thinking"
                  ? "Caller is thinking..."
                  : agentState === "listening"
                    ? "Your turn to speak"
                    : "Preparing roleplay simulator..."}
            </p>
            <p className="text-gray-400 font-marfa text-sm">
              {agentState === "listening" || agentState === "speaking" || agentState === "thinking"
                ? (isFreePractice ? "Free Practice" : scenarioTitle)
                : "This usually takes a few seconds"}
            </p>
          </div>
        )}
      </div>

      {/* Controls — End Session button is primary, mic toggle is secondary */}
      <div className="p-4 border-t border-gray-700 space-y-3">
        {isConnected && !evaluating && (
          <button
            onClick={onGetFeedback}
            className="w-full bg-brand-orange hover:bg-brand-orange-hover text-white py-3 rounded-lg
                       font-marfa font-medium text-lg"
          >
            End Session &amp; Get Feedback
          </button>
        )}
        {evaluating && (
          <div className="text-center py-3">
            <span className="text-gray-400 font-marfa animate-pulse">
              {evalPhase === "saving" ? "Saving session..." : "Generating feedback..."}
            </span>
          </div>
        )}

        {isConnected && !evaluating && (
          <div className="flex justify-center opacity-70">
            <VoiceAssistantControlBar />
          </div>
        )}
      </div>

      {/* LiveKit audio renderer (plays agent audio via WebRTC) */}
      <RoomAudioRenderer />
    </>
  );
}

function VoiceTrainingHeader({
  title,
  isFreePractice,
  onExit,
}: {
  title: string;
  isFreePractice: boolean;
  onExit: () => void;
}) {
  return (
    <header className="flex items-center justify-between p-4 border-b border-gray-700">
      <Image
        src="/protocall-logo.svg"
        alt="Protocall"
        width={120}
        height={32}
        className="h-8 w-auto"
      />
      <div className="text-center flex-1 mx-4">
        <h2 className="text-white font-marfa font-medium">
          {isFreePractice ? "Free Practice" : title}
        </h2>
        <span className="text-xs text-gray-400">Voice Training</span>
      </div>
      <button
        onClick={onExit}
        className="text-gray-400 hover:text-white text-sm font-marfa"
      >
        Exit
      </button>
    </header>
  );
}

export default function VoiceTrainingView({
  assignment,
  userId,
  onComplete,
}: VoiceTrainingViewProps) {
  const [token, setToken] = useState<string | null>(null);
  const [serverUrl, setServerUrl] = useState<string | null>(null);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [evaluation, setEvaluation] = useState<EvaluationResult | null>(null);
  const [evaluating, setEvaluating] = useState(false);
  const [evalPhase, setEvalPhase] = useState<"saving" | "evaluating">("saving");
  const [evalElapsed, setEvalElapsed] = useState(0);
  const [connectionStatus, setConnectionStatus] = useState<ConnectionStatus>("disconnected");
  const [error, setError] = useState<string | null>(null);
  const evaluationTriggered = useRef(false);
  const connectionAttemptRef = useRef(0);
  const stopRecordingRef = useRef<(() => Promise<Blob | null>) | null>(null);

  const scenarioId = assignment?.scenarioId;
  const scenarioTitle = assignment?.scenarioTitle || "Untitled";
  const isFreePractice = !scenarioId;

  const handleConnect = useCallback(async () => {
    if (assignment && !scenarioId) {
      console.error("[Voice View] Cannot connect: assignment exists but scenarioId is missing!");
      return;
    }

    connectionAttemptRef.current += 1;
    setError(null);
    setSessionId(null);
    setEvaluation(null);
    setConnectionStatus("connecting");
    evaluationTriggered.current = false;

    try {
      const response = await fetch("/api/livekit/token", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-user-id": userId,
        },
        body: JSON.stringify({
          assignmentId: assignment?.id,
          scenarioId,
        }),
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error?.message || "Failed to get token");
      }

      const data = await response.json();
      if (data.ok && data.data) {
        setToken(data.data.token);
        setServerUrl(data.data.serverUrl);
      } else {
        throw new Error("Invalid token response");
      }
    } catch (connectError) {
      setError(connectError instanceof Error ? connectError.message : "Connection failed");
      setConnectionStatus("disconnected");
    }
  }, [userId, scenarioId, assignment]);

  // Clear LiveKit connection state (does NOT trigger evaluation)
  const clearConnection = useCallback(() => {
    setToken(null);
    setServerUrl(null);
    setConnectionStatus("disconnected");
  }, []);

  // Fire-and-forget recording upload. Runs during the 3s "saving" delay.
  const uploadRecording = useCallback(
    (blob: Blob, sid: string) => {
      const formData = new FormData();
      formData.append("file", blob, `${sid}.webm`);
      formData.append("sessionId", sid);
      fetch("/api/recordings/upload", {
        method: "POST",
        headers: { "x-user-id": userId },
        body: formData,
      }).catch((err) => console.warn("[Recording] Upload failed:", err));
    },
    [userId]
  );

  // Stop recording and fire-and-forget upload before clearing connection
  const stopAndUploadRecording = useCallback(async () => {
    try {
      const blob = await stopRecordingRef.current?.();
      if (blob && sessionId) {
        uploadRecording(blob, sessionId);
      }
    } catch (err) {
      console.warn("[Recording] Stop failed:", err);
    }
  }, [sessionId, uploadRecording]);

  // Auto-evaluate: any disconnect path triggers evaluation if we have a session
  const triggerEvaluation = useCallback(async () => {
    if (!sessionId || evaluationTriggered.current) return;
    evaluationTriggered.current = true;
    setEvaluating(true);
    setEvalPhase("saving");
    setEvalElapsed(0);

    try {
      const result = await requestEvaluationWithRetry(sessionId, userId, (phase, elapsed) => {
        setEvalPhase(phase);
        if (elapsed !== undefined) setEvalElapsed(elapsed);
      });
      setEvaluation(result);
    } catch (evalError) {
      setError(evalError instanceof Error ? evalError.message : "Evaluation failed");
    } finally {
      setEvaluating(false);
    }
  }, [sessionId, userId]);

  // Called when LiveKit room disconnects (user clicked LiveKit disconnect, network drop, etc.)
  // If we never got a session ID (agent didn't join), auto-retry up to 3 times.
  const handleRoomDisconnected = useCallback(async () => {
    if (!sessionId && connectionAttemptRef.current < 3) {
      console.log(`[Voice] Agent didn't join, auto-retrying (attempt ${connectionAttemptRef.current + 1}/3)...`);
      clearConnection();
      // Brief delay before retry
      await new Promise((resolve) => setTimeout(resolve, 2000));
      handleConnect();
      return;
    }

    await stopAndUploadRecording();
    clearConnection();
    triggerEvaluation();
  }, [sessionId, stopAndUploadRecording, clearConnection, triggerEvaluation, handleConnect]);

  // "End Session & Get Feedback" button — explicit user action
  const handleGetFeedback = useCallback(async () => {
    await stopAndUploadRecording();
    clearConnection();
    triggerEvaluation();
  }, [stopAndUploadRecording, clearConnection, triggerEvaluation]);

  const handleExit = () => {
    clearConnection();
    // If session exists, evaluate in background so it shows up in history
    if (sessionId && !evaluationTriggered.current) {
      triggerEvaluation();
    } else {
      onComplete();
    }
  };

  // Post-session evaluation modal (shown after disconnect + evaluation)
  if (evaluation && !token) {
    return (
      <div className="flex flex-col h-screen bg-brand-navy">
        <VoiceTrainingHeader title={scenarioTitle} isFreePractice={isFreePractice} onExit={handleExit} />

        <div className="flex-1 overflow-y-auto p-4">
          <div className="bg-white rounded-lg max-w-2xl mx-auto p-6">
            <h2 className="text-xl font-bold text-gray-800 font-marfa mb-4">Session Feedback</h2>

            <div className="prose prose-sm max-w-none prose-headings:text-gray-800 prose-p:text-gray-700 prose-li:text-gray-700 prose-strong:text-gray-800">
              <ReactMarkdown remarkPlugins={[remarkGfm]}>
                {evaluation.evaluation}
              </ReactMarkdown>
            </div>

            {sessionId && (
              <SessionFeedback sessionId={sessionId} userId={userId} variant="light" mode="phone" />
            )}

            <div className="mt-6 flex justify-end">
              <button
                onClick={onComplete}
                className="bg-brand-orange hover:bg-brand-orange-hover text-white px-6 py-2 rounded-lg font-marfa font-medium"
              >
                Back to Dashboard
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // Pre-connection UI (or evaluating state)
  if (!token || !serverUrl) {
    return (
      <div className="flex flex-col h-screen bg-brand-navy">
        <VoiceTrainingHeader title={scenarioTitle} isFreePractice={isFreePractice} onExit={handleExit} />

        {/* Connection Status Bar */}
        <div className="px-4 py-2 border-b border-gray-700 flex items-center justify-between">
          <ConnectionStatusIndicator status={connectionStatus} />
          {error && (
            <span className="text-red-400 text-sm font-marfa">{error}</span>
          )}
        </div>

        {evaluating ? (
          <div className="flex-1 flex items-center justify-center">
            <div className="text-center">
              <p className="text-gray-400 font-marfa animate-pulse text-lg">
                {evalPhase === "saving" ? "Saving session..." : "Generating feedback..."}
              </p>
              <p className="text-gray-500 font-marfa text-sm mt-2">
                {evalPhase === "saving"
                  ? "Waiting for voice agent to finish processing"
                  : "This may take a few moments"}
              </p>
              {evalElapsed > 5 && (
                <p className="text-gray-400 font-marfa text-base mt-3 tabular-nums">
                  {evalElapsed}s elapsed
                </p>
              )}
            </div>
          </div>
        ) : error && sessionId ? (
          /* Evaluation failed — show actionable message instead of "Start Session" */
          <>
            <div className="flex-1 flex items-center justify-center">
              <div className="text-center max-w-md px-4">
                <p className="text-yellow-400 font-marfa text-lg mb-2">
                  {error}
                </p>
                <p className="text-gray-500 font-marfa text-sm">
                  Your session was saved. Feedback will be available from the dashboard shortly.
                </p>
              </div>
            </div>
            <div className="p-4 border-t border-gray-700">
              <button
                onClick={onComplete}
                className="w-full bg-brand-orange hover:bg-brand-orange-hover text-white
                           py-3 rounded-lg font-marfa font-medium"
              >
                Back to Dashboard
              </button>
            </div>
          </>
        ) : (
          <>
            {/* Connect prompt */}
            <div className="flex-1 flex items-center justify-center">
              <div className="text-center">
                <p className="text-gray-400 font-marfa mb-6">
                  Click &quot;Start Session&quot; to begin your voice training
                </p>
              </div>
            </div>

            {/* Start button */}
            <div className="p-4 border-t border-gray-700">
              <button
                onClick={handleConnect}
                disabled={connectionStatus === "connecting"}
                className="w-full bg-brand-orange hover:bg-brand-orange-hover text-white
                           py-3 rounded-lg font-marfa font-medium
                           disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {connectionStatus === "connecting" ? "Connecting..." : "Start Session"}
              </button>
            </div>
          </>
        )}
      </div>
    );
  }

  // Connected UI - LiveKit room
  return (
    <div className="flex flex-col h-screen bg-brand-navy">
      <VoiceTrainingHeader title={scenarioTitle} isFreePractice={isFreePractice} onExit={handleExit} />

      <LiveKitRoom
        token={token}
        serverUrl={serverUrl}
        connect={true}
        audio={true}
        video={false}
        onDisconnected={handleRoomDisconnected}
        className="flex flex-col flex-1"
      >
        <VoiceSessionUI
          sessionId={sessionId}
          evaluation={evaluation}
          evaluating={evaluating}
          evalPhase={evalPhase}
          error={error}
          isFreePractice={isFreePractice}
          scenarioTitle={scenarioTitle}
          onSessionId={setSessionId}
          onError={setError}
          onGetFeedback={handleGetFeedback}
          onStopRecording={(fn) => { stopRecordingRef.current = fn; }}
        />
      </LiveKitRoom>
    </div>
  );
}
