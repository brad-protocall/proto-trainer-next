import { headers } from "next/headers";
import { redirect } from "next/navigation";
import prisma from "@/lib/prisma";
import CounselorPageClient from "./client";

interface PageProps {
  searchParams: Promise<{ userId?: string }>;
}

export default async function CounselorPage({ searchParams }: PageProps) {
  const headersList = await headers();
  const authenticatedUserId = headersList.get("x-user-id");

  // Get the userId from URL params (if supervisor is viewing another counselor)
  const params = await searchParams;
  const targetUserId = params.userId;

  // If no authenticated user, redirect to home
  if (!authenticatedUserId) {
    redirect("/");
  }

  // If a target userId is specified, validate authorization
  if (targetUserId && targetUserId !== authenticatedUserId) {
    // Fetch the authenticated user to check their role
    const authenticatedUser = await prisma.user.findUnique({
      where: { id: authenticatedUserId },
      select: { role: true },
    });

    // If the authenticated user is not a supervisor, deny access
    if (!authenticatedUser || authenticatedUser.role !== "supervisor") {
      // Return 403 Forbidden for non-supervisors trying to access another user's dashboard
      return (
        <main className="min-h-screen bg-slate-700 flex items-center justify-center">
          <div className="text-center p-8 bg-red-900/50 border border-red-500 rounded-lg max-w-md">
            <h1 className="text-2xl font-marfa font-bold text-white mb-4">
              Access Denied
            </h1>
            <p className="text-gray-300 mb-4">
              You are not authorized to view another counselor&apos;s dashboard.
            </p>
            <a
              href="/counselor"
              className="inline-block bg-brand-orange hover:bg-brand-orange-hover text-white font-marfa font-bold py-2 px-4 rounded"
            >
              Go to Your Dashboard
            </a>
          </div>
        </main>
      );
    }
  }

  // Determine if viewing as supervisor (userId param present and user is supervisor)
  const isSupervisorView = Boolean(targetUserId);

  return <CounselorPageClient counselorId={targetUserId} isSupervisorView={isSupervisorView} />;
}
