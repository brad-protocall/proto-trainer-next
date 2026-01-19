"use client";

import { useRouter } from "next/navigation";
import Header from "@/components/header";
import CounselorDashboard from "@/components/counselor-dashboard";
import { Assignment, UserRole } from "@/types";

export default function CounselorPage() {
  const router = useRouter();

  const handleStartTraining = (assignment: Assignment) => {
    if (assignment.scenario_mode === "chat") {
      router.push(`/training/chat/${assignment.id}`);
    } else {
      // Voice training would go to a different route
      router.push(`/training/voice/${assignment.id}`);
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
        <CounselorDashboard onStartTraining={handleStartTraining} />
      </div>
    </main>
  );
}
