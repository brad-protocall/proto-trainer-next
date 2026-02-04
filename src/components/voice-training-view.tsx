"use client";

import { useState, useCallback, useEffect } from "react";
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
} from "@livekit/components-react";
import "@livekit/components-styles";
import type { ConnectionState } from "livekit-client";
import type { Assignment, ConnectionStatus, EvaluationResult } from "@/types";

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

function ConnectionStatusIndicator({ status }: { status: ConnectionStatus }) {
  const statusConfig = {
    disconnected: { color: "bg-gray-500", text: "Disconnected" },
    connecting: { color: "bg-yellow-500 animate-pulse", text: "Connecting..." },
    connected: { color: "bg-green-500", text: "Connected" },
    error: { color: "bg-red-500", text: "Error" },
  };

  const config = statusConfig[status];

  return (
    <div className="flex items-center gap-2">
      <div className={`w-2 h-2 rounded-full ${config.color}`} />
      <span className="text-sm text-gray-400 font-marfa">{config.text}</span>
    </div>
  );
}

/**
 * Evaluation retry logic: transcripts may still be persisting after disconnect.
 * Retries up to 5 times with 2s delay on 425 (Too Early) responses.
 */
async function requestEvaluationWithRetry(
  sessionId: string,
  userId: string,
): Promise<EvaluationResult> {
  const maxRetries = 5;
  const retryDelayMs = 2000;

  for (let attempt = 0; attempt < maxRetries; attempt++) {
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

    const data = await response.json();
    if (data.ok && data.data) {
      return { evaluation: data.data.evaluation?.evaluation ?? data.data.evaluation };
    }
  }

  throw new Error("Evaluation failed after retries");
}

/**
 * Inner component rendered inside <LiveKitRoom> to access LiveKit hooks.
 */
function VoiceSessionUI({
  userId,
  sessionId,
  evaluation,
  error,
  isFreePractice,
  scenarioTitle,
  onSessionId,
  onError,
  onEvaluation,
  onDisconnect,
  onComplete,
}: {
  userId: string;
  sessionId: string | null;
  evaluation: EvaluationResult | null;
  error: string | null;
  isFreePractice: boolean;
  scenarioTitle: string;
  onSessionId: (id: string) => void;
  onError: (msg: string) => void;
  onEvaluation: (result: EvaluationResult) => void;
  onDisconnect: () => void;
  onComplete: () => void;
}) {
  const { state: agentState, audioTrack, agentAttributes } = useVoiceAssistant();
  const lkConnectionState = useConnectionState();
  const connectionStatus = toConnectionStatus(lkConnectionState);
  const isConnected = connectionStatus === "connected";

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

  const handleGetFeedback = async () => {
    if (!sessionId) {
      onError("Agent has not created a session yet. Please try again.");
      return;
    }

    // Disconnect room first -- triggers agent shutdown + transcript persistence
    onDisconnect();

    try {
      const result = await requestEvaluationWithRetry(sessionId, userId);
      onEvaluation(result);
    } catch (evalError) {
      onError(
        evalError instanceof Error ? evalError.message : "Evaluation failed"
      );
    }
  };

  const isAgentActive = agentState === "listening" || agentState === "thinking" || agentState === "speaking";

  return (
    <>
      {/* Connection Status Bar */}
      <div className="px-4 py-2 border-b border-gray-700 flex items-center justify-between">
        <ConnectionStatusIndicator status={connectionStatus} />
        <div className="flex items-center gap-2">
          {agentState && isConnected && (
            <span className="text-xs text-gray-500 font-marfa capitalize">{agentState}</span>
          )}
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
                    : "Waiting for agent..."}
            </p>
            <p className="text-gray-400 font-marfa text-sm">
              {isFreePractice ? "Free Practice" : scenarioTitle}
            </p>

            {/* LiveKit mic controls */}
            <VoiceAssistantControlBar />
          </div>
        )}
      </div>

      {/* Controls or Evaluation */}
      {!evaluation ? (
        <div className="p-4 border-t border-gray-700">
          {isConnected && (
            <button
              onClick={handleGetFeedback}
              disabled={!isAgentActive && agentState !== "idle"}
              className="w-full bg-blue-500 hover:bg-blue-600 text-white py-3 rounded-lg
                         font-marfa font-medium disabled:opacity-50 disabled:cursor-not-allowed"
            >
              Get Feedback
            </button>
          )}
        </div>
      ) : (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-lg max-w-2xl w-full max-h-[80vh] overflow-y-auto p-6">
            <div className="flex justify-between items-center mb-4">
              <h2 className="text-xl font-bold text-gray-800 font-marfa">Session Feedback</h2>
            </div>

            <div className="prose prose-sm max-w-none prose-headings:text-gray-800 prose-p:text-gray-700 prose-li:text-gray-700 prose-strong:text-gray-800">
              <ReactMarkdown remarkPlugins={[remarkGfm]}>
                {evaluation.evaluation}
              </ReactMarkdown>
            </div>

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
      )}

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
  const [connectionStatus, setConnectionStatus] = useState<ConnectionStatus>("disconnected");
  const [error, setError] = useState<string | null>(null);

  const scenarioId = assignment?.scenarioId;
  const scenarioTitle = assignment?.scenarioTitle || "Untitled";
  const isFreePractice = !scenarioId;

  const handleConnect = useCallback(async () => {
    if (assignment && !scenarioId) {
      console.error("[Voice View] Cannot connect: assignment exists but scenarioId is missing!");
      return;
    }

    setError(null);
    setSessionId(null);
    setEvaluation(null);
    setConnectionStatus("connecting");

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

  const handleDisconnect = useCallback(() => {
    setToken(null);
    setServerUrl(null);
    setConnectionStatus("disconnected");
  }, []);

  const handleExit = () => {
    handleDisconnect();
    onComplete();
  };

  // Pre-connection UI
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
        onDisconnected={handleDisconnect}
        className="flex flex-col flex-1"
      >
        <VoiceSessionUI
          userId={userId}
          sessionId={sessionId}
          evaluation={evaluation}
          error={error}
          isFreePractice={isFreePractice}
          scenarioTitle={scenarioTitle}
          onSessionId={setSessionId}
          onError={setError}
          onEvaluation={setEvaluation}
          onDisconnect={handleDisconnect}
          onComplete={onComplete}
        />
      </LiveKitRoom>
    </div>
  );
}
