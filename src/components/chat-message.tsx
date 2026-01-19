"use client";

import { TranscriptRole } from "@/types";

interface ChatMessageProps {
  message: string;
  role: TranscriptRole;
}

// Simple AI icon component to avoid react-icons dependency
function AIIcon() {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      fill="currentColor"
      className="w-5 h-5"
    >
      <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-1 17.93c-3.95-.49-7-3.85-7-7.93 0-.62.08-1.21.21-1.79L9 15v1c0 1.1.9 2 2 2v1.93zm6.9-2.54c-.26-.81-1-1.39-1.9-1.39h-1v-3c0-.55-.45-1-1-1H8v-2h2c.55 0 1-.45 1-1V7h2c1.1 0 2-.9 2-2v-.41c2.93 1.19 5 4.06 5 7.41 0 2.08-.8 3.97-2.1 5.39z" />
    </svg>
  );
}

export default function ChatMessage({ message, role }: ChatMessageProps) {
  const roleIcon =
    role === "user" ? (
      <div className="rounded-full h-8 w-8 bg-slate-600 flex items-center justify-center font-semibold text-slate-300 shrink-0">
        C
      </div>
    ) : (
      <div className="rounded-full h-8 w-8 bg-brand-orange flex items-center justify-center font-semibold text-slate-50 shrink-0">
        <AIIcon />
      </div>
    );

  const roleName = role === "user" ? "Counselor" : "Proto Training Guide";

  return (
    <div className="flex flex-row mx-2 my-4">
      {roleIcon}
      <div className="p-1 ml-2">
        <div className="flex-col">
          <p className="font-semibold text-slate-400">{roleName}</p>
          <p className="text-slate-50 leading-8 whitespace-pre-wrap">
            {message}
          </p>
        </div>
      </div>
    </div>
  );
}
