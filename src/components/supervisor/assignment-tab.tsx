"use client";

import { useState, useEffect, useMemo, useCallback } from "react";
import {
  Scenario,
  Assignment,
  User,
  ApiResponse,
  BulkAssignmentResponse,
} from "@/types";
import type { AuthFetchFn } from "@/lib/fetch";
import { formatDate, getStatusColor, getUserDisplayName } from "@/lib/format";
import { formatCategoryLabel, CATEGORY_FILTER_OPTIONS } from "@/lib/labels";

export interface AssignmentTabProps {
  authFetch: AuthFetchFn;
  learners: User[];
  globalScenarios: Scenario[];
  categoryFilter: string;
  setCategoryFilter: (value: string) => void;
}

export default function AssignmentTab({
  authFetch,
  learners,
  globalScenarios,
  categoryFilter,
  setCategoryFilter,
}: AssignmentTabProps) {
  // Assignment data state
  const [assignments, setAssignments] = useState<Assignment[]>([]);
  const [assignmentsLoading, setAssignmentsLoading] = useState(false);
  const [assignmentStatusFilter, setAssignmentStatusFilter] = useState("");
  const [tabError, setTabError] = useState<string | null>(null);

  // Form UI toggle
  const [showAssignmentForm, setShowAssignmentForm] = useState(false);

  // Bulk selection state
  const [selectedLearnerIds, setSelectedLearnerIds] = useState<Set<string>>(new Set());
  const [selectedScenarioIds, setSelectedScenarioIds] = useState<Set<string>>(new Set());
  const [learnerSearch, setLearnerSearch] = useState("");
  const [assignmentFormData, setAssignmentFormData] = useState({
    due_date: "",
    supervisor_notes: "",
  });
  const [savingAssignment, setSavingAssignment] = useState(false);
  const [bulkResult, setBulkResult] = useState<BulkAssignmentResponse | null>(null);
  const [pendingConfirmation, setPendingConfirmation] = useState(false);

  const filteredLearners = useMemo(() => {
    if (!learnerSearch.trim()) return learners;
    const term = learnerSearch.toLowerCase();
    return learners.filter((c) => {
      const name = getUserDisplayName(c).toLowerCase();
      return name.split(/\s+/).some((word: string) => word.startsWith(term));
    });
  }, [learners, learnerSearch]);

  const allVisibleLearnersSelected = useMemo(() => {
    return (
      filteredLearners.length > 0 &&
      filteredLearners.every((c) => selectedLearnerIds.has(c.id))
    );
  }, [filteredLearners, selectedLearnerIds]);

  const assignableScenarios = useMemo(() => {
    if (!categoryFilter) return globalScenarios;
    return globalScenarios.filter((s) =>
      categoryFilter === "uncategorized" ? !s.category : s.category === categoryFilter
    );
  }, [categoryFilter, globalScenarios]);

  const filteredAssignments = useMemo(() => {
    if (!categoryFilter) return assignments;

    const scenarioCategories = new Map<string, string | null>();
    globalScenarios.forEach((s) => scenarioCategories.set(s.id, s.category));

    return assignments.filter((a) => {
      const category = scenarioCategories.get(a.scenarioId);
      if (categoryFilter === "uncategorized") {
        return !category;
      }
      return category === categoryFilter;
    });
  }, [categoryFilter, assignments, globalScenarios]);

  const assignmentCount = selectedLearnerIds.size * selectedScenarioIds.size;

  const loadAssignments = useCallback(async () => {
    setAssignmentsLoading(true);
    try {
      const params = new URLSearchParams();
      if (assignmentStatusFilter) params.set("status", assignmentStatusFilter);
      const response = await authFetch(`/api/assignments?${params}`);
      const data: ApiResponse<Assignment[]> = await response.json();
      if (!data.ok) throw new Error(data.error.message);
      setAssignments(data.data);
    } catch (err) {
      setTabError("Failed to load assignments");
      console.error(err);
    } finally {
      setAssignmentsLoading(false);
    }
  }, [assignmentStatusFilter, authFetch]);

  useEffect(() => {
    loadAssignments();
  }, [loadAssignments]);

  const toggleLearner = (id: string) => {
    setSelectedLearnerIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleScenario = (id: string) => {
    setSelectedScenarioIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleAllLearners = () => {
    const visibleIds = filteredLearners.map((c) => c.id);
    if (allVisibleLearnersSelected) {
      setSelectedLearnerIds((prev) => {
        const next = new Set(prev);
        visibleIds.forEach((id) => next.delete(id));
        return next;
      });
    } else {
      setSelectedLearnerIds((prev) => {
        const next = new Set(prev);
        visibleIds.forEach((id) => next.add(id));
        return next;
      });
    }
  };

  const toggleAllScenarios = () => {
    if (selectedScenarioIds.size === assignableScenarios.length) {
      setSelectedScenarioIds(new Set());
    } else {
      setSelectedScenarioIds(new Set(assignableScenarios.map((s) => s.id)));
    }
  };

  const handleBulkCreate = async (forceReassign = false) => {
    setSavingAssignment(true);
    setTabError(null);
    if (!forceReassign) {
      setBulkResult(null);
      setPendingConfirmation(false);
    }

    try {
      const response = await authFetch("/api/assignments", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          learnerIds: Array.from(selectedLearnerIds),
          scenarioIds: Array.from(selectedScenarioIds),
          dueDate: assignmentFormData.due_date || undefined,
          supervisorNotes: assignmentFormData.supervisor_notes || undefined,
          forceReassign,
        }),
      });

      const data = await response.json();
      if (!data.ok) throw new Error(data.error?.message || "Failed to create assignments");

      setBulkResult(data.data);

      if (data.data.requiresConfirmation) {
        setPendingConfirmation(true);
        setSavingAssignment(false);
        return;
      }

      await loadAssignments();

      const hasBlocked = data.data.blocked && data.data.blocked.length > 0;
      const hasSkipped = data.data.skipped > 0;

      if (!hasBlocked && !hasSkipped) {
        setTimeout(() => {
          setShowAssignmentForm(false);
          setBulkResult(null);
          setPendingConfirmation(false);
          setSelectedLearnerIds(new Set());
          setSelectedScenarioIds(new Set());
          setLearnerSearch("");
          setAssignmentFormData({ due_date: "", supervisor_notes: "" });
        }, 1500);
      }
    } catch (err) {
      setTabError(err instanceof Error ? err.message : "Failed to create assignments");
    } finally {
      setSavingAssignment(false);
    }
  };

  const handleDeleteAssignment = async (id: string) => {
    if (!window.confirm("Delete this assignment? This cannot be undone.")) return;

    try {
      const response = await authFetch(`/api/assignments/${id}`, { method: "DELETE" });
      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error?.message || "Delete failed");
      }
      await loadAssignments();
    } catch {
      setTabError("Failed to delete assignment");
    }
  };

  return (
    <div>
      {/* Tab-level error */}
      {tabError && (
        <div className="mb-4 p-3 bg-red-500/20 border border-red-500 rounded-lg text-red-300">
          {tabError}
          <button
            onClick={() => setTabError(null)}
            className="ml-4 text-red-400 hover:text-red-200"
          >
            Dismiss
          </button>
        </div>
      )}

      {/* Category Filter */}
      <div className="flex flex-wrap gap-2 mb-4">
        {CATEGORY_FILTER_OPTIONS.map((cat) => (
          <button
            key={cat.value}
            onClick={() =>
              setCategoryFilter(categoryFilter === cat.value ? "" : cat.value)
            }
            className={`px-3 py-1 rounded-full text-sm font-marfa transition-colors ${
              categoryFilter === cat.value
                ? "bg-purple-600 text-white"
                : "bg-gray-700 text-gray-300 hover:bg-gray-600"
            }`}
          >
            {cat.label}
          </button>
        ))}
      </div>

      <div className="flex justify-between items-center mb-4">
        <button
          onClick={() => setShowAssignmentForm(true)}
          disabled={assignableScenarios.length === 0 || learners.length === 0}
          className="bg-brand-orange hover:bg-brand-orange-hover
                     text-white font-marfa font-bold py-2 px-4 rounded
                     disabled:opacity-50 disabled:cursor-not-allowed"
        >
          + Create Assignment
        </button>

        <select
          value={assignmentStatusFilter}
          onChange={(e) => setAssignmentStatusFilter(e.target.value)}
          className="bg-gray-800 border border-gray-600 rounded px-3 py-2
                     text-white font-marfa focus:outline-none focus:border-brand-orange"
        >
          <option value="">All Statuses</option>
          <option value="pending">Pending</option>
          <option value="in_progress">In Progress</option>
          <option value="completed">Completed</option>
        </select>
      </div>

      {assignmentsLoading ? (
        <p className="text-gray-400">Loading assignments...</p>
      ) : filteredAssignments.length === 0 ? (
        <p className="text-gray-400">
          {categoryFilter ? `No assignments in "${formatCategoryLabel(categoryFilter)}" category.` : "No assignments yet."}
        </p>
      ) : (
        <div className="space-y-3">
          {filteredAssignments.map((assignment) => (
              <div
                key={assignment.id}
                className="bg-brand-navy border border-gray-700 rounded-lg p-4"
              >
                <div className="flex justify-between items-start">
                  <div className="flex-grow">
                    <div className="flex items-center gap-3">
                      <h3 className="text-white font-marfa font-medium">
                        {assignment.scenarioTitle || "Untitled"}
                      </h3>
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
                    <p className="text-gray-400 text-sm mt-1">
                      Assigned to: {assignment.learnerName || "Unknown"}
                    </p>
                    {assignment.dueDate && (
                      <p className="text-gray-500 text-xs mt-1">
                        Due: {formatDate(assignment.dueDate)}
                      </p>
                    )}
                    {assignment.completedAt && (
                      <p className="text-green-400 text-xs mt-1">
                        Completed: {formatDate(assignment.completedAt)}
                      </p>
                    )}
                  </div>
                  <div className="flex gap-3 ml-4">
                    <button
                      onClick={() => handleDeleteAssignment(assignment.id)}
                      className="text-red-400 hover:text-red-300 text-sm"
                    >
                      Delete
                    </button>
                  </div>
                </div>
              </div>
            )
          )}
        </div>
      )}

      {/* Create Assignment Form Modal */}
      {showAssignmentForm && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-brand-navy border border-gray-700 rounded-lg p-6 w-full max-w-2xl max-h-[90vh] overflow-y-auto">
            <h2 className="text-xl font-marfa text-white mb-4">Create Assignments</h2>

            <div className="space-y-4">
              {/* Learner Selection */}
              <div>
                <div className="flex items-center justify-between mb-2">
                  <label className="text-sm font-medium text-gray-300 font-marfa">
                    Select Learners ({selectedLearnerIds.size} selected)
                  </label>
                  <button
                    type="button"
                    onClick={toggleAllLearners}
                    className="text-xs text-brand-orange hover:text-brand-orange-light font-marfa"
                  >
                    {allVisibleLearnersSelected ? "Clear All" : "Select All"}
                  </button>
                </div>
                <input
                  type="text"
                  value={learnerSearch}
                  onChange={(e) => setLearnerSearch(e.target.value)}
                  placeholder="Search by name..."
                  className="w-full bg-gray-800 border border-gray-600 rounded px-3 py-2 mb-2 text-white font-marfa focus:outline-none focus:border-brand-orange"
                />
                <div className="max-h-48 overflow-y-auto border border-gray-600 rounded-md p-2 bg-gray-800">
                  {filteredLearners.length === 0 ? (
                    <p className="text-gray-500 text-sm py-2 px-2">No learners found</p>
                  ) : (
                    filteredLearners.map((c) => (
                      <div
                        key={c.id}
                        className="flex items-center justify-between py-1.5 px-2 hover:bg-gray-700 rounded"
                      >
                        <label className="flex items-center gap-2 text-white cursor-pointer flex-grow">
                          <input
                            type="checkbox"
                            checked={selectedLearnerIds.has(c.id)}
                            onChange={() => toggleLearner(c.id)}
                            className="w-4 h-4 accent-brand-orange"
                          />
                          <span className="font-marfa">{getUserDisplayName(c)}</span>
                        </label>
                        <a
                          href={`/learner?userId=${c.id}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-xs text-blue-400 hover:text-blue-300 font-marfa ml-2"
                          title="View learner dashboard"
                        >
                          View
                        </a>
                      </div>
                    ))
                  )}
                </div>
              </div>

              {/* Scenario Selection */}
              <div>
                <div className="flex items-center justify-between mb-2">
                  <label className="text-sm font-medium text-gray-300 font-marfa">
                    Select Scenarios ({selectedScenarioIds.size} selected)
                  </label>
                  <button
                    type="button"
                    onClick={toggleAllScenarios}
                    className="text-xs text-brand-orange hover:text-brand-orange-light font-marfa"
                  >
                    {selectedScenarioIds.size === assignableScenarios.length
                      ? "Clear All"
                      : "Select All"}
                  </button>
                </div>
                <div className="max-h-48 overflow-y-auto border border-gray-600 rounded-md p-2 bg-gray-800">
                  {assignableScenarios.length === 0 ? (
                    <p className="text-gray-500 text-sm py-2 px-2">No scenarios found</p>
                  ) : (
                    assignableScenarios.map((s) => (
                      <label
                        key={s.id}
                        className="flex items-center gap-2 py-1.5 px-2 text-white cursor-pointer hover:bg-gray-700 rounded"
                      >
                        <input
                          type="checkbox"
                          checked={selectedScenarioIds.has(s.id)}
                          onChange={() => toggleScenario(s.id)}
                          className="w-4 h-4 accent-brand-orange"
                        />
                        <span className="font-marfa">{s.title}</span>
                      </label>
                    ))
                  )}
                </div>
              </div>

              {/* Due Date & Notes */}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-gray-300 text-sm font-marfa mb-1">
                    Due Date (Optional)
                  </label>
                  <input
                    type="datetime-local"
                    value={assignmentFormData.due_date}
                    onChange={(e) =>
                      setAssignmentFormData({
                        ...assignmentFormData,
                        due_date: e.target.value,
                      })
                    }
                    className="w-full bg-gray-800 border border-gray-600 rounded px-3 py-2 text-white font-marfa focus:outline-none focus:border-brand-orange"
                  />
                </div>
                <div>
                  <label className="block text-gray-300 text-sm font-marfa mb-1">
                    Notes (Optional)
                  </label>
                  <input
                    type="text"
                    placeholder="Notes for all assignments..."
                    value={assignmentFormData.supervisor_notes}
                    onChange={(e) =>
                      setAssignmentFormData({
                        ...assignmentFormData,
                        supervisor_notes: e.target.value,
                      })
                    }
                    className="w-full bg-gray-800 border border-gray-600 rounded px-3 py-2 text-white font-marfa focus:outline-none focus:border-brand-orange"
                  />
                </div>
              </div>

              {/* Preview */}
              {assignmentCount > 0 && (
                <div className="bg-gray-700 p-3 rounded text-sm text-gray-300 font-marfa">
                  Creating{" "}
                  <span className="text-brand-orange font-bold">{assignmentCount}</span>{" "}
                  assignment{assignmentCount !== 1 ? "s" : ""} ({selectedLearnerIds.size}{" "}
                  learner{selectedLearnerIds.size !== 1 ? "s" : ""} ×{" "}
                  {selectedScenarioIds.size} scenario
                  {selectedScenarioIds.size !== 1 ? "s" : ""})
                </div>
              )}

              {/* Result Summary / Warnings */}
              {bulkResult && (
                <div className="space-y-3">
                  {/* Confirmation required for completed assignments */}
                  {bulkResult.requiresConfirmation && bulkResult.warnings && bulkResult.warnings.length > 0 && (
                    <div className="p-3 rounded-lg font-marfa bg-yellow-900/30 border border-yellow-700">
                      <p className="text-yellow-300 font-medium mb-2">
                        {bulkResult.warnings.length} learner(s) have already completed this scenario
                      </p>
                      <p className="text-gray-300 text-sm mb-3">
                        Do you want to assign it again for additional practice?
                      </p>
                      <div className="flex gap-2">
                        <button
                          onClick={() => handleBulkCreate(true)}
                          disabled={savingAssignment}
                          className="px-3 py-1 bg-yellow-600 hover:bg-yellow-500 text-white rounded text-sm font-medium disabled:opacity-50"
                        >
                          Yes, Reassign
                        </button>
                        <button
                          onClick={() => {
                            setBulkResult(null);
                            setPendingConfirmation(false);
                          }}
                          className="px-3 py-1 bg-gray-600 hover:bg-gray-500 text-white rounded text-sm"
                        >
                          Cancel
                        </button>
                      </div>
                    </div>
                  )}

                  {/* Blocked assignments (active/in-progress) */}
                  {bulkResult.blocked && bulkResult.blocked.length > 0 && (
                    <div className="p-3 rounded-lg font-marfa bg-red-900/30 border border-red-700">
                      <span className="text-red-300">
                        {bulkResult.blocked.length} skipped - already assigned and not completed
                      </span>
                    </div>
                  )}

                  {/* Success message */}
                  {bulkResult.created > 0 && !bulkResult.requiresConfirmation && (
                    <div className="p-3 rounded-lg font-marfa bg-green-900/30 border border-green-700">
                      <span className="text-white">
                        Created {bulkResult.created} assignment
                        {bulkResult.created !== 1 ? "s" : ""}
                      </span>
                      {bulkResult.skipped > 0 && (
                        <span className="text-yellow-400 ml-2">
                          ({bulkResult.skipped} skipped - already assigned)
                        </span>
                      )}
                    </div>
                  )}
                </div>
              )}

              {/* Action Buttons */}
              {!pendingConfirmation && (
                <div className="flex justify-end gap-3 pt-4">
                  <button
                    type="button"
                    onClick={() => {
                      setShowAssignmentForm(false);
                      setSelectedLearnerIds(new Set());
                      setSelectedScenarioIds(new Set());
                      setBulkResult(null);
                      setPendingConfirmation(false);
                    }}
                    className="px-4 py-2 text-gray-400 hover:text-white font-marfa"
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    onClick={() => handleBulkCreate(false)}
                    disabled={assignmentCount === 0 || savingAssignment}
                    className="px-4 py-2 bg-brand-orange hover:bg-brand-orange-hover
                               text-white font-marfa font-bold rounded disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {savingAssignment
                      ? "Creating..."
                      : `Create ${assignmentCount} Assignment${
                          assignmentCount !== 1 ? "s" : ""
                        }`}
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
