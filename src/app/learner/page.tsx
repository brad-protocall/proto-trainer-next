import LearnerPageClient from "./client";

interface PageProps {
  searchParams: Promise<{ userId?: string }>;
}

/**
 * Learner Dashboard Page
 *
 * Authorization model (prototype):
 * - No server-side auth (uses client-side role selection)
 * - If ?userId=X is provided, the client component handles authorization
 * - Supervisors can view any learner's dashboard via URL param
 * - Learners viewing without param see their own dashboard
 *
 * Note: For production, implement proper session-based auth.
 */
export default async function LearnerPage({ searchParams }: PageProps) {
  const params = await searchParams;
  const targetUserId = params.userId || null;

  // When a userId is specified, it's a supervisor viewing another learner
  // The client component will verify authorization
  const isSupervisorView = Boolean(targetUserId);

  return (
    <LearnerPageClient
      learnerId={targetUserId}
      isSupervisorView={isSupervisorView}
    />
  );
}
