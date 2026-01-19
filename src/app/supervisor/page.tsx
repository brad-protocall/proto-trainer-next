"use client";

import { useRouter } from "next/navigation";
import Header from "@/components/header";
import SupervisorDashboard from "@/components/supervisor-dashboard";
import { UserRole } from "@/types";

export default function SupervisorPage() {
  const router = useRouter();

  const handleRoleChange = (role: UserRole) => {
    router.push(`/${role}`);
  };

  return (
    <main className="min-h-screen bg-slate-700">
      <div className="max-w-6xl mx-auto px-4">
        <Header
          title="Supervisor Dashboard"
          role="supervisor"
          onRoleChange={handleRoleChange}
        />
        <SupervisorDashboard />
      </div>
    </main>
  );
}
