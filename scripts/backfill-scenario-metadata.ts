// scripts/backfill-scenario-metadata.ts
import { PrismaClient } from '@prisma/client';
import { detectSkill, inferDifficulty, estimateTime, isValidSkill } from '../src/lib/skills';

const prisma = new PrismaClient();

async function main() {
  console.log('=== Backfilling Scenario Metadata ===\n');

  const scenarios = await prisma.scenario.findMany({
    select: {
      id: true,
      title: true,
      description: true,
      category: true,
      skill: true,
      difficulty: true,
      estimatedTime: true,
    },
  });

  console.log(`Found ${scenarios.length} scenarios to process\n`);

  let updated = 0;
  let skipped = 0;
  let errors = 0;

  for (const s of scenarios) {
    const detectedSkill = detectSkill(s.title, s.description);
    const detectedDifficulty = inferDifficulty(s.title, s.category);
    const detectedTime = estimateTime(s.title, s.description);

    const needsUpdate =
      !s.skill ||
      !isValidSkill(s.skill) ||
      !s.difficulty ||
      !['beginner', 'intermediate', 'advanced'].includes(s.difficulty) ||
      !s.estimatedTime;

    if (!needsUpdate) {
      skipped++;
      continue;
    }

    try {
      await prisma.scenario.update({
        where: { id: s.id },
        data: {
          skill: s.skill && isValidSkill(s.skill) ? s.skill : detectedSkill,
          difficulty: s.difficulty || detectedDifficulty,
          estimatedTime: s.estimatedTime || detectedTime,
        },
      });
      console.log(`✓ ${s.title.substring(0, 50)}... → skill=${detectedSkill}, difficulty=${detectedDifficulty}, time=${detectedTime}`);
      updated++;
    } catch (e) {
      console.error(`✗ Failed: ${s.title} - ${e}`);
      errors++;
    }
  }

  console.log('\n=== Results ===');
  console.log(`Updated: ${updated}`);
  console.log(`Skipped (already valid): ${skipped}`);
  console.log(`Errors: ${errors}`);

  if (errors > 0) {
    process.exit(1);
  }

  await prisma.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
