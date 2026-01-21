"use client";

import { useState, useEffect, useRef, useCallback, useMemo } from "react";
import {
  Assignment,
  User,
  EvaluationResult,
  ApiResponse,
} from "@/types";
import { createAuthFetch } from "@/lib/fetch";
import { formatDate, getDaysUntilDue, getStatusColor, getStatusIcon } from "@/lib/format";
import EvaluationResults from "./evaluation-results";

// Helper to get assignment fields (handles both camelCase API and snake_case types)
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function getAssignmentField(assignment: any, camelCase: string, snakeCase: string) {
  return assignment?.[camelCase] || assignment?.[snakeCase];
}

interface CounselorDashboardProps {
  onStartTraining: (assignment: Assignment) => void;
  counselorId?: string | null;
}

export default function CounselorDashboard({
  onStartTraining,
  counselorId: propCounselorId,
}: CounselorDashboardProps) {
  const [assignments, setAssignments] = useState<Assignment[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState("");
  const [startingId, setStartingId] = useState<string | null>(null);
  const [evaluation, setEvaluation] = useState<EvaluationResult | null>(null);
  const [loadingFeedback, setLoadingFeedback] = useState<string | null>(null);
  const [openDropdown, setOpenDropdown] = useState<string | null>(null);
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [detailModal, setDetailModal] = useState<{
    type: "scenario" | "evaluator" | "transcript";
    content: string;
    title: string;
  } | null>(null);
  const [loadingDetail, setLoadingDetail] = useState<string | null>(null);
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

  // Fetch counselor user on mount
  useEffect(() => {
    const loadCounselorUser = async () => {
      try {
        const response = await fetch("/api/users?role=counselor");
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const data: ApiResponse<any[]> = await response.json();
        if (data.ok && data.data.length > 0) {
          // API returns camelCase, transform to match our User type
          const users = data.data.map((u) => ({
            ...u,
            display_name: u.displayName || u.display_name,
          }));

          let selectedUser;
          if (propCounselorId) {
            // Use the provided counselor ID from URL
            selectedUser = users.find((c) => c.id === propCounselorId);
          }
          if (!selectedUser) {
            // Fall back to Test Counselor or first counselor
            selectedUser = users.find(
              (c) => c.display_name === "Test Counselor"
            ) || users[0];
          }
          setCurrentUser(selectedUser);
        }
      } catch (err) {
        console.error("Failed to load counselor user:", err);
      }
    };
    loadCounselorUser();
  }, [propCounselorId]);

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
      onStartTraining(assignment);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to start training");
      setStartingId(null);
    }
  };

  const handleGetFeedback = async (assignment: Assignment) => {
    const sessionId = getAssignmentField(assignment, "sessionId", "session_id");
    if (!sessionId) {
      setError("No session found for this assignment");
      return;
    }
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
        evaluation: data.data.evaluation,
        transcript_turns: data.data.transcript_turns,
      });
      await loadAssignments();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to get feedback");
    } finally {
      setLoadingFeedback(null);
    }
  };

  const handleViewFeedback = async (assignment: Assignment) => {
    const sessionId = getAssignmentField(assignment, "sessionId", "session_id");
    if (!sessionId) {
      setError("No session found for this assignment");
      return;
    }
    setLoadingFeedback(assignment.id);
    setError(null);
    try {
      const response = await authFetch(`/api/sessions/${sessionId}`);
      const data = await response.json();
      if (!data.ok) throw new Error(data.error?.message || "Failed to load feedback");

      // Check if there's an evaluation
      if (data.data.evaluation) {
        setEvaluation({
          evaluation: data.data.evaluation.evaluation,
          transcript_turns: data.data.transcript_turns,
        });
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load feedback");
    } finally {
      setLoadingFeedback(null);
    }
  };

  const handleViewScenario = async (assignment: Assignment) => {
    const scenarioId = getAssignmentField(assignment, "scenarioId", "scenario_id");
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
    const sessionId = getAssignmentField(assignment, "sessionId", "session_id");
    if (!sessionId) {
      setError("No session found for this assignment");
      return;
    }
    setLoadingDetail("transcript");
    setError(null);
    try {
      const response = await authFetch(`/api/sessions/${sessionId}`);
      const data = await response.json();
      if (!data.ok) throw new Error(data.error?.message || "Failed to load transcript");

      const turns = Array.isArray(data.data.transcript_turns)
        ? data.data.transcript_turns
        : [];
      const transcriptText =
        turns.length > 0
          ? turns
              .map(
                (t: { role: string; content: string }) =>
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
      setLoadingDetail(null);
    }
  };

  return (
    <div className="pb-8">
      <h1 className="text-2xl font-marfa font-bold text-white mb-6 text-center">
        {currentUser?.display_name || "My Training"}
      </h1>

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
                scenario_id: "",
                scenario_mode: "phone",
                scenario_title: "Free Practice",
                counselor_id: currentUser?.id || "",
                status: "in_progress",
                due_date: null,
                completed_at: null,
                supervisor_notes: null,
                session_id: null,
                created_at: new Date().toISOString(),
                updated_at: new Date().toISOString(),
              })
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
                scenario_id: "",
                scenario_mode: "chat",
                scenario_title: "Free Practice",
                counselor_id: currentUser?.id || "",
                status: "in_progress",
                due_date: null,
                completed_at: null,
                supervisor_notes: null,
                session_id: null,
                created_at: new Date().toISOString(),
                updated_at: new Date().toISOString(),
              })
            }
            className="flex-1 bg-blue-500 hover:bg-blue-600 text-white
                       font-marfa font-bold py-4 px-6 rounded-lg flex items-center justify-center gap-3"
          >
            <span className="text-2xl">💬</span>
            <span>Practice by Text</span>
          </button>
        </div>
      </div>

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
            // Handle both camelCase (API) and snake_case (types) field names
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const a = assignment as any;
            const scenarioTitle = a.scenarioTitle || a.scenario_title || "Untitled";
            const scenarioMode = a.scenarioMode || a.scenario_mode || "phone";
            const dueDate = a.dueDate || a.due_date;
            const completedAt = a.completedAt || a.completed_at;
            const supervisorNotes = a.supervisorNotes || a.supervisor_notes;
            const isOverdue = a.isOverdue || a.is_overdue;
            const hasTranscript = a.hasTranscript || a.has_transcript;
            const sessionId = a.sessionId || a.session_id;

            const daysUntilDue = getDaysUntilDue(dueDate);
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
                            {scenarioTitle}
                          </h3>
                          <span
                            className={`px-2 py-0.5 rounded text-xs font-marfa flex-shrink-0 ${
                              scenarioMode === "chat"
                                ? "bg-blue-500/20 text-blue-300"
                                : "bg-green-500/20 text-green-300"
                            }`}
                          >
                            {scenarioMode === "chat" ? "Chat" : "Phone"}
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
                      {isOverdue && (
                        <span className="text-xs px-2 py-1 rounded bg-red-500/20 text-red-300">
                          Overdue
                        </span>
                      )}
                    </div>

                    {/* Due date */}
                    {dueDate && !isCompleted && (
                      <p
                        className={`text-sm ${
                          isOverdue ? "text-red-400" : "text-gray-400"
                        }`}
                      >
                        Due: {formatDate(dueDate)}
                        {daysUntilDue !== null && !isOverdue && (
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
                    {completedAt && (
                      <p className="text-green-400 text-sm">
                        Completed: {formatDate(completedAt)}
                      </p>
                    )}

                    {/* Supervisor notes */}
                    {supervisorNotes && (
                      <p className="text-gray-500 text-sm mt-2 italic">
                        &quot;{supervisorNotes}&quot;
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
                            {hasTranscript && (
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
                        {sessionId && (
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
              <pre className="whitespace-pre-wrap text-gray-200 font-marfa text-sm leading-relaxed">
                {detailModal.content}
              </pre>
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
