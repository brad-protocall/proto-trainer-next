"use client";

import { useRouter } from "next/navigation";
import Header from "@/components/header";
import LearnerDashboard from "@/components/learner-dashboard";
import { Assignment, UserRole } from "@/types";

interface LearnerPageClientProps {
  learnerId?: string | null;
  /** Hint that this might be a supervisor view (URL had userId param) */
  isSupervisorView: boolean;
}

export default function LearnerPageClient({
  learnerId,
  isSupervisorView,
}: LearnerPageClientProps) {
  const router = useRouter();

  // For the prototype: if accessing /learner (no param), user is a learner
  // If accessing /learner?userId=X, they came from supervisor dashboard
  // The dashboard component will verify authorization via API
  const viewerRole: UserRole = isSupervisorView ? "supervisor" : "learner";

  const handleStartTraining = (assignment: Assignment, userId?: string) => {
    const userParam = userId ? `?userId=${userId}` : "";
    if (assignment.scenarioMode === "chat") {
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
          title="Learner Dashboard"
          role="learner"
          onRoleChange={handleRoleChange}
        />
        <LearnerDashboard
          onStartTraining={handleStartTraining}
          learnerId={learnerId}
          viewerRole={viewerRole}
        />
      </div>
    </main>
  );
}
