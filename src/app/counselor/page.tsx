"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { Suspense } from "react";
import Header from "@/components/header";
import CounselorDashboard from "@/components/counselor-dashboard";
import { Assignment, UserRole } from "@/types";

function CounselorPageContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const counselorId = searchParams.get("userId");

  const handleStartTraining = (assignment: Assignment, userId?: string) => {
    // Handle both camelCase (API) and snake_case (types) field names
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const a = assignment as any;
    const scenarioMode = a.scenarioMode || a.scenario_mode;
    const userParam = userId ? `?userId=${userId}` : "";
    if (scenarioMode === "chat") {
      router.push(`/training/chat/${assignment.id}${userParam}`);
    } else {
      // Voice training would go to a different route
      router.push(`/training/voice/${assignment.id}${userParam}`);
    }
  };

  const handleRoleChange = (role: UserRole) => {
    router.push(`/${role}`);
  };

  return (
    <main className="min-h-screen bg-slate-700">
      <div className="max-w-4xl mx-auto px-4">
        <Header
          title="Counselor Dashboard"
          role="counselor"
          onRoleChange={handleRoleChange}
        />
        <CounselorDashboard
          onStartTraining={handleStartTraining}
          counselorId={counselorId}
        />
      </div>
    </main>
  );
}

export default function CounselorPage() {
  return (
    <Suspense fallback={<div className="min-h-screen bg-slate-700" />}>
      <CounselorPageContent />
    </Suspense>
  );
}
