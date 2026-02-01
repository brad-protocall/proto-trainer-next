"use client";

import { useState, useEffect } from "react";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import ChatTrainingView from "@/components/chat-training-view";
import Loading from "@/components/loading";
import { Assignment, User, ApiResponse } from "@/types";

export default function ChatTrainingPage() {
  const params = useParams();
  const router = useRouter();
  const searchParams = useSearchParams();
  const assignmentId = params.assignmentId as string;
  const userIdParam = searchParams.get("userId");

  const [assignment, setAssignment] = useState<Assignment | null>(null);
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function fetchData() {
      try {
        // Fetch current user (counselor)
        const userRes = await fetch("/api/users?role=counselor");
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const userData: ApiResponse<any[]> = await userRes.json();
        let user = null;
        if (userData.ok && userData.data.length > 0) {
          // API returns camelCase, handle both naming conventions
          const users = userData.data.map((u) => ({
            ...u,
            display_name: u.displayName || u.displayName,
          }));
          // Use userId from URL if provided, otherwise fall back to Test Counselor
          if (userIdParam) {
            user = users.find((c: User) => c.id === userIdParam);
          }
          if (!user) {
            const testCounselor = users.find(
              (c: User) => c.displayName === "Test Counselor"
            );
            user = testCounselor || users[0];
          }
          setCurrentUser(user);
        }

        // Handle "free" or "free-practice" mode - no assignment needed
        if (assignmentId === "free" || assignmentId === "free-practice") {
          setAssignment(null);
          setLoading(false);
          return;
        }

        // Fetch assignment with auth header
        const res = await fetch(`/api/assignments/${assignmentId}`, {
          headers: user ? { "x-user-id": user.id } : {},
        });
        if (!res.ok) {
          throw new Error("Failed to load assignment");
        }
        const data = await res.json();
        if (!data.ok) {
          throw new Error(data.error?.message || "Failed to load assignment");
        }
        setAssignment(data.data);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to load assignment");
      } finally {
        setLoading(false);
      }
    }

    fetchData();
  }, [assignmentId, userIdParam]);

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
