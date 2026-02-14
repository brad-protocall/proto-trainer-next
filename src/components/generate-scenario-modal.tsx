"use client";

import { useState, useEffect } from "react";
import { Account, ScenarioCategory, ScenarioMode, User, ApiResponse, ProcedureHistoryEntry } from "@/types";
import type { GeneratedScenario } from "@/lib/validators";
import { VALID_SKILLS, type CrisisSkill } from "@/lib/skills";
import type { AuthFetchFn } from "@/lib/fetch";
import { formatSkillLabel, CATEGORY_OPTIONS } from "@/lib/labels";
import AccountSearchDropdown from "./supervisor/account-search-dropdown";

const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB

interface GenerateScenarioModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
  authFetch: AuthFetchFn;
  counselors?: User[];
  accounts?: Account[];
  onAccountsChanged?: () => void;
}

type EditableScenario = GeneratedScenario & { mode: ScenarioMode };

interface ExtractedAccountInfo {
  name: string;
  number: string | null;
}

/** Extract account name and number from complaint text (template-based, consistent format) */
function extractAccountInfo(text: string): ExtractedAccountInfo | null {
  const nameMatch = text.match(/Account\s*Name:\s*(.+)/i);
  if (!nameMatch) return null;
  const numberMatch = text.match(/Account\s*(?:Number|#|No\.?):\s*(\d{4,})/i);
  return {
    name: nameMatch[1].trim(),
    number: numberMatch?.[1] ?? null,
  };
}

export default function GenerateScenarioModal({
  isOpen,
  onClose,
  onSuccess,
  authFetch,
  counselors = [],
  accounts = [],
  onAccountsChanged,
}: GenerateScenarioModalProps) {
  // Input phase state
  const [complaintText, setComplaintText] = useState("");
  const [additionalInstructions, setAdditionalInstructions] = useState("");

  // File upload state
  const [uploadedFileName, setUploadedFileName] = useState<string | null>(null);
  const [isExtracting, setIsExtracting] = useState(false);

  // Account detection state
  const [selectedAccountId, setSelectedAccountId] = useState<string | null>(null);
  const [detectedInfo, setDetectedInfo] = useState<ExtractedAccountInfo | null>(null);
  const [accountDetectionMessage, setAccountDetectionMessage] = useState<string | null>(null);

  // Generation/editing state
  const [generatedScenario, setGeneratedScenario] =
    useState<EditableScenario | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Learner assignment state
  const [assignTo, setAssignTo] = useState("");

  // Auto-detect account from complaint text
  useEffect(() => {
    if (!complaintText || complaintText.length < 20) {
      setDetectedInfo(null);
      setAccountDetectionMessage(null);
      return;
    }

    const info = extractAccountInfo(complaintText);
    setDetectedInfo(info);

    if (!info) {
      setAccountDetectionMessage(null);
      // Don't clear selectedAccountId — user may have manually selected
      return;
    }

    // Try to match against existing accounts (case-insensitive exact match on name)
    const match = accounts.find(
      (a) => a.name.toLowerCase() === info.name.toLowerCase()
    );

    if (match) {
      setSelectedAccountId(match.id);
      const label = info.number ? `${info.name} [${info.number}]` : info.name;
      setAccountDetectionMessage(`Account detected: ${label}`);
    } else {
      // Don't auto-select — user must use + New
      setSelectedAccountId(null);
      const label = info.number ? `${info.name} [${info.number}]` : info.name;
      setAccountDetectionMessage(
        `Account "${label}" not found — use + New to create it`
      );
    }
  }, [complaintText, accounts]);

  const resetState = () => {
    setComplaintText("");
    setAdditionalInstructions("");
    setUploadedFileName(null);
    setIsExtracting(false);
    setGeneratedScenario(null);
    setIsLoading(false);
    setError(null);
    setAssignTo("");
    setSelectedAccountId(null);
    setDetectedInfo(null);
    setAccountDetectionMessage(null);
  };

  const handleClose = () => {
    resetState();
    onClose();
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    // Reset input so same file can be re-selected
    e.target.value = "";
    if (!file) return;

    setError(null);

    // Client-side size validation before reading
    if (file.size > MAX_FILE_SIZE) {
      setError("File must be under 10MB");
      return;
    }

    // Client-side extension validation
    const ext = file.name.toLowerCase().split(".").pop();
    if (ext !== "pdf" && ext !== "txt") {
      setError("Only PDF and TXT files are supported");
      return;
    }

    if (ext === "txt") {
      // Read TXT client-side
      try {
        const text = await file.text();
        const trimmed = text.trim();
        if (trimmed.length > 15000) {
          setComplaintText(trimmed.slice(0, 15000));
          setError("File text exceeds 15,000 characters. Text has been truncated.");
        } else {
          setComplaintText(trimmed);
        }
        setUploadedFileName(file.name);
      } catch {
        setError("Failed to read file");
      }
    } else {
      // Upload PDF to server for extraction
      setIsExtracting(true);
      try {
        const formData = new FormData();
        formData.append("file", file);

        const response = await authFetch("/api/scenarios/extract-text", {
          method: "POST",
          body: formData,
        });

        const data = await response.json();
        if (!data.ok) {
          throw new Error(data.error?.message || "Failed to extract text");
        }

        setComplaintText(data.data.text);
        setUploadedFileName(data.data.fileName);
        if (data.data.truncated) {
          setError("PDF text exceeds 15,000 characters. Text has been truncated.");
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to extract text from PDF");
      } finally {
        setIsExtracting(false);
      }
    }
  };

  const clearUploadedFile = () => {
    setUploadedFileName(null);
    setComplaintText("");
  };

  const handleGenerate = async () => {
    setIsLoading(true);
    setError(null);

    try {
      const response = await authFetch("/api/scenarios/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sourceText: complaintText,
          additionalInstructions: additionalInstructions || undefined,
        }),
      });

      const data = await response.json();

      if (!data.ok) {
        throw new Error(data.error?.message || "Generation failed");
      }

      const generated: GeneratedScenario = data.data;
      setGeneratedScenario({ ...generated, mode: "phone" });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Generation failed");
    } finally {
      setIsLoading(false);
    }
  };

  const handleStartOver = () => {
    setGeneratedScenario(null);
    setError(null);
    setAssignTo("");
    // Keep complaintText, additionalInstructions, and account selection preserved
  };

  const handleSave = async () => {
    if (!generatedScenario) return;

    setIsLoading(true);
    setError(null);

    try {
      const body: Record<string, unknown> = {
        title: generatedScenario.title,
        description: generatedScenario.description,
        prompt: generatedScenario.prompt,
        evaluatorContext: generatedScenario.evaluatorContext,
        mode: generatedScenario.mode,
        category: generatedScenario.category || undefined,
        skills: generatedScenario.skills,
        isOneTime: true,
      };

      // Include accountId if an account is selected
      if (selectedAccountId) {
        body.accountId = selectedAccountId;
      }

      // Include assignTo if a learner is selected (triggers one-time+assignment transaction)
      if (assignTo) {
        body.assignTo = assignTo;
      }

      const response = await authFetch("/api/scenarios", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });

      const data = await response.json();

      if (!data.ok) {
        throw new Error(data.error?.message || "Save failed");
      }

      onSuccess();
      handleClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Save failed");
    } finally {
      setIsLoading(false);
    }
  };

  const updateField = <K extends keyof EditableScenario>(field: K, value: EditableScenario[K]) => {
    if (!generatedScenario) return;
    setGeneratedScenario({ ...generatedScenario, [field]: value });
  };

  const toggleSkill = (skill: CrisisSkill) => {
    if (!generatedScenario) return;
    const current = generatedScenario.skills;
    if (current.includes(skill)) {
      updateField(
        "skills",
        current.filter((s) => s !== skill)
      );
    } else if (current.length < 10) { // LLM generates 1-5; cap at 10 so supervisors can add more during review
      updateField("skills", [...current, skill]);
    }
  };

  // State matrix: null+false=input, null+true=generating, non-null+false=editing, non-null+true=saving
  const isInputPhase = generatedScenario === null && !isLoading;
  const isGenerating = generatedScenario === null && isLoading;
  const isEditPhase = generatedScenario !== null && !isLoading;
  const isSaving = generatedScenario !== null && isLoading;

  const canGenerate = complaintText.length >= 50;

  // For procedure upload in review phase
  const selectedAccount = accounts.find((a) => a.id === selectedAccountId) ?? null;

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-brand-navy border border-gray-700 rounded-lg p-6 w-full max-w-2xl max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="flex justify-between items-center mb-4">
          <h2 className="text-xl font-marfa text-white">
            {isInputPhase || isGenerating
              ? "Generate Scenario from Complaint"
              : "Review Generated Scenario"}
          </h2>
          <button
            onClick={handleClose}
            className="text-gray-400 hover:text-white text-xl"
            aria-label="Close"
          >
            &#10005;
          </button>
        </div>

        {/* Error display */}
        {error && (
          <div className="bg-red-900/50 border border-red-700 rounded px-4 py-3 mb-4">
            <p className="text-red-300 font-marfa">{error}</p>
          </div>
        )}

        {/* Phase 1: Input */}
        {(isInputPhase || isGenerating) && (
          <div className="space-y-4">
            <div>
              <label className="block text-gray-300 text-sm font-marfa mb-1">
                Complaint / Source Text *
              </label>
              <textarea
                value={complaintText}
                onChange={(e) => setComplaintText(e.target.value)}
                rows={8}
                maxLength={15000}
                disabled={isGenerating || isExtracting}
                className="w-full bg-gray-800 border border-gray-600 rounded px-3 py-2
                           text-white font-marfa focus:outline-none focus:border-brand-orange
                           disabled:opacity-50"
                placeholder="Paste complaint text, incident report, or caller description here..."
              />
              <div className="flex justify-between mt-1">
                <p className="text-xs text-yellow-500">
                  Do not include real names, phone numbers, or other PII. Redact
                  before pasting.
                </p>
                <p className="text-xs text-gray-500">
                  {complaintText.length} / 15,000
                </p>
              </div>
            </div>

            {/* Account detection banner */}
            {accountDetectionMessage && (
              <div
                className={`text-sm font-marfa px-3 py-2 rounded border ${
                  selectedAccountId
                    ? "bg-green-900/30 border-green-700 text-green-300"
                    : "bg-yellow-900/30 border-yellow-700 text-yellow-300"
                }`}
              >
                {accountDetectionMessage}
              </div>
            )}

            {/* File Upload */}
            <div>
              <div className="flex items-center gap-2">
                <label
                  className={`inline-flex items-center gap-2 px-3 py-1.5 rounded text-sm font-marfa cursor-pointer
                             ${isExtracting || isGenerating
                               ? "bg-gray-700 text-gray-500 cursor-not-allowed"
                               : "bg-gray-700 text-gray-300 hover:bg-gray-600"}`}
                >
                  {isExtracting ? (
                    <>
                      <span className="animate-spin inline-block h-3 w-3 border-2 border-brand-orange border-t-transparent rounded-full" />
                      Extracting...
                    </>
                  ) : (
                    "Upload PDF/TXT"
                  )}
                  <input
                    type="file"
                    accept=".pdf,.txt,application/pdf,text/plain"
                    onChange={handleFileChange}
                    disabled={isExtracting || isGenerating}
                    className="hidden"
                  />
                </label>
                {uploadedFileName && (
                  <span className="flex items-center gap-1 text-xs text-gray-400 font-marfa">
                    {uploadedFileName}
                    <button
                      type="button"
                      onClick={clearUploadedFile}
                      className="text-gray-500 hover:text-red-400 ml-1"
                      title="Clear uploaded file"
                    >
                      &#10005;
                    </button>
                  </span>
                )}
              </div>
            </div>

            <div>
              <label className="block text-gray-300 text-sm font-marfa mb-1">
                Additional Instructions (optional)
              </label>
              <textarea
                value={additionalInstructions}
                onChange={(e) => setAdditionalInstructions(e.target.value)}
                rows={3}
                maxLength={1000}
                disabled={isGenerating}
                className="w-full bg-gray-800 border border-gray-600 rounded px-3 py-2
                           text-white font-marfa focus:outline-none focus:border-brand-orange
                           disabled:opacity-50"
                placeholder="e.g., Focus on de-escalation skills, make it intermediate difficulty..."
              />
              <p className="text-xs text-gray-500 text-right mt-1">
                {additionalInstructions.length} / 1,000
              </p>
            </div>

            {/* Generating spinner */}
            {isGenerating && (
              <div className="flex items-center gap-3 py-4">
                <div className="animate-spin rounded-full h-5 w-5 border-2 border-brand-orange border-t-transparent" />
                <p className="text-gray-300 font-marfa">
                  Generating scenario... This usually takes 5-15 seconds.
                </p>
              </div>
            )}

            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={handleClose}
                className="px-4 py-2 text-gray-300 hover:text-white font-marfa"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleGenerate}
                disabled={!canGenerate || isGenerating || isExtracting}
                className="bg-brand-orange text-white px-4 py-2 rounded font-marfa
                           hover:bg-brand-orange-hover disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Generate Scenario
              </button>
            </div>
          </div>
        )}

        {/* Phase 2: Review/Edit */}
        {(isEditPhase || isSaving) && generatedScenario && (
          <div className="space-y-4">
            <div>
              <label className="block text-gray-300 text-sm font-marfa mb-1">
                Title *
              </label>
              <input
                type="text"
                value={generatedScenario.title}
                onChange={(e) => updateField("title", e.target.value)}
                disabled={isSaving}
                maxLength={255}
                className="w-full bg-gray-800 border border-gray-600 rounded px-3 py-2
                           text-white font-marfa focus:outline-none focus:border-brand-orange
                           disabled:opacity-50"
              />
            </div>

            <div>
              <label className="block text-gray-300 text-sm font-marfa mb-1">
                Description
              </label>
              <input
                type="text"
                value={generatedScenario.description}
                onChange={(e) => updateField("description", e.target.value)}
                disabled={isSaving}
                className="w-full bg-gray-800 border border-gray-600 rounded px-3 py-2
                           text-white font-marfa focus:outline-none focus:border-brand-orange
                           disabled:opacity-50"
              />
            </div>

            <div>
              <label className="block text-gray-300 text-sm font-marfa mb-1">
                Mode
              </label>
              <select
                value={generatedScenario.mode}
                onChange={(e) =>
                  updateField("mode", e.target.value as ScenarioMode)
                }
                disabled={isSaving}
                className="w-full bg-gray-800 border border-gray-600 rounded px-3 py-2
                           text-white font-marfa focus:outline-none focus:border-brand-orange
                           disabled:opacity-50"
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
                value={generatedScenario.category || ""}
                onChange={(e) =>
                  updateField(
                    "category",
                    (e.target.value || null) as ScenarioCategory | null
                  )
                }
                disabled={isSaving}
                className="w-full bg-gray-800 border border-gray-600 rounded px-3 py-2
                           text-white font-marfa focus:outline-none focus:border-brand-orange
                           disabled:opacity-50"
              >
                {CATEGORY_OPTIONS.map((cat) => (
                  <option key={cat.value} value={cat.value}>
                    {cat.label}
                  </option>
                ))}
              </select>
            </div>

            {/* Organization Account */}
            <div>
              <label className="block text-gray-300 text-sm font-marfa mb-1">
                Organization Account
              </label>
              <AccountSearchDropdown
                accounts={accounts}
                selectedAccountId={selectedAccountId}
                onSelect={setSelectedAccountId}
                authFetch={authFetch}
                onAccountsChanged={onAccountsChanged ?? (() => {})}
              />
              {/* Account detection info in review phase */}
              {detectedInfo && !selectedAccountId && (
                <p className="text-xs text-yellow-400 mt-1">
                  Account &ldquo;{detectedInfo.name}&rdquo; detected in complaint text but not found. Use + New to create it.
                </p>
              )}
            </div>

            {/* Account Procedures Upload — when account is selected */}
            {selectedAccountId && selectedAccount && onAccountsChanged && (
              <AccountProceduresUploadInline
                accountId={selectedAccountId}
                account={selectedAccount}
                authFetch={authFetch}
                onAccountsChanged={onAccountsChanged}
              />
            )}

            {/* Assign to Learner */}
            <div>
              <label className="block text-gray-300 text-sm font-marfa mb-1">
                Assign to Learner *
              </label>
              <select
                value={assignTo}
                onChange={(e) => setAssignTo(e.target.value)}
                disabled={isSaving}
                className="w-full bg-gray-800 border border-gray-600 rounded px-3 py-2
                           text-white font-marfa focus:outline-none focus:border-brand-orange
                           disabled:opacity-50"
              >
                <option value="">-- Select Learner --</option>
                {counselors.length === 0 ? (
                  <option disabled>No learners available</option>
                ) : (
                  counselors.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.displayName || c.email || "Unknown"}
                    </option>
                  ))
                )}
              </select>
            </div>

            <div>
              <label className="block text-gray-300 text-sm font-marfa mb-1">
                Prompt (Instructions for AI Caller) *
              </label>
              <textarea
                value={generatedScenario.prompt}
                onChange={(e) => updateField("prompt", e.target.value)}
                disabled={isSaving}
                rows={6}
                className="w-full bg-gray-800 border border-gray-600 rounded px-3 py-2
                           text-white font-marfa focus:outline-none focus:border-brand-orange
                           disabled:opacity-50"
              />
            </div>

            <div>
              <label className="block text-gray-300 text-sm font-marfa mb-1">
                Evaluator Context
              </label>
              <textarea
                value={generatedScenario.evaluatorContext}
                onChange={(e) =>
                  updateField("evaluatorContext", e.target.value)
                }
                disabled={isSaving}
                rows={4}
                className="w-full bg-gray-800 border border-gray-600 rounded px-3 py-2
                           text-white font-marfa focus:outline-none focus:border-brand-orange
                           disabled:opacity-50"
              />
            </div>

            <div>
              <label className="block text-gray-300 text-sm font-marfa mb-1">
                Skills (max 10)
              </label>
              <div className="flex flex-wrap gap-2">
                {VALID_SKILLS.map((skill) => {
                  const isSelected =
                    generatedScenario.skills.includes(skill);
                  return (
                    <button
                      key={skill}
                      type="button"
                      onClick={() => toggleSkill(skill)}
                      disabled={isSaving}
                      className={`px-2 py-1 text-xs rounded font-marfa transition-colors ${
                        isSelected
                          ? "bg-brand-orange text-white"
                          : "bg-gray-700 text-gray-300 hover:bg-gray-600"
                      } disabled:opacity-50`}
                    >
                      {formatSkillLabel(skill)}
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="flex justify-between pt-2">
              <button
                type="button"
                onClick={handleStartOver}
                disabled={isSaving}
                className="px-4 py-2 text-gray-300 hover:text-white font-marfa disabled:opacity-50"
              >
                &#8592; Start Over
              </button>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={handleClose}
                  className="px-4 py-2 text-gray-300 hover:text-white font-marfa"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={handleSave}
                  disabled={
                    isSaving ||
                    !generatedScenario.title.trim() ||
                    !generatedScenario.prompt.trim() ||
                    !assignTo
                  }
                  className="bg-brand-orange text-white px-4 py-2 rounded font-marfa
                             hover:bg-brand-orange-hover disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {isSaving ? "Saving..." : "Save & Assign"}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

/** Lightweight procedure upload widget for the complaint generator review phase */
function AccountProceduresUploadInline({
  accountId,
  account,
  authFetch,
  onAccountsChanged,
}: {
  accountId: string;
  account: Account;
  authFetch: AuthFetchFn;
  onAccountsChanged: () => void;
}) {
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [uploadSuccess, setUploadSuccess] = useState<string | null>(null);

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
              e.target.value = "";
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
    </div>
  );
}
