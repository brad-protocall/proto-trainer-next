import SupervisorPageClient from "./client";

interface PageProps {
  searchParams: Promise<{ supervisorId?: string }>;
}

/**
 * Supervisor Dashboard Page
 *
 * Authorization model (prototype):
 * - No server-side auth (uses client-side role selection)
 * - If ?supervisorId=X is provided, selects that supervisor in demo mode
 * - Without param, defaults to first supervisor
 *
 * Note: For production, implement proper session-based auth.
 */
export default async function SupervisorPage({ searchParams }: PageProps) {
  const params = await searchParams;
  const targetSupervisorId = params.supervisorId || null;

  return <SupervisorPageClient supervisorId={targetSupervisorId} />;
}
