"use client";

import { useState } from "react";
import { ScenarioCategory, ScenarioMode } from "@/types";
import { ScenarioCategoryValues } from "@/lib/validators";
import type { GeneratedScenario } from "@/lib/validators";
import { VALID_SKILLS } from "@/lib/skills";

const CATEGORY_OPTIONS: { value: string; label: string }[] = [
  { value: "", label: "-- None --" },
  { value: "cohort_training", label: "Cohort Training" },
  { value: "onboarding", label: "Onboarding" },
  { value: "expert_skill_path", label: "Expert Skill Path" },
  { value: "account_specific", label: "Account Specific" },
  { value: "sales", label: "Sales" },
  { value: "customer_facing", label: "Customer Facing" },
  { value: "tap", label: "TAP" },
  { value: "supervisors", label: "Supervisors" },
];

const SKILL_LABELS: Record<string, string> = {
  "risk-assessment": "Risk Assessment",
  "safety-planning": "Safety Planning",
  "de-escalation": "De-escalation",
  "active-listening": "Active Listening",
  "self-harm-assessment": "Self-Harm Assessment",
  "substance-assessment": "Substance Assessment",
  "dv-assessment": "DV Assessment",
  "grief-support": "Grief Support",
  "anxiety-support": "Anxiety Support",
  "rapport-building": "Rapport Building",
  "call-routing": "Call Routing",
  "medication-support": "Medication Support",
  "resource-linkage": "Resource Linkage",
  "boundary-setting": "Boundary Setting",
  "termination": "Termination",
};

interface GenerateScenarioModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
  userId?: string;
}

interface EditableScenario {
  title: string;
  description: string;
  prompt: string;
  evaluatorContext: string;
  mode: ScenarioMode;
  category: ScenarioCategory | null;
  skills: string[];
}

export default function GenerateScenarioModal({
  isOpen,
  onClose,
  onSuccess,
  userId,
}: GenerateScenarioModalProps) {
  // Input phase state
  const [complaintText, setComplaintText] = useState("");
  const [additionalInstructions, setAdditionalInstructions] = useState("");

  // Generation/editing state
  const [generatedScenario, setGeneratedScenario] =
    useState<EditableScenario | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const resetState = () => {
    setComplaintText("");
    setAdditionalInstructions("");
    setGeneratedScenario(null);
    setIsLoading(false);
    setError(null);
  };

  const handleClose = () => {
    resetState();
    onClose();
  };

  const handleGenerate = async () => {
    setIsLoading(true);
    setError(null);

    try {
      const headers: Record<string, string> = {
        "Content-Type": "application/json",
      };
      if (userId) headers["x-user-id"] = userId;

      const response = await fetch("/api/scenarios/generate", {
        method: "POST",
        headers,
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
      setGeneratedScenario({
        title: generated.title,
        description: generated.description,
        prompt: generated.prompt,
        evaluatorContext: generated.evaluatorContext,
        mode: "phone",
        category: generated.category,
        skills: generated.skills,
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Generation failed");
    } finally {
      setIsLoading(false);
    }
  };

  const handleStartOver = () => {
    setGeneratedScenario(null);
    setError(null);
    // Keep complaintText and additionalInstructions preserved
  };

  const handleSave = async () => {
    if (!generatedScenario) return;

    setIsLoading(true);
    setError(null);

    try {
      const headers: Record<string, string> = {
        "Content-Type": "application/json",
      };
      if (userId) headers["x-user-id"] = userId;

      const response = await fetch("/api/scenarios", {
        method: "POST",
        headers,
        body: JSON.stringify({
          title: generatedScenario.title,
          description: generatedScenario.description,
          prompt: generatedScenario.prompt,
          evaluatorContext: generatedScenario.evaluatorContext,
          mode: generatedScenario.mode,
          category: generatedScenario.category || undefined,
          skills: generatedScenario.skills,
          isOneTime: true,
        }),
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

  const updateField = (field: keyof EditableScenario, value: unknown) => {
    if (!generatedScenario) return;
    setGeneratedScenario({ ...generatedScenario, [field]: value });
  };

  const toggleSkill = (skill: string) => {
    if (!generatedScenario) return;
    const current = generatedScenario.skills;
    if (current.includes(skill)) {
      updateField(
        "skills",
        current.filter((s) => s !== skill)
      );
    } else if (current.length < 10) {
      updateField("skills", [...current, skill]);
    }
  };

  // State matrix: null+false=input, null+true=generating, non-null+false=editing, non-null+true=saving
  const isInputPhase = generatedScenario === null && !isLoading;
  const isGenerating = generatedScenario === null && isLoading;
  const isEditPhase = generatedScenario !== null && !isLoading;
  const isSaving = generatedScenario !== null && isLoading;

  const canGenerate = complaintText.length >= 50;

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
            ✕
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
                disabled={isGenerating}
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
                  Generating scenario... This usually takes 3-5 seconds.
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
                disabled={!canGenerate || isGenerating}
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
                      {SKILL_LABELS[skill] || skill}
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
                ← Start Over
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
                    !generatedScenario.prompt.trim()
                  }
                  className="bg-brand-orange text-white px-4 py-2 rounded font-marfa
                             hover:bg-brand-orange-hover disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {isSaving ? "Saving..." : "Save Scenario"}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
