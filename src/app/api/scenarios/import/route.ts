import { NextRequest } from 'next/server'
import prisma from '@/lib/prisma'
import { apiSuccess, apiError, handleApiError } from '@/lib/api'
import { requireSupervisor } from '@/lib/auth'
import { ScenarioCategorySchema } from '@/lib/validators'
import { z } from 'zod'
import { writeFile, mkdir } from 'fs/promises'
import path from 'path'

const importScenarioSchema = z.object({
  title: z.string().min(1),
  description: z.string().optional(),
  prompt: z.string().min(1),
  mode: z.enum(['phone', 'chat']).default('phone'),
  category: ScenarioCategorySchema.optional(),
  evaluatorContext: z.string().optional(),
  accountId: z.string().uuid().optional(),
  isOneTime: z.boolean().default(false),
  relevantPolicySections: z.string().max(500).optional(),
})

const bulkImportSchema = z.object({
  scenarios: z.array(importScenarioSchema).min(1).max(100),
  accountId: z.string().uuid().optional(),
})

export async function POST(request: NextRequest) {
  try {
    const authResult = await requireSupervisor(request)
    if (authResult.error) return authResult.error
    const user = authResult.user

    const body = await request.json()
    const parseResult = bulkImportSchema.safeParse(body)

    if (!parseResult.success) {
      return apiError(
        { type: 'VALIDATION_ERROR', message: 'Validation failed', details: parseResult.error.flatten().fieldErrors as Record<string, unknown> },
        400
      )
    }

    const { scenarios, accountId: defaultAccountId } = parseResult.data

    // Determine account ID - use provided default or get first account
    let resolvedAccountId = defaultAccountId
    if (!resolvedAccountId) {
      const firstAccount = await prisma.account.findFirst({
        orderBy: { createdAt: 'asc' },
      })
      if (!firstAccount) {
        return apiError({ type: 'NOT_FOUND', message: 'No accounts exist. Create an account first.' }, 400)
      }
      resolvedAccountId = firstAccount.id
    } else {
      const account = await prisma.account.findUnique({ where: { id: resolvedAccountId } })
      if (!account) {
        return apiError({ type: 'NOT_FOUND', message: 'Account not found' }, 404)
      }
    }

    // Get existing titles for duplicate check
    const existingTitles = new Set(
      (await prisma.scenario.findMany({ select: { title: true } }))
        .map(s => s.title.toLowerCase().trim())
    )

    const created: string[] = []
    const skipped: string[] = []

    for (const scenario of scenarios) {
      const normalizedTitle = scenario.title.toLowerCase().trim()

      if (existingTitles.has(normalizedTitle)) {
        skipped.push(scenario.title)
        continue
      }

      // Use scenario-specific accountId or the resolved default
      const scenarioAccountId = scenario.accountId || resolvedAccountId

      // Create scenario
      const newScenario = await prisma.scenario.create({
        data: {
          title: scenario.title,
          description: scenario.description,
          prompt: scenario.prompt,
          mode: scenario.mode,
          category: scenario.category,
          isOneTime: scenario.isOneTime,
          relevantPolicySections: scenario.relevantPolicySections,
          createdBy: user.id,
          accountId: scenarioAccountId,
        }
      })

      // Save evaluator context as file if provided
      if (scenario.evaluatorContext) {
        const contextDir = path.join(process.cwd(), 'uploads', 'evaluator_context', newScenario.id)
        await mkdir(contextDir, { recursive: true })
        const contextPath = path.join(contextDir, 'context.txt')
        await writeFile(contextPath, scenario.evaluatorContext, 'utf-8')

        await prisma.scenario.update({
          where: { id: newScenario.id },
          data: { evaluatorContextPath: contextPath }
        })
      }

      created.push(scenario.title)
      existingTitles.add(normalizedTitle)
    }

    return apiSuccess({
      created: created.length,
      skipped: skipped.length,
      createdTitles: created,
      skippedTitles: skipped,
    }, created.length > 0 ? 201 : 200)
  } catch (error) {
    return handleApiError(error)
  }
}
