"use client";

import { useState } from "react";
import type { ApiResponse } from "@/types";

interface SessionFeedbackProps {
  sessionId: string;
  userId: string;
  /** "dark" for dark background (chat view), "light" for white background (voice modal) */
  variant?: "dark" | "light";
  /** Session mode — shows voice-specific feedback options when "phone" */
  mode?: "phone" | "chat";
}

const COMMON_FEEDBACK_OPTIONS = [
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

const VOICE_FEEDBACK_OPTION = {
  type: "voice_technical_issue" as const,
  label: "Voice agent had technical issues",
  defaultDetails: "Voice agent had technical issues (disconnection, audio quality, unresponsive)",
  isCritical: false,
};

export default function SessionFeedback({
  sessionId,
  userId,
  variant = "dark",
  mode,
}: SessionFeedbackProps) {
  const feedbackOptions = mode === "phone"
    ? [...COMMON_FEEDBACK_OPTIONS, VOICE_FEEDBACK_OPTION]
    : COMMON_FEEDBACK_OPTIONS;
  const [selectedType, setSelectedType] = useState<string | null>(null);
  const [details, setDetails] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isOther, setIsOther] = useState(false);

  const isLight = variant === "light";

  const handleSelect = (type: string, defaultDetails: string) => {
    if (selectedType === type) {
      setSelectedType(null);
      setDetails("");
    } else {
      setIsOther(false);
      setSelectedType(type);
      setDetails(defaultDetails);
    }
  };

  const handleOther = () => {
    if (isOther) {
      setIsOther(false);
      setSelectedType(null);
      setDetails("");
    } else {
      setIsOther(true);
      setSelectedType("user_feedback");
      setDetails("");
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

      if (response.status === 429) {
        throw new Error("Please wait before submitting more feedback.");
      }
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
        {feedbackOptions.map((option) => (
          <button
            key={option.type}
            onClick={() => handleSelect(option.type, option.defaultDetails)}
            className={`text-xs px-3 py-1.5 rounded-full font-marfa transition-colors ${
              selectedType === option.type && !isOther
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
        <button
          onClick={handleOther}
          className={`text-xs px-3 py-1.5 rounded-full font-marfa transition-colors ${
            isOther
              ? "bg-yellow-600 text-white"
              : isLight
                ? "bg-gray-100 text-gray-700 hover:bg-gray-200"
                : "bg-gray-700 text-gray-300 hover:bg-gray-600"
          }`}
        >
          Other
        </button>
      </div>

      {(selectedType || isOther) && (
        <div className="space-y-2">
          <textarea
            value={details}
            onChange={(e) => setDetails(e.target.value)}
            placeholder={isOther ? "Describe the issue..." : "Tell us more (optional)..."}
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
