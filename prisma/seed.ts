import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

async function main() {
  console.log('Seeding database...')

  // Create test account if it doesn't exist
  const account = await prisma.account.upsert({
    where: { id: '00000000-0000-0000-0000-000000000010' },
    update: {},
    create: {
      id: '00000000-0000-0000-0000-000000000010',
      name: 'Test Organization',
    },
  })
  console.log(`Account: ${account.name}`)

  // Create external API account for service-to-service integrations
  const externalAccount = await prisma.account.upsert({
    where: { id: '00000000-0000-0000-0000-000000000020' },
    update: {},
    create: {
      id: '00000000-0000-0000-0000-000000000020',
      name: 'External API',
    },
  })
  console.log(`External Account: ${externalAccount.name}`)

  // Create system user for external API (acts as supervisor for external assignments)
  const externalSystemUser = await prisma.user.upsert({
    where: { id: '00000000-0000-0000-0000-000000000099' },
    update: {},
    create: {
      id: '00000000-0000-0000-0000-000000000099',
      externalId: 'external-api-system',
      displayName: 'External API System',
      email: 'system@external-api.local',
      role: 'supervisor',
    },
  })
  console.log(`External System User: ${externalSystemUser.displayName}`)

  // Create test supervisor
  const supervisor = await prisma.user.upsert({
    where: { id: '00000000-0000-0000-0000-000000000001' },
    update: {},
    create: {
      id: '00000000-0000-0000-0000-000000000001',
      externalId: 'test-supervisor-001',
      displayName: 'Test Supervisor',
      email: 'supervisor@test.com',
      role: 'supervisor',
    },
  })
  console.log(`Supervisor: ${supervisor.displayName}`)

  // Create multiple test counselors
  const counselors = [
    {
      id: '32d86730-7a31-4a30-9b53-e6c238706bf6',
      externalId: 'test-counselor-001',
      displayName: 'Test Counselor',
      email: 'counselor@test.com',
    },
    {
      id: '00000000-0000-0000-0000-000000000002',
      externalId: 'test-counselor-002',
      displayName: 'Sarah Johnson',
      email: 'sarah.johnson@test.com',
    },
    {
      id: '00000000-0000-0000-0000-000000000003',
      externalId: 'test-counselor-003',
      displayName: 'Michael Chen',
      email: 'michael.chen@test.com',
    },
    {
      id: '00000000-0000-0000-0000-000000000004',
      externalId: 'test-counselor-004',
      displayName: 'Emily Rodriguez',
      email: 'emily.rodriguez@test.com',
    },
    {
      id: '00000000-0000-0000-0000-000000000005',
      externalId: 'test-counselor-005',
      displayName: 'David Kim',
      email: 'david.kim@test.com',
    },
  ]

  for (const counselor of counselors) {
    const user = await prisma.user.upsert({
      where: { id: counselor.id },
      update: {},
      create: {
        ...counselor,
        role: 'counselor',
      },
    })
    console.log(`Counselor: ${user.displayName}`)
  }

  // Create sample scenarios if none exist
  const scenarioCount = await prisma.scenario.count()
  if (scenarioCount === 0) {
    const scenarios = [
      {
        title: 'Caller Expressing Suicidal Ideation',
        description: 'Practice responding to a caller who expresses thoughts of suicide',
        prompt: 'You are a caller to a crisis hotline. You are feeling hopeless and have been thinking about ending your life. You have access to pills at home.',
        mode: 'phone' as const,
        category: 'onboarding' as const,
        accountId: account.id,
        createdBy: supervisor.id,
      },
      {
        title: 'Anxious Teenager',
        description: 'Handle a call from a teenager experiencing severe anxiety',
        prompt: 'You are a 16-year-old caller experiencing your first panic attack. You feel like you cannot breathe and think you might be dying.',
        mode: 'phone' as const,
        category: 'onboarding' as const,
        accountId: account.id,
        createdBy: supervisor.id,
      },
      {
        title: 'Domestic Violence Disclosure',
        description: 'Respond appropriately to someone disclosing domestic violence',
        prompt: 'You are calling because you had a fight with your partner last night that got physical. You are scared but unsure if you should leave.',
        mode: 'chat' as const,
        category: 'advanced' as const,
        accountId: account.id,
        createdBy: supervisor.id,
      },
      {
        title: 'Grief and Loss',
        description: 'Support a caller dealing with recent loss',
        prompt: 'You recently lost your mother to cancer. You are calling because you feel overwhelmed by grief and do not know how to cope.',
        mode: 'phone' as const,
        category: 'refresher' as const,
        accountId: account.id,
        createdBy: supervisor.id,
      },
    ]

    for (const scenario of scenarios) {
      const created = await prisma.scenario.create({ data: scenario })
      console.log(`Scenario: ${created.title}`)
    }
  }

  console.log('Seeding complete!')
}

main()
  .catch((e) => {
    console.error(e)
    process.exit(1)
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
