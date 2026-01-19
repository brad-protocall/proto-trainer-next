"use client";

import { useState, useEffect } from "react";
import { useParams, useRouter } from "next/navigation";
import ChatTrainingView from "@/components/chat-training-view";
import Loading from "@/components/loading";
import { Assignment, User, ApiResponse } from "@/types";

export default function ChatTrainingPage() {
  const params = useParams();
  const router = useRouter();
  const assignmentId = params.assignmentId as string;

  const [assignment, setAssignment] = useState<Assignment | null>(null);
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function fetchData() {
      try {
        // Fetch current user (counselor)
        const userRes = await fetch("/api/users?role=counselor");
        const userData: ApiResponse<User[]> = await userRes.json();
        if (userData.ok && userData.data.length > 0) {
          const testCounselor = userData.data.find(
            (c) => c.display_name === "Test Counselor"
          );
          setCurrentUser(testCounselor || userData.data[0]);
        }

        // Handle "free" practice mode - no assignment needed
        if (assignmentId === "free") {
          setAssignment(null);
          setLoading(false);
          return;
        }

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

    fetchData();
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

  if (!currentUser) {
    return <Loading />;
  }

  return <ChatTrainingView assignment={assignment} userId={currentUser.id} onComplete={handleComplete} />;
}
