"use client";

import { useState, useEffect, useRef } from "react";
import Image from "next/image";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { useChat } from "@/hooks/use-chat";
import { Assignment } from "@/types";
import SessionFeedback from "./session-feedback";
import DocumentReviewButton from "./document-review-button";

interface ChatTrainingViewProps {
  assignment: Assignment | null;
  userId: string;
  onComplete: () => void;
}

export default function ChatTrainingView({
  assignment,
  userId,
  onComplete,
}: ChatTrainingViewProps) {
  const scenarioId = assignment?.scenarioId;
  const scenarioTitle = assignment?.scenarioTitle || "Untitled";

  const {
    sessionId,
    messages,
    sendMessage,
    isLoading,
    evaluation,
    getEvaluation,
    error,
    initSession,
  } = useChat({
    userId,
    scenarioId,
    assignmentId: assignment?.id,
  });

  const [inputValue, setInputValue] = useState("");
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Detect free practice mode (no scenario assigned)
  const isFreePractice = !scenarioId;

  // Initialize session on mount
  useEffect(() => {
    initSession();
  }, [initSession]);

  // Auto-scroll to bottom and refocus input on new messages
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
    inputRef.current?.focus();
  }, [messages]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!inputValue.trim() || isLoading) return;
    await sendMessage(inputValue);
    setInputValue("");
  };

  const handleGetFeedback = async () => {
    await getEvaluation();
  };

  return (
    <div className="flex flex-col h-screen bg-brand-navy">
      {/* Header */}
      <header className="flex items-center justify-between p-4 border-b border-gray-700">
        <Image
          src="/protocall-logo.svg"
          alt="Protocall"
          width={120}
          height={32}
          className="h-8 w-auto"
        />
        <div className="text-center flex-1 mx-4">
          <h2 className="text-white font-marfa font-medium">
            {isFreePractice ? "Free Practice" : scenarioTitle}
          </h2>
          <span className="text-xs text-gray-400">Chat Training</span>
        </div>
        <button
          onClick={onComplete}
          className="text-gray-400 hover:text-white text-sm font-marfa"
        >
          Exit
        </button>
      </header>

      {/* Messages area */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {messages.map((msg) => (
          <div
            key={msg.timestamp?.toISOString() ?? crypto.randomUUID()}
            className={`flex ${
              msg.role === "user" ? "justify-end" : "justify-start"
            }`}
          >
            <div
              className={`max-w-[70%] rounded-lg p-3 ${
                msg.role === "user"
                  ? msg.failed
                    ? "bg-red-500/30 text-white border border-red-500"
                    : "bg-brand-orange text-white"
                  : "bg-gray-700 text-white"
              }`}
            >
              <p className="text-sm font-marfa whitespace-pre-wrap">
                {msg.content}
              </p>
              {msg.failed && (
                <span className="text-xs text-red-300 mt-1 block">
                  Failed to send
                </span>
              )}
            </div>
          </div>
        ))}

        {isLoading && (
          <div className="flex justify-start">
            <div className="bg-gray-700 rounded-lg p-3">
              <span className="animate-pulse text-gray-400">...</span>
            </div>
          </div>
        )}

        {/* Simple error display - auto-clears on next action */}
        {error && (
          <p className="text-red-400 text-sm text-center">{error}</p>
        )}

        <div ref={messagesEndRef} />
      </div>

      {/* Input area or Evaluation */}
      {!evaluation ? (
        <div className="p-4 border-t border-gray-700">
          <form onSubmit={handleSubmit} className="flex gap-2">
            <input
              ref={inputRef}
              type="text"
              value={inputValue}
              onChange={(e) => setInputValue(e.target.value)}
              placeholder="Type your response..."
              className="flex-1 bg-gray-800 text-white rounded-lg px-4 py-2 font-marfa
                         focus:outline-none focus:ring-2 focus:ring-brand-orange"
              disabled={isLoading}
              autoFocus
            />
            <button
              type="submit"
              disabled={isLoading || !inputValue.trim()}
              className="bg-brand-orange hover:bg-brand-orange-hover text-white px-4 py-2 rounded-lg
                         font-marfa font-medium disabled:opacity-50 disabled:cursor-not-allowed"
            >
              Send
            </button>
            <button
              type="button"
              onClick={handleGetFeedback}
              disabled={isLoading || messages.length < 2}
              className="bg-green-600 hover:bg-green-700 text-white px-4 py-2 rounded-lg
                         font-marfa font-medium disabled:opacity-50 disabled:cursor-not-allowed"
            >
              Get Feedback
            </button>
          </form>
        </div>
      ) : (
        <div className="p-4 border-t border-gray-700 max-h-[50vh] overflow-y-auto">
          <div className="bg-gray-800 rounded-lg p-4">
            <h3 className="text-white font-marfa font-bold mb-3">
              Session Feedback
            </h3>
            <div className="prose prose-sm prose-invert max-w-none prose-headings:text-white prose-p:text-gray-300 prose-li:text-gray-300 prose-strong:text-white">
              <ReactMarkdown remarkPlugins={[remarkGfm]}>
                {evaluation.evaluation}
              </ReactMarkdown>
            </div>
            {sessionId && (
              <>
                <DocumentReviewButton sessionId={sessionId} userId={userId} />
                <SessionFeedback sessionId={sessionId} userId={userId} />
              </>
            )}
          </div>
          <button
            onClick={onComplete}
            className="mt-4 w-full bg-brand-orange hover:bg-brand-orange-hover
                       text-white py-2 rounded-lg font-marfa font-medium"
          >
            Back to Dashboard
          </button>
        </div>
      )}
    </div>
  );
}
