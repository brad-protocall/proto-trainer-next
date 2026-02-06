"use client";

import { useState } from "react";
import type { ApiResponse } from "@/types";

interface SessionFeedbackProps {
  sessionId: string;
  userId: string;
  /** "dark" for dark background (chat view), "light" for white background (voice modal) */
  variant?: "dark" | "light";
}

const FEEDBACK_OPTIONS = [
  {
    type: "user_feedback" as const,
    label: "The conversation wasn't helpful",
    defaultDetails: "The conversation wasn't helpful",
  },
  {
    type: "ai_guidance_concern" as const,
    label: "AI gave guidance inconsistent with training",
    defaultDetails: "AI provided guidance inconsistent with training material",
    isCritical: true,
  },
];

export default function SessionFeedback({
  sessionId,
  userId,
  variant = "dark",
}: SessionFeedbackProps) {
  const [selectedType, setSelectedType] = useState<string | null>(null);
  const [details, setDetails] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const isLight = variant === "light";

  const handleSelect = (type: string, defaultDetails: string) => {
    if (selectedType === type) {
      setSelectedType(null);
      setDetails("");
    } else {
      setSelectedType(type);
      setDetails(defaultDetails);
    }
  };

  const handleSubmit = async () => {
    if (!selectedType || !details.trim()) return;

    setSubmitting(true);
    setError(null);

    try {
      const response = await fetch(`/api/sessions/${sessionId}/flag`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-user-id": userId,
        },
        body: JSON.stringify({
          type: selectedType,
          details: details.trim(),
        }),
      });

      const data: ApiResponse<{ id: string }> = await response.json();
      if (!data.ok) throw new Error(data.error.message);

      setSubmitted(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to submit feedback");
    } finally {
      setSubmitting(false);
    }
  };

  if (submitted) {
    return (
      <div className={`mt-4 p-3 rounded-lg ${
        isLight
          ? "bg-green-50 border border-green-300"
          : "bg-green-900/30 border border-green-700"
      }`}>
        <p className={`text-sm font-marfa ${isLight ? "text-green-700" : "text-green-300"}`}>
          Thank you for your feedback. Your supervisor has been notified.
        </p>
      </div>
    );
  }

  return (
    <div className={`mt-4 pt-4 border-t ${isLight ? "border-gray-200" : "border-gray-600"}`}>
      <p className={`text-sm font-marfa mb-3 ${isLight ? "text-gray-600" : "text-gray-300"}`}>
        Was there an issue with this session?
      </p>

      <div className="flex flex-wrap gap-2 mb-3">
        {FEEDBACK_OPTIONS.map((option) => (
          <button
            key={option.type}
            onClick={() => handleSelect(option.type, option.defaultDetails)}
            className={`text-xs px-3 py-1.5 rounded-full font-marfa transition-colors ${
              selectedType === option.type
                ? option.isCritical
                  ? "bg-red-600 text-white"
                  : "bg-yellow-600 text-white"
                : isLight
                  ? "bg-gray-100 text-gray-700 hover:bg-gray-200"
                  : "bg-gray-700 text-gray-300 hover:bg-gray-600"
            }`}
          >
            {option.label}
          </button>
        ))}
      </div>

      {selectedType && (
        <div className="space-y-2">
          <textarea
            value={details}
            onChange={(e) => setDetails(e.target.value)}
            placeholder="Tell us more (optional)..."
            maxLength={1000}
            rows={2}
            className={`w-full border rounded px-3 py-2 text-sm font-marfa focus:outline-none focus:border-brand-orange ${
              isLight
                ? "bg-white border-gray-300 text-gray-800"
                : "bg-gray-800 border-gray-600 text-white"
            }`}
          />
          <div className="flex items-center gap-3">
            <button
              onClick={handleSubmit}
              disabled={submitting || !details.trim()}
              className="text-sm px-4 py-1.5 bg-brand-orange hover:bg-brand-orange-hover
                         text-white rounded font-marfa font-medium
                         disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {submitting ? "Submitting..." : "Submit Feedback"}
            </button>
            {error && (
              <span className="text-red-400 text-xs font-marfa">{error}</span>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
