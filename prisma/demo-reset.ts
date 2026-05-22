import 'dotenv/config';

import { createPrismaClient, seed } from './seed.ts';

export async function resetDemoData(): Promise<void> {
  const prisma = createPrismaClient();

  try {
    await prisma.exportJob.deleteMany();
    await prisma.auditLog.deleteMany();
    await prisma.aiReviewJob.deleteMany();
    await prisma.reviewRecord.deleteMany();
    await prisma.submission.deleteMany();
    await prisma.draft.deleteMany();
    await prisma.assignment.deleteMany();
    await prisma.taskItem.deleteMany();
    await prisma.reviewRule.deleteMany();
    await prisma.task.deleteMany();
    await prisma.taskTemplate.deleteMany();
    await prisma.user.deleteMany();

    await seed(prisma);
    console.log('LabelHub 演示数据已重置。');
  } finally {
    await prisma.$disconnect();
  }
}

resetDemoData().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
