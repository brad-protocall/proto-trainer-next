import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

async function main() {
  console.log('Seeding database...')

  // Create supervisor user (default user for getCurrentUser)
  const supervisor = await prisma.user.upsert({
    where: { id: '00000000-0000-0000-0000-000000000001' },
    update: {},
    create: {
      id: '00000000-0000-0000-0000-000000000001',
      externalId: 'supervisor-1',
      displayName: 'Sarah Supervisor',
      email: 'sarah@protocall.example',
      role: 'supervisor',
    },
  })
  console.log(`Created supervisor: ${supervisor.displayName} (${supervisor.id})`)

  // Create counselor users
  const counselor1 = await prisma.user.upsert({
    where: { id: '00000000-0000-0000-0000-000000000002' },
    update: {},
    create: {
      id: '00000000-0000-0000-0000-000000000002',
      externalId: 'counselor-1',
      displayName: 'Chris Counselor',
      email: 'chris@protocall.example',
      role: 'counselor',
    },
  })
  console.log(`Created counselor: ${counselor1.displayName} (${counselor1.id})`)

  const counselor2 = await prisma.user.upsert({
    where: { id: '00000000-0000-0000-0000-000000000003' },
    update: {},
    create: {
      id: '00000000-0000-0000-0000-000000000003',
      externalId: 'counselor-2',
      displayName: 'Casey Counselor',
      email: 'casey@protocall.example',
      role: 'counselor',
    },
  })
  console.log(`Created counselor: ${counselor2.displayName} (${counselor2.id})`)

  // Create an account
  const account = await prisma.account.upsert({
    where: { id: '00000000-0000-0000-0000-000000000010' },
    update: {},
    create: {
      id: '00000000-0000-0000-0000-000000000010',
      name: 'Protocall Training Center',
    },
  })
  console.log(`Created account: ${account.name} (${account.id})`)

  // Create a sample scenario
  const scenario = await prisma.scenario.upsert({
    where: { id: '00000000-0000-0000-0000-000000000020' },
    update: {},
    create: {
      id: '00000000-0000-0000-0000-000000000020',
      title: 'Suicidal Caller - Initial Assessment',
      description: 'A caller expressing suicidal thoughts. Practice initial assessment and safety planning.',
      prompt: `You are a caller named Alex who is experiencing suicidal thoughts. You are a 35-year-old who has been struggling with depression and recently lost your job. You called the crisis line because you had thoughts of ending your life, though you haven't made a specific plan yet.

Your emotional state:
- Feeling hopeless about the future
- Experiencing shame about losing your job
- Isolated from friends and family
- Haven't slept well in weeks

Stay in character throughout the conversation. Respond naturally to the counselor's questions and techniques. If the counselor demonstrates good active listening and empathy, gradually open up more. If they rush or seem dismissive, become more guarded.`,
      mode: 'phone',
      category: 'onboarding',
      createdBy: supervisor.id,
      accountId: account.id,
    },
  })
  console.log(`Created scenario: ${scenario.title} (${scenario.id})`)

  console.log('\nSeed completed!')
  console.log('Summary:')
  console.log(`  - 1 supervisor: ${supervisor.displayName}`)
  console.log(`  - 2 counselors: ${counselor1.displayName}, ${counselor2.displayName}`)
  console.log(`  - 1 account: ${account.name}`)
  console.log(`  - 1 sample scenario: ${scenario.title}`)
}

main()
  .catch((e) => {
    console.error('Error seeding database:', e)
    process.exit(1)
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
