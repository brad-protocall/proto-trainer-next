"use client";

import { useState, useEffect, useRef } from "react";
import type { ApiResponse, DocumentReview } from "@/types";

type ReviewState = "idle" | "uploading" | "reviewing" | "complete" | "error" | "has-review";

interface DocumentReviewButtonProps {
  sessionId: string;
  userId: string;
  hasExistingReview?: boolean;
}

function getScoreColor(score: number): string {
  if (score >= 80) return "bg-green-500";
  if (score >= 60) return "bg-yellow-500";
  return "bg-red-500";
}

function getScoreLabel(score: number): string {
  if (score >= 80) return "text-green-400";
  if (score >= 60) return "text-yellow-400";
  return "text-red-400";
}

function getSeverityColor(severity: string): string {
  if (severity === "critical") return "text-red-400";
  if (severity === "important") return "text-yellow-400";
  return "text-gray-400";
}

function getSeverityBadge(severity: string): string {
  if (severity === "critical") return "bg-red-500/20 text-red-300";
  if (severity === "important") return "bg-yellow-500/20 text-yellow-300";
  return "bg-gray-500/20 text-gray-300";
}

export default function DocumentReviewButton({
  sessionId,
  userId,
  hasExistingReview = false,
}: DocumentReviewButtonProps) {
  const [state, setState] = useState<ReviewState>(hasExistingReview ? "has-review" : "idle");
  const [review, setReview] = useState<DocumentReview | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [elapsed, setElapsed] = useState(0);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Elapsed timer for uploading/reviewing states
  useEffect(() => {
    if (state === "uploading" || state === "reviewing") {
      setElapsed(0);
      timerRef.current = setInterval(() => setElapsed((e) => e + 1), 1000);
    } else if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [state]);

  const handleClick = () => {
    if (state === "has-review") {
      loadExistingReview();
    }
  };

  const loadExistingReview = async () => {
    setState("reviewing");
    setError(null);
    try {
      const response = await fetch(`/api/sessions/${sessionId}/review-document`, {
        headers: { "x-user-id": userId },
      });
      const data: ApiResponse<DocumentReview> = await response.json();
      if (!data.ok) throw new Error(data.error.message);
      setReview(data.data);
      setState("complete");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load review");
      setState("has-review");
    }
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // Reset file input for re-selection
    e.target.value = "";

    setState("uploading");
    setError(null);

    const formData = new FormData();
    formData.append("file", file);

    try {
      setState("reviewing");
      const response = await fetch(`/api/sessions/${sessionId}/review-document`, {
        method: "POST",
        headers: { "x-user-id": userId },
        body: formData,
      });

      const data: ApiResponse<DocumentReview> = await response.json();
      if (!data.ok) throw new Error(data.error.message);
      setReview(data.data);
      setState("complete");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to review document");
      setState("error");
    }
  };

  // Score bar component
  const ScoreBar = ({ label, score }: { label: string; score: number }) => (
    <div className="mb-3">
      <div className="flex justify-between items-center mb-1">
        <span className="text-sm font-marfa text-gray-300">{label}</span>
        <span className={`text-sm font-marfa font-bold ${getScoreLabel(score)}`}>
          {score}/100
        </span>
      </div>
      <div className="w-full bg-gray-700 rounded-full h-2.5">
        <div
          className={`h-2.5 rounded-full transition-all duration-500 ${getScoreColor(score)}`}
          style={{ width: `${score}%` }}
        />
      </div>
    </div>
  );

  // Render complete results
  if (state === "complete" && review) {
    return (
      <div className="mt-4 bg-gray-800 border border-gray-600 rounded-lg p-4">
        <div className="flex justify-between items-center mb-4">
          <h3 className="text-white font-marfa font-bold">Documentation Review</h3>
          <span className="text-gray-400 text-xs font-marfa">{review.fileName}</span>
        </div>

        <ScoreBar label="Transcript Accuracy" score={review.transcriptAccuracy} />
        <ScoreBar label="Guidelines Compliance" score={review.guidelinesCompliance} />
        <ScoreBar label="Overall Score" score={review.overallScore} />

        {/* Specific gaps */}
        {Array.isArray(review.specificGaps) && review.specificGaps.length > 0 && (
          <div className="mt-4">
            <h4 className="text-gray-300 font-marfa font-medium text-sm mb-2">
              Specific Gaps
            </h4>
            <div className="space-y-2">
              {review.specificGaps.map((gap, i) => (
                <div
                  key={i}
                  className="bg-gray-900 rounded p-3 border border-gray-700"
                >
                  <div className="flex items-center gap-2 mb-1">
                    <span className={`text-xs px-2 py-0.5 rounded ${getSeverityBadge(gap.severity)}`}>
                      {gap.severity}
                    </span>
                    <span className={`text-xs font-marfa ${getSeverityColor(gap.severity)}`}>
                      {gap.type}
                    </span>
                  </div>
                  <p className="text-gray-300 text-sm font-marfa">{gap.detail}</p>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Narrative */}
        {review.reviewText && (
          <div className="mt-4 pt-3 border-t border-gray-700">
            <p className="text-gray-300 text-sm font-marfa leading-relaxed">
              {review.reviewText}
            </p>
          </div>
        )}
      </div>
    );
  }

  // For idle/error states, use a <label> wrapping a file input — more reliable than
  // programmatic .click() inside scrollable modal containers
  if (state === "idle" || state === "error") {
    return (
      <div className="mt-3">
        <label
          className="block w-full font-marfa font-bold py-2.5 px-4 rounded text-sm
                     text-center cursor-pointer bg-teal-600 hover:bg-teal-700 text-white"
        >
          Review Documentation
          <input
            type="file"
            accept=".pdf,application/pdf"
            onChange={handleFileChange}
            className="hidden"
          />
        </label>
        {state === "error" && error && (
          <p className="text-red-400 text-xs font-marfa mt-1">{error}</p>
        )}
      </div>
    );
  }

  return (
    <div className="mt-3">
      <button
        onClick={state === "has-review" ? handleClick : undefined}
        disabled={state === "uploading" || state === "reviewing"}
        className={`w-full font-marfa font-bold py-2.5 px-4 rounded text-sm
                   disabled:opacity-50 disabled:cursor-not-allowed
                   ${state === "has-review"
                     ? "bg-indigo-600 hover:bg-indigo-700 text-white"
                     : "bg-teal-600 hover:bg-teal-700 text-white"
                   }`}
      >
        {state === "uploading" && `Uploading... (${elapsed}s)`}
        {state === "reviewing" && `Reviewing documentation... (${elapsed}s)`}
        {state === "has-review" && "View Documentation Review"}
      </button>
    </div>
  );
}
