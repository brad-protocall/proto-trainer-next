"use client";

import { useState, useRef, ChangeEvent } from "react";
import Papa from "papaparse";
import { ScenarioCategory, ScenarioMode } from "@/types";

// Validation constants
const MAX_SCENARIOS = 100;
const MAX_TITLE_LENGTH = 255;
const MAX_PROMPT_LENGTH = 10000;
const MAX_DESCRIPTION_LENGTH = 1000;
const MAX_EVALUATOR_CONTEXT_LENGTH = 50000;
const MAX_FILE_SIZE = 5 * 1024 * 1024; // 5MB

const VALID_CATEGORIES: string[] = [
  "cohort_training",
  "onboarding",
  "expert_skill_path",
  "account_specific",
  "",
];

// CSV template content
const CSV_TEMPLATE = `title,prompt,description,evaluator_context,mode,category
"Suicidal Caller - First Time","You are a 24-year-old named Alex calling for the first time. You have been thinking about ending your life but haven't made a specific plan. You feel hopeless about your job situation.","First-time caller expressing passive suicidal ideation","Evaluate for: active listening, safety assessment, collaborative safety planning, appropriate resource referrals",phone,cohort_training
"Panic Attack - Workplace","You are having a panic attack at work. Your heart is racing, you can't breathe, and you feel like you're dying. This has happened before but never this bad.","Caller experiencing acute panic attack","Evaluate for: grounding techniques, calm reassuring tone, breathing exercises, validation of experience",phone,cohort_training`;

interface ValidationError {
  row: number;
  field: string;
  message: string;
}

interface ParsedScenario {
  title: string;
  prompt: string;
  description?: string;
  evaluator_context?: string;
  mode?: string;
  category?: string;
}

interface ImportResult {
  created: number;
  skipped: number;
  created_titles: string[];
  skipped_titles: string[];
}

interface BulkImportModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: (result: ImportResult) => void;
}

type ModalState = "upload" | "preview" | "done";

export default function BulkImportModal({
  isOpen,
  onClose,
  onSuccess,
}: BulkImportModalProps) {
  const [state, setState] = useState<ModalState>("upload");
  const [parsedScenarios, setParsedScenarios] = useState<ParsedScenario[]>([]);
  const [validationErrors, setValidationErrors] = useState<ValidationError[]>(
    []
  );
  const [importResult, setImportResult] = useState<ImportResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isImporting, setIsImporting] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const resetState = () => {
    setState("upload");
    setParsedScenarios([]);
    setValidationErrors([]);
    setImportResult(null);
    setError(null);
    setIsImporting(false);
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  };

  const handleClose = () => {
    resetState();
    onClose();
  };

  const handleDownloadTemplate = () => {
    const blob = new Blob([CSV_TEMPLATE], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = "scenario-import-template.csv";
    link.click();
    URL.revokeObjectURL(url);
  };

  const validateScenario = (
    scenario: ParsedScenario,
    rowIndex: number
  ): ValidationError[] => {
    const errors: ValidationError[] = [];
    const row = rowIndex + 2;

    if (!scenario.title?.trim()) {
      errors.push({ row, field: "title", message: "Title is required" });
    } else if (scenario.title.length > MAX_TITLE_LENGTH) {
      errors.push({
        row,
        field: "title",
        message: `Title exceeds ${MAX_TITLE_LENGTH} characters`,
      });
    }

    if (!scenario.prompt?.trim()) {
      errors.push({ row, field: "prompt", message: "Prompt is required" });
    } else if (scenario.prompt.length > MAX_PROMPT_LENGTH) {
      errors.push({
        row,
        field: "prompt",
        message: `Prompt exceeds ${MAX_PROMPT_LENGTH.toLocaleString()} characters`,
      });
    }

    if (
      scenario.description &&
      scenario.description.length > MAX_DESCRIPTION_LENGTH
    ) {
      errors.push({
        row,
        field: "description",
        message: `Description exceeds ${MAX_DESCRIPTION_LENGTH.toLocaleString()} characters`,
      });
    }

    if (
      scenario.evaluator_context &&
      scenario.evaluator_context.length > MAX_EVALUATOR_CONTEXT_LENGTH
    ) {
      errors.push({
        row,
        field: "evaluator_context",
        message: `Evaluator context exceeds ${MAX_EVALUATOR_CONTEXT_LENGTH.toLocaleString()} characters`,
      });
    }

    if (
      scenario.mode &&
      !["phone", "chat", ""].includes(scenario.mode.toLowerCase())
    ) {
      errors.push({
        row,
        field: "mode",
        message: "Mode must be 'phone' or 'chat'",
      });
    }

    if (
      scenario.category &&
      !VALID_CATEGORIES.includes(scenario.category.toLowerCase())
    ) {
      errors.push({
        row,
        field: "category",
        message: `Category must be one of: cohort_training, onboarding, expert_skill_path, account_specific (got: ${scenario.category})`,
      });
    }

    return errors;
  };

  const handleFileSelect = (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setError(null);
    setValidationErrors([]);

    if (!file.name.toLowerCase().endsWith(".csv")) {
      setError("Please select a CSV file");
      return;
    }

    if (file.size > MAX_FILE_SIZE) {
      setError("File too large (max 5MB)");
      return;
    }

    Papa.parse<ParsedScenario>(file, {
      header: true,
      skipEmptyLines: true,
      complete: (results) => {
        if (results.errors.length > 0) {
          setError(`CSV parsing error: ${results.errors[0].message}`);
          return;
        }

        const scenarios = results.data;

        if (scenarios.length === 0) {
          setError("No scenarios found in file");
          return;
        }
        if (scenarios.length > MAX_SCENARIOS) {
          setError(
            `Max ${MAX_SCENARIOS} scenarios per import (found ${scenarios.length})`
          );
          return;
        }

        const allErrors: ValidationError[] = [];
        scenarios.forEach((scenario, index) => {
          const errors = validateScenario(scenario, index);
          allErrors.push(...errors);
        });

        // Check for duplicate titles
        const titles = scenarios
          .map((s) => s.title?.toLowerCase().trim())
          .filter(Boolean);
        const seen = new Set<string>();
        titles.forEach((title, index) => {
          if (title && seen.has(title)) {
            allErrors.push({
              row: index + 2,
              field: "title",
              message: `Duplicate title within import: "${scenarios[index].title}"`,
            });
          }
          if (title) seen.add(title);
        });

        setParsedScenarios(scenarios);
        setValidationErrors(allErrors);
        setState("preview");
      },
      error: (err) => {
        setError(`Failed to parse CSV: ${err.message}`);
      },
    });
  };

  const handleImport = async () => {
    setIsImporting(true);
    setError(null);

    try {
      const apiScenarios = parsedScenarios.map((s) => ({
        title: s.title.trim(),
        prompt: s.prompt.trim(),
        description: s.description?.trim() || undefined,
        evaluatorContext: s.evaluator_context?.trim() || undefined,
        mode: (s.mode?.toLowerCase().trim() || "phone") as ScenarioMode,
        category: (s.category?.toLowerCase().trim() || undefined) as ScenarioCategory | undefined,
      }));

      const response = await fetch("/api/scenarios/import", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ scenarios: apiScenarios }),
      });

      const data = await response.json();

      if (!data.ok) {
        throw new Error(data.error?.message || "Import failed");
      }

      setImportResult(data.data);
      setState("done");
      onSuccess(data.data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Import failed");
    } finally {
      setIsImporting(false);
    }
  };

  const truncate = (text: string | undefined, maxLength = 100): string => {
    if (!text) return "";
    return text.length > maxLength ? text.substring(0, maxLength) + "..." : text;
  };

  const getRowStatus = (rowIndex: number): string => {
    const row = rowIndex + 2;
    const hasError = validationErrors.some((e) => e.row === row);
    return hasError ? "✗" : "✓";
  };

  const getRowErrors = (rowIndex: number): ValidationError[] => {
    const row = rowIndex + 2;
    return validationErrors.filter((e) => e.row === row);
  };

  const validScenarioCount =
    parsedScenarios.length -
    new Set(validationErrors.map((e) => e.row)).size;
  const hasErrors = validationErrors.length > 0;

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-brand-navy border border-gray-700 rounded-lg p-6 w-full max-w-4xl max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="flex justify-between items-center mb-4">
          <h2 className="text-xl font-marfa text-white">
            {state === "upload" && "Import Scenarios"}
            {state === "preview" && "Preview Import"}
            {state === "done" && "Import Complete"}
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

        {/* Upload State */}
        {state === "upload" && (
          <div className="space-y-4">
            <p className="text-gray-300 font-marfa">
              Upload a CSV file with scenario definitions. Each row becomes one
              scenario.
            </p>

            <button
              type="button"
              onClick={handleDownloadTemplate}
              className="text-brand-orange hover:text-brand-orange-light font-marfa underline"
            >
              Download CSV Template
            </button>

            <div className="border-2 border-dashed border-gray-600 rounded-lg p-6">
              <input
                ref={fileInputRef}
                type="file"
                accept=".csv"
                onChange={handleFileSelect}
                className="w-full text-gray-400 text-sm file:mr-4 file:py-2 file:px-4
                           file:rounded file:border-0 file:text-sm file:font-marfa
                           file:bg-brand-orange file:text-white
                           hover:file:bg-brand-orange-hover"
              />
              <p className="text-gray-500 text-xs mt-2">
                Accepted: CSV (UTF-8 encoded, max 5MB, max 100 scenarios)
              </p>
            </div>

            <div className="flex justify-end">
              <button
                type="button"
                onClick={handleClose}
                className="px-4 py-2 text-gray-300 hover:text-white font-marfa"
              >
                Cancel
              </button>
            </div>
          </div>
        )}

        {/* Preview State */}
        {state === "preview" && (
          <div className="space-y-4">
            <div className="flex items-center gap-4">
              <span className="text-gray-300 font-marfa">
                {parsedScenarios.length} scenario
                {parsedScenarios.length !== 1 ? "s" : ""} found
              </span>
              {hasErrors ? (
                <span className="text-red-400 font-marfa">
                  {validationErrors.length} error
                  {validationErrors.length !== 1 ? "s" : ""}
                </span>
              ) : (
                <span className="text-green-400 font-marfa">All valid</span>
              )}
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-700">
                    <th className="text-left text-gray-400 font-marfa py-2 px-2 w-12">
                      Row
                    </th>
                    <th className="text-left text-gray-400 font-marfa py-2 px-2 w-12">
                      Status
                    </th>
                    <th className="text-left text-gray-400 font-marfa py-2 px-2">
                      Title
                    </th>
                    <th className="text-left text-gray-400 font-marfa py-2 px-2">
                      Prompt
                    </th>
                    <th className="text-left text-gray-400 font-marfa py-2 px-2 w-20">
                      Mode
                    </th>
                    <th className="text-left text-gray-400 font-marfa py-2 px-2 w-28">
                      Category
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {parsedScenarios.map((scenario, index) => {
                    const rowErrors = getRowErrors(index);
                    const hasRowError = rowErrors.length > 0;

                    return (
                      <tr
                        key={`row-${index + 2}-${scenario.title}`}
                        className={`border-b border-gray-800 ${
                          hasRowError ? "bg-red-900/20" : ""
                        }`}
                      >
                        <td className="py-2 px-2 text-gray-500">{index + 2}</td>
                        <td className="py-2 px-2">
                          <span
                            className={
                              hasRowError ? "text-red-400" : "text-green-400"
                            }
                          >
                            {getRowStatus(index)}
                          </span>
                        </td>
                        <td className="py-2 px-2 text-white">
                          {truncate(scenario.title, 50)}
                        </td>
                        <td className="py-2 px-2 text-gray-300">
                          {truncate(scenario.prompt, 80)}
                        </td>
                        <td className="py-2 px-2 text-gray-400">
                          {scenario.mode || "phone"}
                        </td>
                        <td className="py-2 px-2 text-gray-400">
                          {scenario.category || "—"}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {hasErrors && (
              <div className="bg-red-900/30 border border-red-800 rounded p-3">
                <p className="text-red-300 font-marfa text-sm mb-2">
                  Fix these errors in your CSV and re-upload:
                </p>
                <ul className="text-red-400 text-sm space-y-1">
                  {validationErrors.slice(0, 10).map((err) => (
                    <li key={`${err.row}-${err.field}-${err.message}`}>
                      Row {err.row}: {err.message}
                    </li>
                  ))}
                  {validationErrors.length > 10 && (
                    <li className="text-gray-400">
                      ...and {validationErrors.length - 10} more errors
                    </li>
                  )}
                </ul>
              </div>
            )}

            <div className="flex justify-between">
              <button
                type="button"
                onClick={() => {
                  setState("upload");
                  setParsedScenarios([]);
                  setValidationErrors([]);
                  if (fileInputRef.current) {
                    fileInputRef.current.value = "";
                  }
                }}
                className="px-4 py-2 text-gray-300 hover:text-white font-marfa"
              >
                ← Back
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
                  onClick={handleImport}
                  disabled={hasErrors || isImporting}
                  className="bg-brand-orange text-white px-4 py-2 rounded font-marfa
                             hover:bg-brand-orange-hover disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {isImporting
                    ? "Importing..."
                    : `Import ${validScenarioCount} Scenario${
                        validScenarioCount !== 1 ? "s" : ""
                      }`}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Done State */}
        {state === "done" && importResult && (
          <div className="space-y-4">
            <div className="bg-green-900/30 border border-green-700 rounded p-4">
              <p className="text-green-300 font-marfa text-lg mb-2">
                Created {importResult.created} scenario
                {importResult.created !== 1 ? "s" : ""}
                {importResult.skipped > 0 && (
                  <span className="text-yellow-400">
                    {" "}
                    (skipped {importResult.skipped} duplicate
                    {importResult.skipped !== 1 ? "s" : ""})
                  </span>
                )}
              </p>

              {importResult.created_titles.length > 0 && (
                <div className="mt-3">
                  <p className="text-gray-400 text-sm mb-1">Created:</p>
                  <ul className="text-green-400 text-sm space-y-1 max-h-40 overflow-y-auto">
                    {importResult.created_titles.map((title) => (
                      <li key={`created-${title}`}>• {title}</li>
                    ))}
                  </ul>
                </div>
              )}

              {importResult.skipped_titles.length > 0 && (
                <div className="mt-3">
                  <p className="text-gray-400 text-sm mb-1">
                    Skipped (already exist):
                  </p>
                  <ul className="text-yellow-400 text-sm space-y-1">
                    {importResult.skipped_titles.map((title) => (
                      <li key={`skipped-${title}`}>• {title}</li>
                    ))}
                  </ul>
                </div>
              )}
            </div>

            <div className="flex justify-end">
              <button
                type="button"
                onClick={handleClose}
                className="bg-brand-orange text-white px-4 py-2 rounded font-marfa
                           hover:bg-brand-orange-hover"
              >
                Done
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
