"use client";

import { useState, useEffect, useRef, useCallback, useMemo } from "react";
import {
  Assignment,
  User,
  EvaluationResult,
  ApiResponse,
  SessionListItem,
} from "@/types";
import { createAuthFetch } from "@/lib/fetch";
import { formatDate, getDaysUntilDue, getStatusColor, getStatusIcon } from "@/lib/format";
import EvaluationResults from "./evaluation-results";

interface LearnerDashboardProps {
  onStartTraining: (assignment: Assignment, userId?: string) => void;
  learnerId?: string | null;
  /** Role of the viewing user - supervisors can switch between learners */
  viewerRole?: "learner" | "supervisor" | "admin";
}

export default function LearnerDashboard({
  onStartTraining,
  learnerId: propLearnerId,
  viewerRole = "learner",
}: LearnerDashboardProps) {
  const [assignments, setAssignments] = useState<Assignment[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState("");
  const [startingId, setStartingId] = useState<string | null>(null);
  const [evaluation, setEvaluation] = useState<EvaluationResult & { sessionId?: string } | null>(null);
  const [loadingFeedback, setLoadingFeedback] = useState<string | null>(null);
  const [openDropdown, setOpenDropdown] = useState<string | null>(null);
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [allLearners, setAllLearners] = useState<User[]>([]);
  const [detailModal, setDetailModal] = useState<{
    type: "scenario" | "evaluator" | "transcript" | "evalContext";
    content: string;
    title: string;
    isImage?: boolean;
  } | null>(null);
  const [playingRecording, setPlayingRecording] = useState<string | null>(null);
  const [loadingDetail, setLoadingDetail] = useState<string | null>(null);
  const [freePracticeSessions, setFreePracticeSessions] = useState<SessionListItem[]>([]);
  const [loadingFreePractice, setLoadingFreePractice] = useState(true);
  const [loadingSessionDetail, setLoadingSessionDetail] = useState<string | null>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Create authenticated fetch bound to current user
  const authFetch = useMemo(
    () => (currentUser ? createAuthFetch(currentUser.id) : fetch),
    [currentUser]
  );

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (
        dropdownRef.current &&
        !dropdownRef.current.contains(event.target as Node)
      ) {
        setOpenDropdown(null);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  // Fetch learner user on mount
  useEffect(() => {
    const loadLearnerUser = async () => {
      try {
        const response = await fetch("/api/users?role=learner");
        const data: ApiResponse<User[]> = await response.json();
        if (data.ok && data.data.length > 0) {
          const users = data.data;

          // Store all learners for the selector
          setAllLearners(users);

          let selectedUser;
          if (propLearnerId) {
            // Use the provided learner ID from URL
            selectedUser = users.find((c: User) => c.id === propLearnerId);
          }
          if (!selectedUser) {
            // Fall back to Test Counselor or first learner
            selectedUser = users.find(
              (c: User) => c.displayName === "Test Counselor"
            ) || users[0];
          }
          setCurrentUser(selectedUser);
        }
      } catch (err) {
        console.error("Failed to load learner user:", err);
      }
    };
    loadLearnerUser();
  }, [propLearnerId]);

  const loadAssignments = useCallback(async () => {
    if (!currentUser) return;
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams();
      if (statusFilter) params.set("status", statusFilter);
      const response = await authFetch(`/api/assignments?${params}`);
      const data: ApiResponse<Assignment[]> = await response.json();
      if (!data.ok) throw new Error(data.error.message);
      setAssignments(data.data);
    } catch (err) {
      setError("Failed to load assignments");
      console.error(err);
    } finally {
      setLoading(false);
    }
  }, [statusFilter, currentUser, authFetch]);

  useEffect(() => {
    loadAssignments();
  }, [loadAssignments]);

  // Load free practice sessions (completed, server-side filtered to free practice only)
  const loadFreePracticeSessions = useCallback(async () => {
    if (!currentUser) return;
    setLoadingFreePractice(true);
    try {
      const response = await authFetch(`/api/sessions?status=completed`);
      const data: ApiResponse<SessionListItem[]> = await response.json();
      if (!data.ok) throw new Error(data.error.message);
      setFreePracticeSessions(data.data);
    } catch (err) {
      console.error("Failed to load free practice sessions:", err);
    } finally {
      setLoadingFreePractice(false);
    }
  }, [currentUser, authFetch]);

  useEffect(() => {
    loadFreePracticeSessions();
  }, [loadFreePracticeSessions]);

  // Shared helper: fetch and display evaluation feedback by ID
  const fetchAndShowFeedback = async (entityId: string, evaluationId: string, sessionId?: string) => {
    setLoadingFeedback(entityId);
    setError(null);
    try {
      const response = await authFetch(`/api/evaluations/${evaluationId}`);
      const data = await response.json();
      if (!data.ok) throw new Error(data.error?.message || "Failed to load feedback");
      setEvaluation({
        evaluation: data.data.feedbackJson || data.data.rawResponse || "No evaluation content available",
        sessionId,
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load feedback");
    } finally {
      setLoadingFeedback(null);
    }
  };

  // Shared helper: fetch and display transcript by session ID
  const fetchAndShowTranscript = async (sessionId: string, loadingKey?: string) => {
    if (loadingKey) {
      setLoadingSessionDetail(loadingKey);
    } else {
      setLoadingDetail("transcript");
    }
    setError(null);
    try {
      const response = await authFetch(`/api/sessions/${sessionId}`);
      const data = await response.json();
      if (!data.ok) throw new Error(data.error?.message || "Failed to load transcript");
      const turns = Array.isArray(data.data.transcript) ? data.data.transcript : [];
      const transcriptText = turns.length > 0
        ? turns
            .map((t: { role: string; content: string }) =>
              `${t.role === "user" ? "Counselor" : "Caller"}: ${t.content}`
            )
            .join("\n\n")
        : "No transcript available";
      setDetailModal({
        type: "transcript",
        title: "Conversation Transcript",
        content: transcriptText,
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load transcript");
    } finally {
      if (loadingKey) {
        setLoadingSessionDetail(null);
      } else {
        setLoadingDetail(null);
      }
    }
  };

  const handleStartTraining = async (assignment: Assignment) => {
    setStartingId(assignment.id);
    setOpenDropdown(null);
    setError(null);
    try {
      // Update status to in_progress
      await authFetch(`/api/assignments/${assignment.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: "in_progress" }),
      });
      onStartTraining(assignment, currentUser?.id);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to start training");
      setStartingId(null);
    }
  };

  const handleGetFeedback = async (assignment: Assignment) => {
    if (!assignment.sessionId) {
      setError("No session found for this assignment");
      return;
    }
    const sessionId = assignment.sessionId;
    setOpenDropdown(null);
    setLoadingFeedback(assignment.id);
    setError(null);
    try {
      const response = await authFetch(
        `/api/sessions/${sessionId}/evaluate`,
        { method: "POST" }
      );
      const data = await response.json();
      if (!data.ok) throw new Error(data.error?.message || "Failed to get feedback");
      setEvaluation({
        evaluation: data.data.evaluation.evaluation,
        sessionId,
      });
      await loadAssignments();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to get feedback");
    } finally {
      setLoadingFeedback(null);
    }
  };

  const handleViewFeedback = async (assignment: Assignment) => {
    if (!assignment.evaluationId) {
      setError("No evaluation found for this assignment");
      return;
    }
    await fetchAndShowFeedback(assignment.id, assignment.evaluationId, assignment.sessionId ?? undefined);
  };

  const handleViewScenario = async (assignment: Assignment) => {
    const scenarioId = assignment.scenarioId;
    setLoadingDetail("scenario");
    setError(null);
    try {
      const response = await authFetch(`/api/scenarios/${scenarioId}`);
      const data = await response.json();
      if (!data.ok) throw new Error(data.error?.message || "Failed to load scenario");
      setDetailModal({
        type: "scenario",
        title: `Scenario: ${data.data.title}`,
        content: data.data.prompt,
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load scenario");
    } finally {
      setLoadingDetail(null);
    }
  };

  const handleViewTranscript = async (assignment: Assignment) => {
    if (!assignment.sessionId) {
      setError("No session found for this assignment");
      return;
    }
    await fetchAndShowTranscript(assignment.sessionId);
  };

  const handlePlayRecording = async (recordingId: string, trackingId: string) => {
    setPlayingRecording(trackingId);
    setError(null);
    try {
      // Fetch recording with auth header and create blob URL for playback
      const response = await authFetch(`/api/recordings/${recordingId}/download`);
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.error?.message || "Failed to download recording");
      }
      const blob = await response.blob();
      const blobUrl = URL.createObjectURL(blob);

      // Whitelist known audio types from blob (set by server Content-Type)
      const knownTypes = ["audio/wav", "audio/webm", "audio/ogg"];
      const audioType = knownTypes.includes(blob.type) ? blob.type : "audio/wav";

      // Open audio in new tab with blob URL
      const audioWindow = window.open("", "_blank");
      if (audioWindow) {
        // Use multiple cleanup mechanisms for reliability
        // onbeforeunload alone is unreliable on mobile and some browsers
        audioWindow.document.write(`
          <!DOCTYPE html>
          <html>
          <head><title>Recording Playback</title></head>
          <body style="display:flex;justify-content:center;align-items:center;height:100vh;margin:0;background:#1a1a2e;">
            <audio id="audio" controls autoplay style="width:80%;max-width:600px;">
              <source src="${blobUrl}" type="${audioType}">
              Your browser does not support audio playback.
            </audio>
            <script>
              var blobUrl = "${blobUrl}";
              var cleaned = false;
              function cleanup() {
                if (!cleaned) {
                  cleaned = true;
                  URL.revokeObjectURL(blobUrl);
                }
              }
              // Multiple cleanup triggers for reliability
              document.getElementById('audio').onended = cleanup;
              window.onbeforeunload = cleanup;
              window.onpagehide = cleanup;
              // Fallback: cleanup after 30 minutes max
              setTimeout(cleanup, 30 * 60 * 1000);
            </script>
          </body>
          </html>
        `);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to play recording");
    } finally {
      setPlayingRecording(null);
    }
  };

  const handleViewEvalContext = async (assignment: Assignment) => {
    const scenarioId = assignment.scenarioId;
    setLoadingDetail("evalContext");
    setError(null);
    try {
      // Fetch evaluator context content from dedicated endpoint
      const response = await authFetch(`/api/scenarios/${scenarioId}/evaluator-context`);
      const data = await response.json();
      if (!data.ok) throw new Error(data.error?.message || "Failed to load evaluator context");

      if (!data.data.content) {
        setError(data.data.message || "No evaluator context available for this scenario");
        setLoadingDetail(null);
        return;
      }

      const isImage = data.data.type === "image";
      setDetailModal({
        type: "evalContext",
        title: `Evaluator Context${data.data.filename ? ` - ${data.data.filename}` : ""}`,
        content: data.data.content,
        isImage,
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load evaluator context");
    } finally {
      setLoadingDetail(null);
    }
  };

  // Handle learner selection change
  const handleLearnerChange = (learnerId: string) => {
    // Update URL with new learner ID to trigger reload
    window.location.href = `/learner?userId=${learnerId}`;
  };

  // Demo mode enables user switching for testing
  const isDemoMode = process.env.NEXT_PUBLIC_DEMO_MODE === "true";
  const showUserSelector = (viewerRole === "supervisor" || isDemoMode) && allLearners.length > 1;

  return (
    <div className="pb-8">
      {/* Learner Selector - for supervisors or demo mode */}
      {showUserSelector ? (
        <div className={`flex flex-col items-center mb-6 ${isDemoMode ? "border-2 border-yellow-500 rounded-lg p-4" : ""}`}>
          <label className="text-gray-400 text-sm mb-2 font-marfa">
            {isDemoMode && <span className="text-yellow-500 mr-2">[DEMO]</span>}
            {viewerRole === "supervisor" ? "Viewing as:" : "Switch user:"}
          </label>
          <select
            value={currentUser?.id || ""}
            onChange={(e) => handleLearnerChange(e.target.value)}
            className="bg-gray-800 border border-gray-600 rounded-lg px-4 py-2
                       text-white font-marfa font-bold text-lg
                       focus:outline-none focus:border-brand-orange
                       cursor-pointer min-w-[200px] text-center"
          >
            {allLearners.map((learner) => (
              <option key={learner.id} value={learner.id}>
                {learner.displayName}
              </option>
            ))}
          </select>
        </div>
      ) : currentUser ? (
        <div className="flex flex-col items-center mb-6">
          <label className="text-gray-400 text-sm mb-2 font-marfa">
            Logged in as:
          </label>
          <span className="text-white font-marfa font-bold text-lg">
            {currentUser.displayName}
          </span>
        </div>
      ) : null}

      {/* Error display */}
      {error && (
        <div className="mb-4 p-3 bg-red-500/20 border border-red-500 rounded-lg text-red-300">
          {error}
          <button
            onClick={() => setError(null)}
            className="ml-4 text-red-400 hover:text-red-200"
          >
            Dismiss
          </button>
        </div>
      )}

      {/* Filter */}
      <div className="flex justify-end mb-4">
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          className="bg-gray-800 border border-gray-600 rounded px-3 py-2
                     text-white font-marfa focus:outline-none focus:border-brand-orange"
        >
          <option value="">All Assignments</option>
          <option value="pending">Pending</option>
          <option value="in_progress">In Progress</option>
          <option value="completed">Completed</option>
        </select>
      </div>

      {/* Free Practice Section */}
      <div className="mb-8">
        <h2 className="text-xl font-marfa font-bold text-white mb-3">
          Free Practice
        </h2>
        <p className="text-gray-400 text-sm mb-4">
          Practice on your own without an assigned scenario
        </p>
        <div className="flex flex-col sm:flex-row gap-4">
          <button
            onClick={() =>
              onStartTraining({
                id: "free-practice",
                scenarioId: "",
                scenarioMode: "phone",
                scenarioTitle: "Free Practice",
                learnerId: currentUser?.id || "",
                status: "in_progress",
                dueDate: null,
                completedAt: null,
                supervisorNotes: null,
                sessionId: null,
                createdAt: new Date().toISOString(),
                updatedAt: new Date().toISOString(),
              }, currentUser?.id)
            }
            className="flex-1 bg-brand-orange hover:bg-brand-orange-hover text-white
                       font-marfa font-bold py-4 px-6 rounded-lg flex items-center justify-center gap-3"
          >
            <span className="text-2xl">🎙️</span>
            <span>Practice by Voice</span>
          </button>
          <button
            onClick={() =>
              onStartTraining({
                id: "free-practice",
                scenarioId: "",
                scenarioMode: "chat",
                scenarioTitle: "Free Practice",
                learnerId: currentUser?.id || "",
                status: "in_progress",
                dueDate: null,
                completedAt: null,
                supervisorNotes: null,
                sessionId: null,
                createdAt: new Date().toISOString(),
                updatedAt: new Date().toISOString(),
              }, currentUser?.id)
            }
            className="flex-1 bg-blue-500 hover:bg-blue-600 text-white
                       font-marfa font-bold py-4 px-6 rounded-lg flex items-center justify-center gap-3"
          >
            <span className="text-2xl">💬</span>
            <span>Practice by Text</span>
          </button>
        </div>
      </div>

      {/* Free Practice History */}
      {!currentUser || loadingFreePractice ? (
        <p className="text-gray-400 text-sm mt-6">Loading practice history...</p>
      ) : freePracticeSessions.length > 0 ? (
        <div className="mt-6">
          <h3 className="text-lg font-marfa font-bold text-gray-300 mb-3">
            Free Practice History
          </h3>
          <div className="space-y-2">
            {freePracticeSessions.map((session) => {
              const scenarioTitle = session.scenario?.title || "Open Practice";
              const duration = session.endedAt
                ? Math.round(
                    (new Date(session.endedAt).getTime() -
                      new Date(session.startedAt).getTime()) /
                      60000
                  )
                : null;
              const dateStr = new Date(session.startedAt).toLocaleDateString(
                "en-US",
                { month: "short", day: "numeric", year: "numeric" }
              );

              return (
                <div
                  key={session.id}
                  className="bg-brand-navy border border-gray-700 rounded-lg p-4 flex items-center justify-between gap-4"
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <span className="text-lg flex-shrink-0">
                      {session.modelType === "phone" ? "🎙️" : "💬"}
                    </span>
                    <div className="min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-white font-marfa font-medium truncate">
                          {scenarioTitle}
                        </span>
                        {session.evaluation && (
                          <span className="px-2 py-0.5 rounded text-xs font-marfa bg-green-500/20 text-green-300 flex-shrink-0">
                            {session.evaluation.overallScore}%
                          </span>
                        )}
                      </div>
                      <p className="text-gray-500 text-xs mt-0.5">
                        {dateStr}
                        {session.modelType === "phone" ? " · Voice" : " · Chat"}
                        {duration !== null && ` · ${duration}m`}
                        {session.turnCount > 0 && ` · ${session.turnCount} turns`}
                      </p>
                    </div>
                  </div>
                  <div className="flex gap-2 flex-shrink-0">
                    {/* Play button for all voice sessions (disabled when no recording) */}
                    {session.modelType === "phone" && (
                      <button
                        onClick={() => handlePlayRecording(session.recordingId!, session.id)}
                        disabled={!session.recordingId || playingRecording === session.id}
                        title={session.recordingId ? "Play recording" : "No recording available"}
                        className="bg-purple-600 hover:bg-purple-700 text-white
                                   font-marfa font-bold py-1.5 px-3 rounded text-sm
                                   disabled:opacity-50 disabled:cursor-not-allowed"
                      >
                        {playingRecording === session.id ? "..." : "Play"}
                      </button>
                    )}
                    {session.evaluation && (
                      <button
                        onClick={() => fetchAndShowFeedback(session.id, session.evaluation!.id, session.id)}
                        disabled={loadingFeedback === session.id}
                        className="bg-green-600 hover:bg-green-700 text-white
                                   font-marfa font-bold py-1.5 px-3 rounded text-sm
                                   disabled:opacity-50 disabled:cursor-not-allowed"
                      >
                        {loadingFeedback === session.id ? "..." : "Feedback"}
                      </button>
                    )}
                    {session.turnCount > 0 && (
                      <button
                        onClick={() => fetchAndShowTranscript(session.id, session.id)}
                        disabled={loadingSessionDetail === session.id}
                        className="bg-gray-600 hover:bg-gray-500 text-white
                                   font-marfa font-bold py-1.5 px-3 rounded text-sm
                                   disabled:opacity-50 disabled:cursor-not-allowed"
                      >
                        {loadingSessionDetail === session.id ? "..." : "Transcript"}
                      </button>
                    )}
                    {!session.evaluation && session.turnCount === 0 && (
                      <span className="text-gray-500 text-xs py-1.5">No evaluation</span>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      ) : (
        <p className="text-gray-500 text-sm mt-6">
          No free practice sessions yet. Start one above!
        </p>
      )}

      {/* Divider */}
      <div className="border-t border-gray-600 my-6" />

      {/* Assigned Training Header */}
      <h2 className="text-xl font-marfa font-bold text-white mb-4">
        Assigned Training
      </h2>

      {/* Assignments List */}
      {loading ? (
        <p className="text-gray-400 text-center">Loading your assignments...</p>
      ) : assignments.length === 0 ? (
        <div className="text-center py-12">
          <p className="text-gray-400 text-lg">No assignments yet.</p>
          <p className="text-gray-500 text-sm mt-2">
            Your supervisor will assign training scenarios to you.
          </p>
        </div>
      ) : (
        <div className="space-y-4">
          {assignments.map((assignment) => {
            const daysUntilDue = getDaysUntilDue(assignment.dueDate);
            const canStart = assignment.status === "pending";
            const canContinue = assignment.status === "in_progress";
            const isCompleted = assignment.status === "completed";
            const isStarting = startingId === assignment.id;

            return (
              <div
                key={assignment.id}
                className={`bg-brand-navy border rounded-lg p-5 ${getStatusColor(
                  assignment.status
                )}`}
              >
                <div className="flex justify-between items-start gap-4">
                  <div className="flex-grow min-w-0">
                    {/* Header with status */}
                    <div className="flex items-start gap-3 mb-2">
                      <span className="text-lg flex-shrink-0">
                        {getStatusIcon(assignment.status)}
                      </span>
                      <div className="min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <h3 className="text-white font-marfa font-medium text-lg">
                            {assignment.scenarioTitle || "Untitled"}
                          </h3>
                          <span
                            className={`px-2 py-0.5 rounded text-xs font-marfa flex-shrink-0 ${
                              assignment.scenarioMode === "chat"
                                ? "bg-blue-500/20 text-blue-300"
                                : "bg-green-500/20 text-green-300"
                            }`}
                          >
                            {assignment.scenarioMode === "chat" ? "Chat" : "Phone"}
                          </span>
                        </div>
                      </div>
                    </div>

                    {/* Status badge */}
                    <div className="flex items-center gap-2 mb-3">
                      <span
                        className={`text-xs px-2 py-1 rounded ${getStatusColor(
                          assignment.status
                        )}`}
                      >
                        {assignment.status.replace("_", " ")}
                      </span>
                      {assignment.isOverdue && (
                        <span className="text-xs px-2 py-1 rounded bg-red-500/20 text-red-300">
                          Overdue
                        </span>
                      )}
                    </div>

                    {/* Due date */}
                    {assignment.dueDate && !isCompleted && (
                      <p
                        className={`text-sm ${
                          assignment.isOverdue ? "text-red-400" : "text-gray-400"
                        }`}
                      >
                        Due: {formatDate(assignment.dueDate)}
                        {daysUntilDue !== null && !assignment.isOverdue && (
                          <span className="ml-2 text-gray-500">
                            (
                            {daysUntilDue === 0
                              ? "Today"
                              : daysUntilDue === 1
                              ? "Tomorrow"
                              : `${daysUntilDue} days`}
                            )
                          </span>
                        )}
                      </p>
                    )}

                    {/* Completed date */}
                    {assignment.completedAt && (
                      <p className="text-green-400 text-sm">
                        Completed: {formatDate(assignment.completedAt)}
                      </p>
                    )}

                    {/* Supervisor notes */}
                    {assignment.supervisorNotes && (
                      <p className="text-gray-500 text-sm mt-2 italic">
                        &quot;{assignment.supervisorNotes}&quot;
                      </p>
                    )}
                  </div>

                  {/* Action buttons */}
                  <div className="ml-4 flex-shrink-0">
                    {canStart && (
                      <button
                        onClick={() => handleStartTraining(assignment)}
                        disabled={isStarting}
                        className="bg-brand-orange hover:bg-brand-orange-hover text-white
                                   font-marfa font-bold py-2 px-4 rounded
                                   disabled:opacity-50 disabled:cursor-not-allowed"
                      >
                        {isStarting ? "Starting..." : "Start Training"}
                      </button>
                    )}
                    {canContinue && (
                      <div
                        className="relative"
                        ref={openDropdown === assignment.id ? dropdownRef : null}
                      >
                        <button
                          onClick={() =>
                            setOpenDropdown(
                              openDropdown === assignment.id ? null : assignment.id
                            )
                          }
                          disabled={isStarting || loadingFeedback === assignment.id}
                          className="bg-blue-500 hover:bg-blue-600 text-white
                                     font-marfa font-bold py-2 px-4 rounded
                                     disabled:opacity-50 disabled:cursor-not-allowed
                                     flex items-center gap-2"
                        >
                          {isStarting
                            ? "Starting..."
                            : loadingFeedback === assignment.id
                            ? "Loading..."
                            : "Continue"}
                          <span className="text-xs">▼</span>
                        </button>
                        {openDropdown === assignment.id && (
                          <div className="absolute right-0 mt-1 w-40 bg-gray-800 border border-gray-600 rounded shadow-lg z-10">
                            {assignment.hasTranscript && (
                              <button
                                onClick={() => handleGetFeedback(assignment)}
                                className="w-full text-left px-4 py-2 text-white hover:bg-gray-700 font-marfa text-sm"
                              >
                                Get Feedback
                              </button>
                            )}
                            <button
                              onClick={() => handleStartTraining(assignment)}
                              className="w-full text-left px-4 py-2 text-white hover:bg-gray-700 font-marfa text-sm"
                            >
                              New Attempt
                            </button>
                          </div>
                        )}
                      </div>
                    )}
                    {isCompleted && (
                      <div className="flex flex-nowrap gap-2 flex-shrink-0">
                        {/* Play button for all voice assignments (disabled when no recording) */}
                        {assignment.scenarioMode === "phone" && (
                          <button
                            onClick={() => handlePlayRecording(assignment.recordingId!, assignment.id)}
                            disabled={!assignment.recordingId || playingRecording === assignment.id}
                            title={assignment.recordingId ? "Play recording" : "No recording available"}
                            className="bg-purple-600 hover:bg-purple-700 text-white
                                       font-marfa font-bold py-2 px-3 rounded text-sm
                                       disabled:opacity-50 disabled:cursor-not-allowed"
                          >
                            {playingRecording === assignment.id ? "..." : "Play"}
                          </button>
                        )}
                        {assignment.sessionId && (
                          <>
                            <button
                              onClick={() => handleViewFeedback(assignment)}
                              disabled={loadingFeedback === assignment.id}
                              className="bg-green-600 hover:bg-green-700 text-white
                                         font-marfa font-bold py-2 px-3 rounded text-sm
                                         disabled:opacity-50 disabled:cursor-not-allowed"
                            >
                              {loadingFeedback === assignment.id ? "..." : "Feedback"}
                            </button>
                            <button
                              onClick={() => handleViewTranscript(assignment)}
                              disabled={loadingDetail === "transcript"}
                              className="bg-gray-600 hover:bg-gray-500 text-white
                                         font-marfa font-bold py-2 px-3 rounded text-sm
                                         disabled:opacity-50 disabled:cursor-not-allowed"
                            >
                              {loadingDetail === "transcript" ? "..." : "Transcript"}
                            </button>
                          </>
                        )}
                        <button
                          onClick={() => handleViewScenario(assignment)}
                          disabled={loadingDetail === "scenario"}
                          className="bg-gray-600 hover:bg-gray-500 text-white
                                     font-marfa font-bold py-2 px-3 rounded text-sm
                                     disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                          {loadingDetail === "scenario" ? "..." : "Scenario"}
                        </button>
                        {/* Eval Context button */}
                        <button
                          onClick={() => handleViewEvalContext(assignment)}
                          disabled={loadingDetail === "evalContext"}
                          className="bg-indigo-600 hover:bg-indigo-700 text-white
                                     font-marfa font-bold py-2 px-3 rounded text-sm
                                     disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                          {loadingDetail === "evalContext" ? "..." : "Eval Context"}
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Evaluation Results Modal */}
      {evaluation && (
        <EvaluationResults
          evaluation={evaluation}
          onClose={() => setEvaluation(null)}
          sessionId={evaluation.sessionId}
          userId={currentUser?.id}
        />
      )}

      {/* Detail Modal */}
      {detailModal && (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4">
          <div className="bg-gray-800 rounded-lg max-w-3xl w-full max-h-[80vh] flex flex-col">
            <div className="flex justify-between items-center p-4 border-b border-gray-600">
              <h2 className="text-xl font-marfa font-bold text-white">
                {detailModal.title}
              </h2>
              <button
                onClick={() => setDetailModal(null)}
                className="text-gray-400 hover:text-white text-2xl leading-none"
              >
                &times;
              </button>
            </div>
            <div className="p-4 overflow-y-auto flex-grow">
              {detailModal.isImage ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={detailModal.content}
                  alt="Evaluator Context"
                  className="max-w-full h-auto mx-auto"
                />
              ) : (
                <pre className="whitespace-pre-wrap text-gray-200 font-marfa text-sm leading-relaxed">
                  {detailModal.content}
                </pre>
              )}
            </div>
            <div className="p-4 border-t border-gray-600 flex justify-end">
              <button
                onClick={() => setDetailModal(null)}
                className="bg-gray-600 hover:bg-gray-500 text-white font-marfa font-bold py-2 px-4 rounded"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
