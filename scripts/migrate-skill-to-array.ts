// scripts/migrate-skill-to-array.ts
//
// IMPORTANT: Transaction Wrapping for Migration Scripts
// -----------------------------------------------------
// This script updates multiple records. In production, wrap bulk operations
// in a Prisma transaction to ensure atomicity:
//
//   await prisma.$transaction(async (tx) => {
//     for (const s of scenarios) {
//       await tx.scenario.update({ ... });
//     }
//   });
//
// Benefits:
// - All-or-nothing: If any update fails, all changes roll back
// - No partial state: Database never left in inconsistent state
// - Safe retries: Can re-run the script without duplicate updates
//
// Current implementation uses individual updates for better progress logging
// and error isolation during development. For production migrations, prefer
// transaction wrapping.

import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  console.log('=== Migrating skill to skills array ===\n');

  const scenarios = await prisma.scenario.findMany({
    select: { id: true, title: true, skill: true, skills: true },
  });

  let migrated = 0;
  let skipped = 0;

  for (const s of scenarios) {
    if (s.skills && s.skills.length > 0) {
      console.log('⊘ ' + s.title.substring(0, 40) + '... already has skills array');
      skipped++;
      continue;
    }

    if (s.skill) {
      await prisma.scenario.update({
        where: { id: s.id },
        data: { skills: [s.skill] },
      });
      console.log('✓ ' + s.title.substring(0, 40) + '... → skills=[' + s.skill + ']');
      migrated++;
    } else {
      console.log('⚠ ' + s.title.substring(0, 40) + '... has no skill to migrate');
    }
  }

  console.log('\nMigrated: ' + migrated);
  console.log('Skipped: ' + skipped);

  const withSkills = await prisma.scenario.count({ where: { skills: { isEmpty: false } } });
  const total = await prisma.scenario.count();
  console.log('\nVerification: ' + withSkills + '/' + total + ' have skills array');

  if (withSkills < total) {
    console.error('WARNING: Some scenarios have empty skills array');
  }

  await prisma.$disconnect();
}

main().catch(console.error);
