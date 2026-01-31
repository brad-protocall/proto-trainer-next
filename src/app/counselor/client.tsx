"use client";

import { useRouter } from "next/navigation";
import Header from "@/components/header";
import CounselorDashboard from "@/components/counselor-dashboard";
import { Assignment, UserRole } from "@/types";

interface CounselorPageClientProps {
  counselorId?: string | null;
  isSupervisorView: boolean;
}

export default function CounselorPageClient({
  counselorId,
  isSupervisorView,
}: CounselorPageClientProps) {
  const router = useRouter();
  const viewerRole: UserRole = isSupervisorView ? "supervisor" : "counselor";

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
          title="Counselor Dashboard"
          role="counselor"
          onRoleChange={handleRoleChange}
        />
        <CounselorDashboard
          onStartTraining={handleStartTraining}
          counselorId={counselorId}
          viewerRole={viewerRole}
        />
      </div>
    </main>
  );
}
