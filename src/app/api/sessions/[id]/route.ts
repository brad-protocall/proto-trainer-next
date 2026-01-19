import { NextRequest } from 'next/server';
import { prisma } from '@/lib/prisma';
import { apiSuccess, handleApiError, notFound } from '@/lib/api';

interface RouteParams {
  params: Promise<{ id: string }>;
}

/**
 * GET /api/sessions/[id]
 * Get a session with its full transcript
 */
export async function GET(request: NextRequest, { params }: RouteParams) {
  try {
    const { id } = await params;

    const session = await prisma.session.findUnique({
      where: { id },
      include: {
        transcript: {
          orderBy: { turnOrder: 'asc' },
        },
        assignment: {
          include: {
            scenario: {
              select: {
                id: true,
                title: true,
                description: true,
                mode: true,
                category: true,
              },
            },
            counselor: {
              select: {
                id: true,
                displayName: true,
              },
            },
            evaluation: {
              select: {
                id: true,
                overallScore: true,
                strengths: true,
                areasToImprove: true,
              },
            },
          },
        },
      },
    });

    if (!session) {
      return notFound('Session not found');
    }

    return apiSuccess(session);
  } catch (error) {
    return handleApiError(error);
  }
}
