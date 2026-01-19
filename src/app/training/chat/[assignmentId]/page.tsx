"use client";

import { useState, useEffect } from "react";
import { useParams, useRouter } from "next/navigation";
import ChatTrainingView from "@/components/chat-training-view";
import Loading from "@/components/loading";
import { Assignment } from "@/types";

export default function ChatTrainingPage() {
  const params = useParams();
  const router = useRouter();
  const assignmentId = params.assignmentId as string;

  const [assignment, setAssignment] = useState<Assignment | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function fetchAssignment() {
      // Handle "free" practice mode - no assignment needed
      if (assignmentId === "free") {
        setAssignment(null);
        setLoading(false);
        return;
      }

      try {
        const res = await fetch(`/api/assignments/${assignmentId}`);
        if (!res.ok) {
          throw new Error("Failed to load assignment");
        }
        const data = await res.json();
        setAssignment(data);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to load assignment");
      } finally {
        setLoading(false);
      }
    }

    fetchAssignment();
  }, [assignmentId]);

  const handleComplete = () => {
    router.push("/counselor");
  };

  if (loading) {
    return <Loading />;
  }

  if (error) {
    return (
      <div className="min-h-screen bg-brand-navy flex items-center justify-center">
        <div className="text-center">
          <p className="text-red-400 mb-4">{error}</p>
          <button
            onClick={() => router.push("/counselor")}
            className="text-brand-orange hover:underline"
          >
            Return to Dashboard
          </button>
        </div>
      </div>
    );
  }

  return <ChatTrainingView assignment={assignment} onComplete={handleComplete} />;
}
