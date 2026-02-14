"use client";

import { useState, useEffect, useMemo, useCallback } from "react";
import {
  Scenario,
  User,
  Account,
  ScenarioCategory,
  ScenarioMode,
  ApiResponse,
  ProcedureHistoryEntry,
} from "@/types";
import type { AuthFetchFn } from "@/lib/fetch";
import { formatCategoryLabel, CATEGORY_OPTIONS } from "@/lib/labels";
import { VALID_SKILLS, type CrisisSkill } from "@/lib/skills";
import { formatSkillLabel } from "@/lib/labels";
import { getUserDisplayName } from "@/lib/format";
import BulkImportModal from "../bulk-import-modal";
import GenerateScenarioModal from "../generate-scenario-modal";
import AccountSearchDropdown from "./account-search-dropdown";

/** Inline component for uploading/viewing account procedure PDFs */
function AccountProceduresUpload({
  accountId,
  accounts,
  authFetch,
  onAccountsChanged,
}: {
  accountId: string;
  accounts: Account[];
  authFetch: AuthFetchFn;
  onAccountsChanged: () => void;
}) {
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [uploadSuccess, setUploadSuccess] = useState<string | null>(null);

  const account = accounts.find((a) => a.id === accountId);
  if (!account) return null;

  const history = (account.procedureHistory ?? []) as ProcedureHistoryEntry[];
  const latestUpload = history.length > 0 ? history[history.length - 1] : null;

  const handleUpload = async (file: File) => {
    setUploading(true);
    setUploadError(null);
    setUploadSuccess(null);

    try {
      const form = new FormData();
      form.append("policiesFile", file);

      const response = await authFetch(`/api/accounts/${accountId}`, {
        method: "PATCH",
        body: form,
      });

      const data: ApiResponse<Account> = await response.json();
      if (!data.ok) throw new Error(data.error.message);

      setUploadSuccess(`Uploaded ${file.name}`);
      onAccountsChanged();
    } catch (err) {
      setUploadError(err instanceof Error ? err.message : "Upload failed");
    } finally {
      setUploading(false);
    }
  };

  return (
    <div className="bg-gray-800/50 border border-gray-700 rounded-lg p-3">
      <div className="flex items-center justify-between">
        <div className="text-sm text-gray-300">
          {latestUpload ? (
            <span>
              <span className="text-green-400">&#9679;</span>{" "}
              {latestUpload.filename} &middot;{" "}
              {new Date(latestUpload.uploadedAt).toLocaleDateString()}
            </span>
          ) : (
            <span className="text-gray-500">No procedures uploaded</span>
          )}
        </div>
        <label
          className={`cursor-pointer px-3 py-1 text-xs rounded font-marfa ${
            uploading
              ? "bg-gray-600 text-gray-400 cursor-wait"
              : "bg-blue-600 hover:bg-blue-500 text-white"
          }`}
        >
          {uploading ? "Uploading..." : latestUpload ? "Replace PDF" : "Upload Procedures PDF"}
          <input
            type="file"
            accept=".pdf"
            disabled={uploading}
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) handleUpload(file);
              e.target.value = ""; // Reset to allow re-upload of same file
            }}
            className="hidden"
          />
        </label>
      </div>
      {uploadError && (
        <p className="text-xs text-red-400 mt-2">{uploadError}</p>
      )}
      {uploadSuccess && (
        <p className="text-xs text-green-400 mt-2">{uploadSuccess}</p>
      )}
      {history.length > 1 && (
        <details className="mt-2">
          <summary className="text-xs text-gray-500 cursor-pointer hover:text-gray-400">
            Upload history ({history.length} uploads)
          </summary>
          <ul className="mt-1 space-y-1">
            {[...history].reverse().map((entry, i) => (
              <li key={i} className="text-xs text-gray-500">
                {entry.filename} &middot;{" "}
                {new Date(entry.uploadedAt).toLocaleDateString()}
              </li>
            ))}
          </ul>
        </details>
      )}
    </div>
  );
}

interface ScenarioFormData {
  title: string;
  description: string;
  prompt: string;
  account_id: string | null;
  mode: ScenarioMode;
  relevant_policy_sections: string;
  category: ScenarioCategory | null;
  evaluator_context: string;
  evaluator_context_file: File | null;
}

export interface ScenarioTabProps {
  authFetch: AuthFetchFn;
  userId: string | undefined;
  counselors: User[];
  accounts: Account[];
  categoryFilter: string;
  onScenariosChanged: () => void;
  onAccountsChanged: () => void;
}

export default function ScenarioTab({
  authFetch,
  userId,
  counselors,
  accounts,
  categoryFilter,
  onScenariosChanged,
  onAccountsChanged,
}: ScenarioTabProps) {
  // Scenario data state
  const [scenarios, setScenarios] = useState<Scenario[]>([]);
  const [loading, setLoading] = useState(true);
  const [scenarioFilter, setScenarioFilter] = useState<"global" | "one-time">("global");
  const [tabError, setTabError] = useState<string | null>(null);

  // UI toggles
  const [showForm, setShowForm] = useState(false);
  const [editingScenario, setEditingScenario] = useState<Scenario | null>(null);
  const [showBulkImport, setShowBulkImport] = useState(false);
  const [showGenerate, setShowGenerate] = useState(false);

  // Form state
  const [formData, setFormData] = useState<ScenarioFormData>({
    title: "",
    description: "",
    prompt: "",
    account_id: null,
    mode: "phone",
    relevant_policy_sections: "",
    category: null,
    evaluator_context: "",
    evaluator_context_file: null,
  });
  const [saving, setSaving] = useState(false);
  const [formVariant, setFormVariant] = useState<"global" | "one-time">("global");
  const [assignToId, setAssignToId] = useState("");
  const [selectedSkills, setSelectedSkills] = useState<CrisisSkill[]>([]);
  const [promptInputMode, setPromptInputMode] = useState<"text" | "file">("text");
  const [contextInputMode, setContextInputMode] = useState<"text" | "file">("text");

  const filteredScenarios = useMemo(() => {
    if (!categoryFilter) return scenarios;
    return scenarios.filter((s) => {
      if (categoryFilter === "uncategorized") {
        return !s.category;
      }
      return s.category === categoryFilter;
    });
  }, [categoryFilter, scenarios]);

  const loadScenarios = useCallback(async () => {
    setLoading(true);
    setTabError(null);
    try {
      const params = new URLSearchParams();
      params.set("isOneTime", String(scenarioFilter === "one-time"));
      const response = await authFetch(`/api/scenarios?${params}`);
      const data: ApiResponse<Scenario[]> = await response.json();
      if (!data.ok) throw new Error(data.error.message);
      setScenarios(data.data);
    } catch (err) {
      setTabError("Failed to load scenarios");
      console.error(err);
    } finally {
      setLoading(false);
    }
  }, [scenarioFilter, authFetch]);

  useEffect(() => {
    loadScenarios();
  }, [loadScenarios]);

  const resetForm = () => {
    setFormData({
      title: "",
      description: "",
      prompt: "",
      account_id: null,
      mode: "phone",
      relevant_policy_sections: "",
      category: null,
      evaluator_context: "",
      evaluator_context_file: null,
    });
    setPromptInputMode("text");
    setContextInputMode("text");
    setEditingScenario(null);
    setFormVariant("global");
    setAssignToId("");
    setSelectedSkills([]);
    setShowForm(false);
  };

  const openCreateForm = () => {
    resetForm();
    setFormVariant("global");
    setShowForm(true);
  };

  const openCreateOneTimeForm = () => {
    resetForm();
    setFormVariant("one-time");
    setShowForm(true);
  };

  const openEditForm = (scenario: Scenario) => {
    setFormData({
      title: scenario.title,
      description: scenario.description || "",
      prompt: scenario.prompt,
      account_id: scenario.accountId,
      mode: scenario.mode,
      relevant_policy_sections: scenario.relevantPolicySections || "",
      category: scenario.category,
      evaluator_context: "",
      evaluator_context_file: null,
    });
    setPromptInputMode("text");
    setContextInputMode(scenario.evaluatorContextPath ? "file" : "text");
    setEditingScenario(scenario);
    setShowForm(true);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setTabError(null);

    try {
      const url = editingScenario
        ? `/api/scenarios/${editingScenario.id}`
        : "/api/scenarios";
      const method = editingScenario ? "PUT" : "POST";

      let response;
      if (formData.evaluator_context_file) {
        const form = new FormData();
        form.append("title", formData.title);
        form.append("description", formData.description);
        form.append("prompt", formData.prompt);
        form.append("mode", formData.mode);
        if (formData.account_id) form.append("account_id", formData.account_id);
        if (formData.category) form.append("category", formData.category);
        if (formData.relevant_policy_sections) {
          form.append("relevant_policy_sections", formData.relevant_policy_sections);
        }
        if (formData.evaluator_context) {
          form.append("evaluator_context", formData.evaluator_context);
        }
        form.append("evaluator_context_file", formData.evaluator_context_file);

        response = await authFetch(url, {
          method,
          body: form,
        });
      } else {
        const jsonData: Record<string, unknown> = {
          title: formData.title,
          description: formData.description,
          prompt: formData.prompt,
          mode: formData.mode,
          accountId: formData.account_id,
          category: formData.category,
          relevantPolicySections: formData.relevant_policy_sections,
          evaluatorContext: formData.evaluator_context || undefined,
        };

        if (formVariant === "one-time" && !editingScenario) {
          jsonData.isOneTime = true;
          jsonData.assignTo = assignToId;
          jsonData.skills = selectedSkills;
        }

        response = await authFetch(url, {
          method,
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(jsonData),
        });
      }

      const data: ApiResponse<Scenario> = await response.json();
      if (!data.ok) throw new Error(data.error.message);

      await loadScenarios();
      onScenariosChanged();
      resetForm();
    } catch (err) {
      setTabError(err instanceof Error ? err.message : "Failed to save scenario");
    } finally {
      setSaving(false);
    }
  };

  const handlePromoteToGlobal = async (id: string) => {
    if (!window.confirm("This will make the scenario visible to all supervisors for assignment. If this scenario was generated from a complaint, ensure no PII remains. Continue?")) return;

    try {
      const response = await authFetch(`/api/scenarios/${id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ isOneTime: false }),
      });

      const data = await response.json();
      if (!data.ok) throw new Error(data.error?.message || "Promote failed");
      await loadScenarios();
      onScenariosChanged();
    } catch (err) {
      setTabError(err instanceof Error ? err.message : "Failed to promote scenario");
    }
  };

  const handleDelete = async (id: string) => {
    if (!window.confirm("Delete this scenario? This cannot be undone.")) return;

    try {
      const response = await authFetch(`/api/scenarios/${id}`, { method: "DELETE" });
      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error?.message || "Delete failed");
      }
      await loadScenarios();
      onScenariosChanged();
    } catch {
      setTabError("Failed to delete scenario");
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
        {scenarioFilter === "one-time" && (
          <>
            <button
              onClick={openCreateOneTimeForm}
              className="bg-brand-orange hover:bg-brand-orange-hover
                       text-white font-marfa font-bold py-2 px-4 rounded"
            >
              + Create One-Time Scenario
            </button>
            <button
              onClick={() => setShowGenerate(true)}
              className="bg-purple-600 hover:bg-purple-500
                       text-white font-marfa font-bold py-2 px-4 rounded"
            >
              Generate from Complaint
            </button>
          </>
        )}
      </div>

      {loading ? (
        <p className="text-gray-400">Loading scenarios...</p>
      ) : filteredScenarios.length === 0 ? (
        <p className="text-gray-400">
          {categoryFilter
            ? `No scenarios in "${formatCategoryLabel(categoryFilter)}" category.`
            : scenarioFilter === "one-time"
              ? "No one-time scenarios yet."
              : "No scenarios yet. Create your first one!"}
        </p>
      ) : (
        <div className="space-y-3">
          {filteredScenarios.map((scenario) => (
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
                      {formatCategoryLabel(scenario.category)}
                    </span>
                  )}
                  {scenario.isOneTime && (
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
                {scenario.evaluatorContextPath && (
                  <span className="inline-block mt-2 text-xs bg-brand-orange/20 text-brand-orange px-2 py-1 rounded">
                    Has evaluator context
                  </span>
                )}
              </div>
              <div className="flex gap-3 ml-4">
                {scenarioFilter === "one-time" && (
                  <button
                    onClick={() => handlePromoteToGlobal(scenario.id)}
                    className="text-green-400 hover:text-green-300 text-sm"
                  >
                    Promote to Global
                  </button>
                )}
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

      {/* Create/Edit Scenario Form Modal */}
      {showForm && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-brand-navy border border-gray-700 rounded-lg p-6 w-full max-w-lg max-h-[90vh] overflow-y-auto">
            <h2 className="text-xl font-marfa text-white mb-4">
              {editingScenario
                ? "Edit Scenario"
                : formVariant === "one-time"
                  ? "Create One-Time Scenario"
                  : "Create Scenario"}
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
                  {CATEGORY_OPTIONS.map((cat) => (
                    <option key={cat.value} value={cat.value}>
                      {cat.label}
                    </option>
                  ))}
                </select>
              </div>

              {/* Learner dropdown - one-time variant only */}
              {formVariant === "one-time" && !editingScenario && (
                <div>
                  <label className="block text-gray-300 text-sm font-marfa mb-1">
                    Assign to Learner *
                  </label>
                  <select
                    value={assignToId}
                    onChange={(e) => setAssignToId(e.target.value)}
                    required
                    className="w-full bg-gray-800 border border-gray-600 rounded px-3 py-2
                               text-white font-marfa focus:outline-none focus:border-brand-orange"
                  >
                    <option value="">-- Select Learner --</option>
                    {counselors.length === 0 ? (
                      <option disabled>No learners available</option>
                    ) : (
                      counselors.map((c) => (
                        <option key={c.id} value={c.id}>
                          {getUserDisplayName(c)}
                        </option>
                      ))
                    )}
                  </select>
                </div>
              )}

              {/* Skills chips - one-time variant only */}
              {formVariant === "one-time" && !editingScenario && (
                <div>
                  <label className="block text-gray-300 text-sm font-marfa mb-1">
                    Skills (max 10)
                  </label>
                  <div className="flex flex-wrap gap-2">
                    {VALID_SKILLS.map((skill) => {
                      const isSelected = selectedSkills.includes(skill);
                      return (
                        <button
                          key={skill}
                          type="button"
                          onClick={() => {
                            if (isSelected) {
                              setSelectedSkills(selectedSkills.filter((s) => s !== skill));
                            } else if (selectedSkills.length < 10) {
                              setSelectedSkills([...selectedSkills, skill]);
                            }
                          }}
                          className={`px-2 py-1 text-xs rounded font-marfa transition-colors ${
                            isSelected
                              ? "bg-brand-orange text-white"
                              : "bg-gray-700 text-gray-300 hover:bg-gray-600"
                          }`}
                        >
                          {formatSkillLabel(skill)}
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}

              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="block text-gray-300 text-sm font-marfa">
                    Prompt (Instructions for AI Caller) *
                  </label>
                  <div className="flex gap-1">
                    <button
                      type="button"
                      onClick={() => setPromptInputMode("text")}
                      className={`px-3 py-1 text-xs rounded ${
                        promptInputMode === "text"
                          ? "bg-blue-600 text-white"
                          : "bg-gray-700 text-gray-300"
                      }`}
                    >
                      Write Text
                    </button>
                    <button
                      type="button"
                      onClick={() => setPromptInputMode("file")}
                      className={`px-3 py-1 text-xs rounded ${
                        promptInputMode === "file"
                          ? "bg-brand-orange text-white"
                          : "bg-gray-700 text-gray-300"
                      }`}
                    >
                      Upload File
                    </button>
                  </div>
                </div>
                {promptInputMode === "text" ? (
                  <>
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
                    <p className="text-xs text-gray-500 text-right mt-1">
                      {formData.prompt.length} / 10,000
                    </p>
                  </>
                ) : (
                  <div className="border-2 border-dashed border-gray-600 rounded-lg p-4">
                    <input
                      type="file"
                      accept=".txt,.md"
                      onChange={(e) => {
                        const file = e.target.files?.[0];
                        if (file) {
                          const reader = new FileReader();
                          reader.onload = (event) => {
                            setFormData({
                              ...formData,
                              prompt: event.target?.result as string,
                            });
                          };
                          reader.readAsText(file);
                        }
                      }}
                      className="text-gray-300"
                    />
                    <p className="text-xs text-gray-500 mt-2">Accepted: TXT, MD</p>
                  </div>
                )}
              </div>

              {/* Evaluator Context */}
              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="block text-gray-300 text-sm font-marfa">
                    Evaluator Context
                  </label>
                  <div className="flex gap-1">
                    <button
                      type="button"
                      onClick={() => setContextInputMode("text")}
                      className={`px-3 py-1 text-xs rounded ${
                        contextInputMode === "text"
                          ? "bg-blue-600 text-white"
                          : "bg-gray-700 text-gray-300"
                      }`}
                    >
                      Write Text
                    </button>
                    <button
                      type="button"
                      onClick={() => setContextInputMode("file")}
                      className={`px-3 py-1 text-xs rounded ${
                        contextInputMode === "file"
                          ? "bg-brand-orange text-white"
                          : "bg-gray-700 text-gray-300"
                      }`}
                    >
                      Upload File
                    </button>
                  </div>
                </div>
                {contextInputMode === "text" ? (
                  <textarea
                    value={formData.evaluator_context}
                    onChange={(e) =>
                      setFormData({ ...formData, evaluator_context: e.target.value })
                    }
                    rows={4}
                    className="w-full bg-gray-800 border border-gray-600 rounded px-3 py-2
                               text-white font-marfa focus:outline-none focus:border-brand-orange"
                    placeholder="Additional context for the evaluator (key learning objectives, specific things to assess...)"
                  />
                ) : (
                  <div className="border-2 border-dashed border-gray-600 rounded-lg p-4">
                    <input
                      type="file"
                      accept=".txt,.md,.pdf,.docx"
                      onChange={(e) => {
                        const file = e.target.files?.[0];
                        if (file) {
                          setFormData({ ...formData, evaluator_context_file: file });
                        }
                      }}
                      className="text-gray-300"
                    />
                    <p className="text-xs text-gray-500 mt-2">Accepted: TXT, MD, PDF, DOCX</p>
                    {formData.evaluator_context_file && (
                      <p className="text-xs text-brand-orange mt-1">
                        Selected: {formData.evaluator_context_file.name}
                      </p>
                    )}
                    {editingScenario?.evaluatorContextPath && !formData.evaluator_context_file && (
                      <p className="text-xs text-green-400 mt-1">
                        Existing file uploaded
                      </p>
                    )}
                  </div>
                )}
              </div>

              {/* Organization Account */}
              <div>
                <label className="block text-gray-300 text-sm font-marfa mb-1">
                  Organization Account (Optional)
                </label>
                <AccountSearchDropdown
                  accounts={accounts}
                  selectedAccountId={formData.account_id}
                  onSelect={(accountId) =>
                    setFormData({ ...formData, account_id: accountId })
                  }
                  authFetch={authFetch}
                  onAccountsChanged={onAccountsChanged}
                />
              </div>

              {/* Account Procedures Upload — inline when account is selected */}
              {formData.account_id && (
                <AccountProceduresUpload
                  accountId={formData.account_id}
                  accounts={accounts}
                  authFetch={authFetch}
                  onAccountsChanged={onAccountsChanged}
                />
              )}

              {/* Relevant Procedures Sections — only show when account is selected */}
              {formData.account_id && (
                <div>
                  <label className="block text-gray-300 text-sm font-marfa mb-1">
                    Relevant Procedures Sections
                  </label>
                  <textarea
                    value={formData.relevant_policy_sections}
                    onChange={(e) =>
                      setFormData({ ...formData, relevant_policy_sections: e.target.value })
                    }
                    rows={2}
                    className="w-full bg-gray-800 border border-gray-600 rounded px-3 py-2
                               text-white font-marfa focus:outline-none focus:border-brand-orange"
                    placeholder="e.g., 6100 Suicide Risk Assessment, 2751 Abuse Reporting"
                  />
                  <p className="text-xs text-gray-500 mt-1">
                    Help the evaluator focus on specific procedure sections relevant to this scenario
                  </p>
                </div>
              )}

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
                  disabled={saving || (formVariant === "one-time" && !editingScenario && !assignToId)}
                  className="px-4 py-2 bg-brand-orange hover:bg-brand-orange-hover
                             text-white font-marfa font-bold rounded disabled:opacity-50
                             disabled:cursor-not-allowed"
                >
                  {saving
                    ? "Saving..."
                    : editingScenario
                      ? "Update"
                      : formVariant === "one-time"
                        ? "Create & Assign"
                        : "Create"}
                </button>
              </div>
            </form>
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
          onScenariosChanged();
        }}
        userId={userId}
      />

      {/* Generate from Complaint Modal */}
      <GenerateScenarioModal
        isOpen={showGenerate}
        onClose={() => setShowGenerate(false)}
        onSuccess={() => {
          setShowGenerate(false);
          loadScenarios();
          onScenariosChanged();
        }}
        userId={userId}
        counselors={counselors}
      />
    </div>
  );
}
