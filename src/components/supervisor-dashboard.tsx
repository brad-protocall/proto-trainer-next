"use client";

import { useState, useEffect, useMemo, useCallback } from "react";
import {
  Scenario,
  Assignment,
  User,
  Account,
  ScenarioCategory,
  ScenarioMode,
  ApiResponse,
} from "@/types";
import { createAuthFetch } from "@/lib/fetch";
import { formatDate, getStatusColor } from "@/lib/format";
import BulkImportModal from "./bulk-import-modal";

const SCENARIO_CATEGORIES = [
  { value: "", label: "All" },
  { value: "onboarding", label: "Onboarding" },
  { value: "refresher", label: "Refresher" },
  { value: "advanced", label: "Advanced" },
  { value: "assessment", label: "Assessment" },
  { value: "uncategorized", label: "Uncategorized" },
];

const CATEGORY_LABELS: Record<string, string> = {
  onboarding: "Onboarding",
  refresher: "Refresher",
  advanced: "Advanced",
  assessment: "Assessment",
};

interface ScenarioFormData {
  title: string;
  description: string;
  prompt: string;
  account_id: string | null;
  mode: ScenarioMode;
  relevant_policy_sections: string;
  category: ScenarioCategory | null;
}

interface AssignmentFormData {
  scenario_id: string;
  counselor_id: string;
  due_date: string;
  supervisor_notes: string;
}

export default function SupervisorDashboard() {
  const [activeTab, setActiveTab] = useState<"scenarios" | "assignments">("scenarios");

  // Scenarios state
  const [scenarios, setScenarios] = useState<Scenario[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [editingScenario, setEditingScenario] = useState<Scenario | null>(null);
  const [saving, setSaving] = useState(false);
  const [scenarioFilter, setScenarioFilter] = useState<"global" | "one-time">("global");
  const [categoryFilter, setCategoryFilter] = useState("");
  const [showBulkImport, setShowBulkImport] = useState(false);

  // Account state (reserved for future use)
  const [, setAccounts] = useState<Account[]>([]);

  // Scenario form state
  const [formData, setFormData] = useState<ScenarioFormData>({
    title: "",
    description: "",
    prompt: "",
    account_id: null,
    mode: "phone",
    relevant_policy_sections: "",
    category: null,
  });

  // Assignments state
  const [assignments, setAssignments] = useState<Assignment[]>([]);
  const [assignmentsLoading, setAssignmentsLoading] = useState(false);
  const [counselors, setCounselors] = useState<User[]>([]);
  const [showAssignmentForm, setShowAssignmentForm] = useState(false);
  const [assignmentFormData, setAssignmentFormData] = useState<AssignmentFormData>({
    scenario_id: "",
    counselor_id: "",
    due_date: "",
    supervisor_notes: "",
  });
  const [savingAssignment, setSavingAssignment] = useState(false);
  const [assignmentStatusFilter, setAssignmentStatusFilter] = useState("");

  // Bulk assignment state
  const [selectedCounselorIds, setSelectedCounselorIds] = useState<Set<string>>(new Set());
  const [selectedScenarioIds, setSelectedScenarioIds] = useState<Set<string>>(new Set());
  const [counselorSearch, setCounselorSearch] = useState("");
  const [bulkResult, setBulkResult] = useState<{ created: number; skipped: number } | null>(null);

  // Global scenarios cache for assignment dropdown
  const [globalScenariosCache, setGlobalScenariosCache] = useState<Scenario[]>([]);

  // Current supervisor user for auth
  const [currentUser, setCurrentUser] = useState<User | null>(null);

  // Create authenticated fetch bound to current user
  const authFetch = useMemo(
    () => (currentUser ? createAuthFetch(currentUser.id) : fetch),
    [currentUser]
  );

  const filteredCounselors = useMemo(() => {
    if (!counselorSearch.trim()) return counselors;
    const term = counselorSearch.toLowerCase();
    return counselors.filter((c) => {
      const name = (c.display_name || c.email || "").toLowerCase();
      return name.split(/\s+/).some((word) => word.startsWith(term));
    });
  }, [counselors, counselorSearch]);

  const allVisibleCounselorsSelected = useMemo(() => {
    return (
      filteredCounselors.length > 0 &&
      filteredCounselors.every((c) => selectedCounselorIds.has(c.id))
    );
  }, [filteredCounselors, selectedCounselorIds]);

  const assignableScenarios = useMemo(() => {
    if (!categoryFilter) return globalScenariosCache;
    return globalScenariosCache.filter((s) =>
      categoryFilter === "uncategorized" ? !s.category : s.category === categoryFilter
    );
  }, [categoryFilter, globalScenariosCache]);

  const assignmentCount = selectedCounselorIds.size * selectedScenarioIds.size;

  const loadScenarios = useCallback(async () => {
    if (!currentUser) return;
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams();
      params.set("is_one_time", String(scenarioFilter === "one-time"));
      const response = await authFetch(`/api/scenarios?${params}`);
      const data: ApiResponse<Scenario[]> = await response.json();
      if (!data.ok) throw new Error(data.error.message);
      setScenarios(data.data);
    } catch (err) {
      setError("Failed to load scenarios");
      console.error(err);
    } finally {
      setLoading(false);
    }
  }, [scenarioFilter, currentUser, authFetch]);

  const loadAssignments = useCallback(async () => {
    if (!currentUser) return;
    setAssignmentsLoading(true);
    try {
      const params = new URLSearchParams();
      if (assignmentStatusFilter) params.set("status", assignmentStatusFilter);
      const response = await authFetch(`/api/assignments?${params}`);
      const data: ApiResponse<Assignment[]> = await response.json();
      if (!data.ok) throw new Error(data.error.message);
      setAssignments(data.data);
    } catch (err) {
      setError("Failed to load assignments");
      console.error(err);
    } finally {
      setAssignmentsLoading(false);
    }
  }, [assignmentStatusFilter, currentUser, authFetch]);

  // Load supervisor user on mount
  useEffect(() => {
    const loadSupervisorUser = async () => {
      try {
        const response = await fetch("/api/users?role=supervisor");
        const data: ApiResponse<User[]> = await response.json();
        if (data.ok && data.data.length > 0) {
          setCurrentUser(data.data[0]);
        }
      } catch (err) {
        console.error("Failed to load supervisor user:", err);
      }
    };
    loadSupervisorUser();
    loadAccounts();
    loadCounselors();
  }, []);

  // Reload scenarios when filter changes
  useEffect(() => {
    loadScenarios();
  }, [loadScenarios]);

  useEffect(() => {
    if (activeTab === "assignments") {
      loadAssignments();
    }
  }, [activeTab, loadAssignments]);

  // Load global scenarios for assignment dropdown
  useEffect(() => {
    if (!currentUser) return;
    const loadGlobalScenarios = async () => {
      try {
        const response = await authFetch("/api/scenarios?is_one_time=false");
        const data: ApiResponse<Scenario[]> = await response.json();
        if (data.ok) {
          setGlobalScenariosCache(data.data);
        }
      } catch (err) {
        console.error("Failed to load global scenarios", err);
      }
    };
    loadGlobalScenarios();
  }, [currentUser, authFetch]);

  // Update cache when viewing global scenarios
  useEffect(() => {
    if (scenarioFilter === "global" && scenarios.length > 0) {
      setGlobalScenariosCache(scenarios);
    }
  }, [scenarios, scenarioFilter]);

  const loadAccounts = async () => {
    try {
      const response = await fetch("/api/accounts");
      const data: ApiResponse<Account[]> = await response.json();
      if (data.ok) setAccounts(data.data);
    } catch (err) {
      console.error("Failed to load accounts", err);
    }
  };

  const loadCounselors = async () => {
    try {
      const response = await fetch("/api/users?role=counselor");
      const data: ApiResponse<User[]> = await response.json();
      if (data.ok) setCounselors(data.data);
    } catch (err) {
      console.error("Failed to load counselors", err);
    }
  };

  const resetForm = () => {
    setFormData({
      title: "",
      description: "",
      prompt: "",
      account_id: null,
      mode: "phone",
      relevant_policy_sections: "",
      category: null,
    });
    setEditingScenario(null);
    setShowForm(false);
  };

  const openCreateForm = () => {
    resetForm();
    setShowForm(true);
  };

  const openEditForm = (scenario: Scenario) => {
    setFormData({
      title: scenario.title,
      description: scenario.description || "",
      prompt: scenario.prompt,
      account_id: scenario.account_id,
      mode: scenario.mode,
      relevant_policy_sections: scenario.relevant_policy_sections || "",
      category: scenario.category,
    });
    setEditingScenario(scenario);
    setShowForm(true);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setError(null);

    try {
      const url = editingScenario
        ? `/api/scenarios/${editingScenario.id}`
        : "/api/scenarios";
      const method = editingScenario ? "PUT" : "POST";

      const response = await authFetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(formData),
      });

      const data: ApiResponse<Scenario> = await response.json();
      if (!data.ok) throw new Error(data.error.message);

      await loadScenarios();
      resetForm();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save scenario");
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (!window.confirm("Delete this scenario? This cannot be undone.")) return;

    try {
      const response = await authFetch(`/api/scenarios/${id}`, { method: "DELETE" });
      const data: ApiResponse<null> = await response.json();
      if (!data.ok) throw new Error(data.error.message);
      await loadScenarios();
    } catch {
      setError("Failed to delete scenario");
    }
  };

  const toggleCounselor = (id: string) => {
    setSelectedCounselorIds((prev) => {
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

  const toggleAllCounselors = () => {
    const visibleIds = filteredCounselors.map((c) => c.id);
    if (allVisibleCounselorsSelected) {
      setSelectedCounselorIds((prev) => {
        const next = new Set(prev);
        visibleIds.forEach((id) => next.delete(id));
        return next;
      });
    } else {
      setSelectedCounselorIds((prev) => {
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

  const handleBulkCreate = async () => {
    setSavingAssignment(true);
    setError(null);
    setBulkResult(null);

    try {
      const response = await authFetch("/api/assignments", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          counselor_ids: Array.from(selectedCounselorIds),
          scenario_ids: Array.from(selectedScenarioIds),
          due_date: assignmentFormData.due_date || null,
          supervisor_notes: assignmentFormData.supervisor_notes || null,
        }),
      });

      const data = await response.json();
      if (!data.ok) throw new Error(data.error?.message || "Failed to create assignments");

      setBulkResult(data.data);
      await loadAssignments();

      setTimeout(() => {
        setShowAssignmentForm(false);
        setBulkResult(null);
        setSelectedCounselorIds(new Set());
        setSelectedScenarioIds(new Set());
        setCounselorSearch("");
        setAssignmentFormData({ ...assignmentFormData, due_date: "", supervisor_notes: "" });
      }, 1500);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create assignments");
    } finally {
      setSavingAssignment(false);
    }
  };

  const handleDeleteAssignment = async (id: string) => {
    if (!window.confirm("Delete this assignment? This cannot be undone.")) return;

    try {
      const response = await authFetch(`/api/assignments/${id}`, { method: "DELETE" });
      const data: ApiResponse<null> = await response.json();
      if (!data.ok) throw new Error(data.error.message);
      await loadAssignments();
    } catch {
      setError("Failed to delete assignment");
    }
  };

  return (
    <div className="pb-8">
      <h1 className="text-2xl font-marfa font-bold text-white mb-6 text-center">
        Supervisor Dashboard
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

      {/* Tabs */}
      <div className="flex border-b border-gray-700 mb-6">
        <button
          onClick={() => setActiveTab("scenarios")}
          className={`px-4 py-2 font-marfa font-medium transition-colors
                     ${
                       activeTab === "scenarios"
                         ? "text-brand-orange border-b-2 border-brand-orange"
                         : "text-gray-400 hover:text-white"
                     }`}
        >
          Scenarios
        </button>
        <button
          onClick={() => setActiveTab("assignments")}
          className={`px-4 py-2 font-marfa font-medium transition-colors
                     ${
                       activeTab === "assignments"
                         ? "text-brand-orange border-b-2 border-brand-orange"
                         : "text-gray-400 hover:text-white"
                     }`}
        >
          Assignments
        </button>
      </div>

      {/* Scenarios Tab */}
      {activeTab === "scenarios" && (
        <div>
          {/* Filter Toggle */}
          <div className="flex gap-2 mb-4">
            <button
              onClick={() => setScenarioFilter("global")}
              className={`px-3 py-1 rounded text-sm font-marfa ${
                scenarioFilter === "global"
                  ? "bg-brand-orange text-white"
                  : "bg-gray-700 text-gray-300 hover:bg-gray-600"
              }`}
            >
              Global
            </button>
            <button
              onClick={() => setScenarioFilter("one-time")}
              className={`px-3 py-1 rounded text-sm font-marfa ${
                scenarioFilter === "one-time"
                  ? "bg-brand-orange text-white"
                  : "bg-gray-700 text-gray-300 hover:bg-gray-600"
              }`}
            >
              One-Time
            </button>
          </div>

          {/* Action Buttons */}
          <div className="flex gap-3 mb-4">
            {scenarioFilter === "global" && (
              <>
                <button
                  onClick={openCreateForm}
                  className="bg-brand-orange hover:bg-brand-orange-hover
                           text-white font-marfa font-bold py-2 px-4 rounded"
                >
                  + Create Global Scenario
                </button>
                <button
                  onClick={() => setShowBulkImport(true)}
                  className="bg-blue-600 hover:bg-blue-500
                           text-white font-marfa font-bold py-2 px-4 rounded"
                >
                  Import Scenarios
                </button>
              </>
            )}
          </div>

          {loading ? (
            <p className="text-gray-400">Loading scenarios...</p>
          ) : scenarios.length === 0 ? (
            <p className="text-gray-400">
              {scenarioFilter === "one-time"
                ? "No one-time scenarios yet."
                : "No scenarios yet. Create your first one!"}
            </p>
          ) : (
            <div className="space-y-3">
              {scenarios.map((scenario) => (
                <div
                  key={scenario.id}
                  className="bg-brand-navy border border-gray-700 rounded-lg p-4
                             flex justify-between items-start"
                >
                  <div className="flex-grow">
                    <div className="flex items-center gap-2">
                      <h3 className="text-white font-marfa font-medium">
                        {scenario.title}
                      </h3>
                      <span className="text-xs px-2 py-1 rounded bg-gray-600 text-gray-300">
                        {scenario.mode === "chat" ? "Chat" : "Phone"}
                      </span>
                      {scenario.category && (
                        <span className="text-xs px-2 py-1 rounded bg-purple-500/20 text-purple-300">
                          {CATEGORY_LABELS[scenario.category] || scenario.category}
                        </span>
                      )}
                      {scenario.is_one_time && (
                        <span className="text-xs px-2 py-1 rounded bg-yellow-500/20 text-yellow-300">
                          One-Time
                        </span>
                      )}
                    </div>
                    {scenario.description && (
                      <p className="text-gray-400 text-sm mt-1">
                        {scenario.description}
                      </p>
                    )}
                    {scenario.evaluator_context_path && (
                      <span className="inline-block mt-2 text-xs bg-brand-orange/20 text-brand-orange px-2 py-1 rounded">
                        Has evaluator context
                      </span>
                    )}
                  </div>
                  <div className="flex gap-3 ml-4">
                    <button
                      onClick={() => openEditForm(scenario)}
                      className="text-brand-orange hover:text-brand-orange-light text-sm"
                    >
                      Edit
                    </button>
                    <button
                      onClick={() => handleDelete(scenario.id)}
                      className="text-red-400 hover:text-red-300 text-sm"
                    >
                      Delete
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Assignments Tab */}
      {activeTab === "assignments" && (
        <div>
          {/* Category Filter */}
          <div className="flex flex-wrap gap-2 mb-4">
            {SCENARIO_CATEGORIES.map((cat) => (
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
              disabled={assignableScenarios.length === 0 || counselors.length === 0}
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
          ) : assignments.length === 0 ? (
            <p className="text-gray-400">No assignments yet.</p>
          ) : (
            <div className="space-y-3">
              {assignments.map((assignment) => (
                <div
                  key={assignment.id}
                  className="bg-brand-navy border border-gray-700 rounded-lg p-4"
                >
                  <div className="flex justify-between items-start">
                    <div className="flex-grow">
                      <div className="flex items-center gap-3">
                        <h3 className="text-white font-marfa font-medium">
                          {assignment.scenario_title}
                        </h3>
                        <span
                          className={`text-xs px-2 py-1 rounded ${getStatusColor(
                            assignment.status
                          )}`}
                        >
                          {assignment.status.replace("_", " ")}
                        </span>
                        {assignment.is_overdue && (
                          <span className="text-xs px-2 py-1 rounded bg-red-500/20 text-red-300">
                            Overdue
                          </span>
                        )}
                      </div>
                      <p className="text-gray-400 text-sm mt-1">
                        Assigned to: {assignment.counselor_name || "Unknown"}
                      </p>
                      {assignment.due_date && (
                        <p className="text-gray-500 text-xs mt-1">
                          Due: {formatDate(assignment.due_date)}
                        </p>
                      )}
                      {assignment.completed_at && (
                        <p className="text-green-400 text-xs mt-1">
                          Completed: {formatDate(assignment.completed_at)}
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
              ))}
            </div>
          )}
        </div>
      )}

      {/* Create/Edit Scenario Form Modal */}
      {showForm && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-brand-navy border border-gray-700 rounded-lg p-6 w-full max-w-lg max-h-[90vh] overflow-y-auto">
            <h2 className="text-xl font-marfa text-white mb-4">
              {editingScenario ? "Edit Scenario" : "Create Scenario"}
            </h2>

            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label className="block text-gray-300 text-sm font-marfa mb-1">
                  Title *
                </label>
                <input
                  type="text"
                  value={formData.title}
                  onChange={(e) =>
                    setFormData({ ...formData, title: e.target.value })
                  }
                  required
                  maxLength={255}
                  className="w-full bg-gray-800 border border-gray-600 rounded px-3 py-2
                             text-white font-marfa focus:outline-none focus:border-brand-orange"
                  placeholder="e.g., Suicidal Ideation - High Risk"
                />
              </div>

              <div>
                <label className="block text-gray-300 text-sm font-marfa mb-1">
                  Description
                </label>
                <input
                  type="text"
                  value={formData.description}
                  onChange={(e) =>
                    setFormData({ ...formData, description: e.target.value })
                  }
                  className="w-full bg-gray-800 border border-gray-600 rounded px-3 py-2
                             text-white font-marfa focus:outline-none focus:border-brand-orange"
                  placeholder="Brief description of the scenario"
                />
              </div>

              <div>
                <label className="block text-gray-300 text-sm font-marfa mb-1">
                  Mode
                </label>
                <select
                  value={formData.mode}
                  onChange={(e) =>
                    setFormData({
                      ...formData,
                      mode: e.target.value as ScenarioMode,
                    })
                  }
                  className="w-full bg-gray-800 border border-gray-600 rounded px-3 py-2
                             text-white font-marfa focus:outline-none focus:border-brand-orange"
                >
                  <option value="phone">Phone (Voice)</option>
                  <option value="chat">Chat (Text)</option>
                </select>
              </div>

              <div>
                <label className="block text-gray-300 text-sm font-marfa mb-1">
                  Category
                </label>
                <select
                  value={formData.category || ""}
                  onChange={(e) =>
                    setFormData({
                      ...formData,
                      category: (e.target.value || null) as ScenarioCategory | null,
                    })
                  }
                  className="w-full bg-gray-800 border border-gray-600 rounded px-3 py-2
                             text-white font-marfa focus:outline-none focus:border-brand-orange"
                >
                  <option value="">-- None --</option>
                  <option value="onboarding">Onboarding</option>
                  <option value="refresher">Refresher</option>
                  <option value="advanced">Advanced</option>
                  <option value="assessment">Assessment</option>
                </select>
              </div>

              <div>
                <label className="block text-gray-300 text-sm font-marfa mb-1">
                  Prompt (Instructions for AI Caller) *
                </label>
                <textarea
                  value={formData.prompt}
                  onChange={(e) =>
                    setFormData({ ...formData, prompt: e.target.value })
                  }
                  required
                  rows={6}
                  maxLength={10000}
                  className="w-full bg-gray-800 border border-gray-600 rounded px-3 py-2
                             text-white font-marfa focus:outline-none focus:border-brand-orange"
                  placeholder="Describe the caller's situation, mood, and how they should respond..."
                />
              </div>

              <div className="flex justify-end gap-3 pt-4">
                <button
                  type="button"
                  onClick={resetForm}
                  className="px-4 py-2 text-gray-400 hover:text-white font-marfa"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={saving}
                  className="px-4 py-2 bg-brand-orange hover:bg-brand-orange-hover
                             text-white font-marfa font-bold rounded disabled:opacity-50"
                >
                  {saving ? "Saving..." : editingScenario ? "Update" : "Create"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Create Assignment Form Modal */}
      {showAssignmentForm && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-brand-navy border border-gray-700 rounded-lg p-6 w-full max-w-2xl max-h-[90vh] overflow-y-auto">
            <h2 className="text-xl font-marfa text-white mb-4">Create Assignments</h2>

            <div className="space-y-4">
              {/* Counselor Selection */}
              <div>
                <div className="flex items-center justify-between mb-2">
                  <label className="text-sm font-medium text-gray-300 font-marfa">
                    Select Counselors ({selectedCounselorIds.size} selected)
                  </label>
                  <button
                    type="button"
                    onClick={toggleAllCounselors}
                    className="text-xs text-brand-orange hover:text-brand-orange-light font-marfa"
                  >
                    {allVisibleCounselorsSelected ? "Clear All" : "Select All"}
                  </button>
                </div>
                <input
                  type="text"
                  value={counselorSearch}
                  onChange={(e) => setCounselorSearch(e.target.value)}
                  placeholder="Search by name..."
                  className="w-full bg-gray-800 border border-gray-600 rounded px-3 py-2 mb-2 text-white font-marfa focus:outline-none focus:border-brand-orange"
                />
                <div className="max-h-48 overflow-y-auto border border-gray-600 rounded-md p-2 bg-gray-800">
                  {filteredCounselors.length === 0 ? (
                    <p className="text-gray-500 text-sm py-2 px-2">No counselors found</p>
                  ) : (
                    filteredCounselors.map((c) => (
                      <label
                        key={c.id}
                        className="flex items-center gap-2 py-1.5 px-2 text-white cursor-pointer hover:bg-gray-700 rounded"
                      >
                        <input
                          type="checkbox"
                          checked={selectedCounselorIds.has(c.id)}
                          onChange={() => toggleCounselor(c.id)}
                          className="w-4 h-4 accent-brand-orange"
                        />
                        <span className="font-marfa">
                          {c.display_name || c.email || "Unknown"}
                        </span>
                      </label>
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
                  assignment{assignmentCount !== 1 ? "s" : ""} ({selectedCounselorIds.size}{" "}
                  counselor{selectedCounselorIds.size !== 1 ? "s" : ""} ×{" "}
                  {selectedScenarioIds.size} scenario
                  {selectedScenarioIds.size !== 1 ? "s" : ""})
                </div>
              )}

              {/* Result Summary */}
              {bulkResult && (
                <div
                  className={`p-3 rounded-lg font-marfa ${
                    bulkResult.skipped > 0
                      ? "bg-yellow-900/30 border border-yellow-700"
                      : "bg-green-900/30 border border-green-700"
                  }`}
                >
                  <span className="text-white">
                    ✓ Created {bulkResult.created} assignment
                    {bulkResult.created !== 1 ? "s" : ""}
                  </span>
                  {bulkResult.skipped > 0 && (
                    <span className="text-yellow-400 ml-2">
                      ({bulkResult.skipped} skipped - already exist)
                    </span>
                  )}
                </div>
              )}

              {/* Action Buttons */}
              <div className="flex justify-end gap-3 pt-4">
                <button
                  type="button"
                  onClick={() => {
                    setShowAssignmentForm(false);
                    setSelectedCounselorIds(new Set());
                    setSelectedScenarioIds(new Set());
                    setBulkResult(null);
                  }}
                  className="px-4 py-2 text-gray-400 hover:text-white font-marfa"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={handleBulkCreate}
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
            </div>
          </div>
        </div>
      )}

      {/* Bulk Import Modal */}
      <BulkImportModal
        isOpen={showBulkImport}
        onClose={() => setShowBulkImport(false)}
        onSuccess={() => {
          setShowBulkImport(false);
          loadScenarios();
        }}
      />
    </div>
  );
}
