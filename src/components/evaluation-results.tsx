"use client";

import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { EvaluationResult } from "@/types";

interface EvaluationResultsProps {
  evaluation: EvaluationResult;
  onClose: () => void;
}

export default function EvaluationResults({
  evaluation,
  onClose,
}: EvaluationResultsProps) {
  if (!evaluation) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
      <div className="bg-white rounded-lg max-w-2xl w-full max-h-[80vh] overflow-y-auto p-6">
        <div className="flex justify-between items-center mb-4">
          <h2 className="text-xl font-bold text-gray-800">Session Feedback</h2>
          <button
            onClick={onClose}
            className="text-gray-500 hover:text-gray-700"
          >
            <svg
              className="w-6 h-6"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M6 18L18 6M6 6l12 12"
              />
            </svg>
          </button>
        </div>

        <div className="prose prose-sm max-w-none prose-headings:text-gray-800 prose-p:text-gray-700 prose-li:text-gray-700 prose-strong:text-gray-800">
          <ReactMarkdown remarkPlugins={[remarkGfm]}>
            {evaluation.evaluation}
          </ReactMarkdown>
        </div>

        <div className="mt-4 flex justify-end">
          <button
            onClick={onClose}
            className="bg-brand-orange hover:bg-brand-orange-hover text-white px-4 py-2 rounded"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
