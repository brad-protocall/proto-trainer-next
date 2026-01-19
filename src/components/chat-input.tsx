"use client";

import { useState, useEffect, useRef, FormEvent, KeyboardEvent } from "react";

// Simple send icon component to avoid react-icons dependency
function SendIcon() {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      fill="currentColor"
      className="w-5 h-5"
    >
      <path d="M2.01 21L23 12 2.01 3 2 10l15 2-15 2z" />
    </svg>
  );
}

interface ChatInputProps {
  disabled: boolean;
  onSend: (message: string) => void;
  placeholder?: string;
}

export default function ChatInput({
  disabled,
  onSend,
  placeholder = "Type your response (Press 'Shift + Return' for a new line and 'Enter' to send)",
}: ChatInputProps) {
  const [message, setMessage] = useState("");
  const [rows, setRows] = useState(1);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Handle keyboard shortcuts
  const handleKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      if (message.trim()) {
        onSend(message);
        setMessage("");
      }
    }
  };

  // Calculate rows based on content
  useEffect(() => {
    if (!message || message === "\n") {
      setMessage("");
      setRows(1);
      return;
    }

    const newlineCount = message.split("\n").length - 1;
    const lineCount = Math.min(Math.ceil(message.length / 50), 5);
    setRows(newlineCount + lineCount);
  }, [message]);

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    if (message.trim()) {
      onSend(message);
      setMessage("");
    }
  };

  return (
    <div className="w-full flex flex-col">
      <div className="w-full flex flex-row items-center space-between my-3">
        <form
          className="min-w-80% w-full border-2 border-slate-400 rounded-lg p-2 flex flex-row m-2 text-slate-50"
          onSubmit={handleSubmit}
          autoComplete="off"
        >
          <textarea
            ref={textareaRef}
            rows={rows}
            cols={50}
            name="message"
            placeholder={placeholder}
            className="w-full bg-slate-700 focus:outline-none p-1 resize-none"
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            onKeyDown={handleKeyDown}
            disabled={disabled}
          />
          <button
            type="submit"
            disabled={disabled || !message.trim()}
            className={
              "bg-brand-orange " +
              "text-white " +
              "font-bold " +
              "py-2 px-4 " +
              "rounded " +
              "hover:bg-brand-orange-hover " +
              "disabled:bg-slate-600 " +
              "disabled:text-slate-400"
            }
          >
            <SendIcon />
          </button>
        </form>
      </div>
    </div>
  );
}
