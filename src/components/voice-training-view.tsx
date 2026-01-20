"use client";

import { useState, useCallback } from "react";
import Image from "next/image";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { useRealtimeVoice } from "@/hooks/use-realtime-voice";
import { Assignment, TranscriptTurn, ConnectionStatus } from "@/types";

interface VoiceTrainingViewProps {
  assignment: Assignment | null;
  userId: string;
  onComplete: () => void;
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

export default function VoiceTrainingView({
  assignment,
  userId,
  onComplete,
}: VoiceTrainingViewProps) {
  const [transcript, setTranscript] = useState<TranscriptTurn[]>([]);

  // Detect free practice mode (no scenario assigned)
  const isFreePractice = !assignment?.scenario_id;

  const handleTranscript = useCallback((turn: TranscriptTurn) => {
    setTranscript((prev) => [...prev, turn]);
  }, []);

  const {
    isConnected,
    isListening,
    evaluation,
    connectionStatus,
    error,
    connect,
    startListening,
    stopListening,
    disconnect,
    requestEvaluation,
  } = useRealtimeVoice({
    userId,
    scenarioId: assignment?.scenario_id,
    assignmentId: assignment?.id,
    onTranscript: handleTranscript,
  });

  const handleConnect = async () => {
    try {
      await connect();
    } catch {
      // Error is handled in the hook
    }
  };

  const handleToggleListening = async () => {
    if (isListening) {
      stopListening();
    } else {
      try {
        await startListening();
      } catch {
        // Error is handled in the hook
      }
    }
  };

  const handleGetFeedback = async () => {
    stopListening();
    disconnect();
    await requestEvaluation();
  };

  const handleExit = () => {
    stopListening();
    disconnect();
    onComplete();
  };

  return (
    <div className="flex flex-col h-screen bg-brand-navy">
      {/* Header */}
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
            {isFreePractice ? "Free Practice" : assignment?.scenario_title}
          </h2>
          <span className="text-xs text-gray-400">Voice Training</span>
        </div>
        <button
          onClick={handleExit}
          className="text-gray-400 hover:text-white text-sm font-marfa"
        >
          Exit
        </button>
      </header>

      {/* Connection Status Bar */}
      <div className="px-4 py-2 border-b border-gray-700 flex items-center justify-between">
        <ConnectionStatusIndicator status={connectionStatus} />
        {error && (
          <span className="text-red-400 text-sm font-marfa">{error}</span>
        )}
      </div>

      {/* Transcript Area */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {transcript.length === 0 && !isConnected && (
          <div className="text-center py-8">
            <p className="text-gray-400 font-marfa">
              Click &quot;Start Session&quot; to begin your voice training
            </p>
          </div>
        )}

        {transcript.length === 0 && isConnected && !isListening && (
          <div className="text-center py-8">
            <p className="text-gray-400 font-marfa">
              Click the microphone button to start speaking
            </p>
          </div>
        )}

        {transcript.map((turn) => (
          <div
            key={turn.id}
            className={`flex ${
              turn.role === "user" ? "justify-end" : "justify-start"
            }`}
          >
            <div
              className={`max-w-[70%] rounded-lg p-3 ${
                turn.role === "user"
                  ? "bg-brand-orange text-white"
                  : "bg-gray-700 text-white"
              }`}
            >
              <div className="text-xs text-gray-300 mb-1 font-marfa">
                {turn.role === "user" ? "You (Counselor)" : "Caller"}
              </div>
              <p className="text-sm font-marfa whitespace-pre-wrap">
                {turn.content}
              </p>
            </div>
          </div>
        ))}
      </div>

      {/* Controls Area or Evaluation */}
      {!evaluation ? (
        <div className="p-4 border-t border-gray-700">
          {!isConnected ? (
            <button
              onClick={handleConnect}
              disabled={connectionStatus === "connecting"}
              className="w-full bg-brand-orange hover:bg-brand-orange-hover text-white
                         py-3 rounded-lg font-marfa font-medium
                         disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {connectionStatus === "connecting"
                ? "Connecting..."
                : "Start Session"}
            </button>
          ) : (
            <div className="flex gap-2">
              <button
                onClick={handleToggleListening}
                className={`flex-1 py-3 rounded-lg font-marfa font-medium flex items-center justify-center gap-2 ${
                  isListening
                    ? "bg-red-500 hover:bg-red-600 text-white"
                    : "bg-green-500 hover:bg-green-600 text-white"
                }`}
              >
                <span className="text-lg">{isListening ? "🔴" : "🎙️"}</span>
                <span>{isListening ? "Stop Speaking" : "Start Speaking"}</span>
              </button>
              <button
                onClick={handleGetFeedback}
                disabled={transcript.length < 2}
                className="bg-blue-500 hover:bg-blue-600 text-white px-4 py-3 rounded-lg
                           font-marfa font-medium disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Get Feedback
              </button>
            </div>
          )}
        </div>
      ) : (
        <div className="p-4 border-t border-gray-700 max-h-[50vh] overflow-y-auto">
          <div className="bg-gray-800 rounded-lg p-4">
            <h3 className="text-white font-marfa font-bold mb-3">
              Session Feedback
            </h3>
            <div className="prose prose-sm prose-invert max-w-none prose-headings:text-white prose-p:text-gray-300 prose-li:text-gray-300 prose-strong:text-white">
              <ReactMarkdown remarkPlugins={[remarkGfm]}>
                {evaluation.evaluation}
              </ReactMarkdown>
            </div>
          </div>
          <button
            onClick={onComplete}
            className="mt-4 w-full bg-brand-orange hover:bg-brand-orange-hover
                       text-white py-2 rounded-lg font-marfa font-medium"
          >
            Back to Dashboard
          </button>
        </div>
      )}
    </div>
  );
}
