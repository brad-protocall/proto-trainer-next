"use client";

import { useState, useCallback } from "react";
import {
  LiveKitRoom,
  RoomAudioRenderer,
  useVoiceAssistant,
  BarVisualizer,
  VoiceAssistantControlBar,
  useConnectionState,
} from "@livekit/components-react";
import "@livekit/components-styles";

/**
 * LiveKit Voice AI Spike
 *
 * Testing if LiveKit can replace our custom ws-server for voice training.
 * This is throwaway code - just proving the concept works.
 */

function VoiceAssistantUI() {
  const { state, audioTrack } = useVoiceAssistant();
  const connectionState = useConnectionState();

  return (
    <div className="flex flex-col items-center gap-6 p-8">
      {/* Connection Status */}
      <div className="text-sm text-gray-500">
        Connection: {connectionState} | Agent: {state}
      </div>

      {/* Audio Visualizer */}
      <div className="w-full max-w-md h-32 bg-gray-900 rounded-lg overflow-hidden">
        <BarVisualizer
          state={state}
          barCount={5}
          trackRef={audioTrack}
          className="w-full h-full"
        />
      </div>

      {/* Controls */}
      <VoiceAssistantControlBar />

      {/* Instructions */}
      <div className="text-center text-gray-600 max-w-md">
        <p className="mb-2">
          <strong>Spike Test:</strong> Testing LiveKit voice AI integration
        </p>
        <p className="text-sm">
          Click the microphone to start talking. The AI agent should respond.
        </p>
      </div>
    </div>
  );
}

export default function LiveKitSpikePage() {
  const [token, setToken] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isConnecting, setIsConnecting] = useState(false);

  // LiveKit server URL from environment
  const livekitUrl = process.env.NEXT_PUBLIC_LIVEKIT_URL;

  const handleConnect = useCallback(async () => {
    setIsConnecting(true);
    setError(null);

    try {
      // Generate a unique room name for this session
      const roomName = `spike-${Date.now()}`;
      const participantName = `user-${Math.random().toString(36).slice(2, 8)}`;

      // Get token from our API
      const response = await fetch("/api/livekit/token", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ roomName, participantName }),
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || "Failed to get token");
      }

      const { token } = await response.json();
      setToken(token);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Connection failed");
    } finally {
      setIsConnecting(false);
    }
  }, []);

  const handleDisconnect = useCallback(() => {
    setToken(null);
  }, []);

  // Show configuration error if LiveKit URL not set
  if (!livekitUrl) {
    return (
      <div className="min-h-screen bg-gray-100 flex items-center justify-center p-8">
        <div className="bg-white rounded-lg shadow-lg p-8 max-w-lg">
          <h1 className="text-2xl font-bold text-red-600 mb-4">
            Configuration Required
          </h1>
          <p className="text-gray-600 mb-4">
            Add these to your <code className="bg-gray-100 px-1">.env</code>:
          </p>
          <pre className="bg-gray-900 text-green-400 p-4 rounded text-sm overflow-x-auto">
{`LIVEKIT_API_KEY=your_api_key
LIVEKIT_API_SECRET=your_api_secret
NEXT_PUBLIC_LIVEKIT_URL=wss://your-project.livekit.cloud`}
          </pre>
        </div>
      </div>
    );
  }

  // Not connected yet - show connect button
  if (!token) {
    return (
      <div className="min-h-screen bg-gray-100 flex items-center justify-center p-8">
        <div className="bg-white rounded-lg shadow-lg p-8 max-w-lg text-center">
          <h1 className="text-2xl font-bold text-gray-900 mb-2">
            🎙️ LiveKit Voice AI Spike
          </h1>
          <p className="text-gray-600 mb-6">
            Testing LiveKit as replacement for custom WebSocket relay
          </p>

          {error && (
            <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded mb-4">
              {error}
            </div>
          )}

          <button
            onClick={handleConnect}
            disabled={isConnecting}
            className="bg-blue-600 hover:bg-blue-700 disabled:bg-blue-300 text-white font-medium px-6 py-3 rounded-lg transition-colors"
          >
            {isConnecting ? "Connecting..." : "Start Voice Session"}
          </button>

          <div className="mt-6 text-left text-sm text-gray-500">
            <p className="font-medium mb-2">What this tests:</p>
            <ul className="list-disc list-inside space-y-1">
              <li>Token-based auth (replaces query param userId)</li>
              <li>WebRTC connection (replaces raw WebSocket)</li>
              <li>LiveKit ↔ OpenAI Realtime bridge</li>
              <li>Voice conversation quality</li>
            </ul>
          </div>
        </div>
      </div>
    );
  }

  // Connected - show voice UI
  return (
    <div className="min-h-screen bg-gray-100">
      <LiveKitRoom
        token={token}
        serverUrl={livekitUrl}
        connect={true}
        audio={true}
        video={false}
        onDisconnected={handleDisconnect}
        className="flex flex-col items-center justify-center min-h-screen"
      >
        <div className="bg-white rounded-lg shadow-lg p-8 max-w-lg w-full">
          <div className="flex justify-between items-center mb-6">
            <h1 className="text-xl font-bold text-gray-900">
              🎙️ Voice Session Active
            </h1>
            <button
              onClick={handleDisconnect}
              className="text-gray-500 hover:text-gray-700 text-sm"
            >
              Disconnect
            </button>
          </div>

          <VoiceAssistantUI />
          <RoomAudioRenderer />
        </div>
      </LiveKitRoom>
    </div>
  );
}
