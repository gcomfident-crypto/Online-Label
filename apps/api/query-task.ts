import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';

async function main() {
  const client = new PrismaClient({ adapter: new PrismaPg('postgresql://labelhub:labelhub_password@localhost:5432/labelhub?schema=public') });
  const tasks = await client.task.findMany({
    where: { status: 'PUBLISHED' },
    include: {
      assignments: { select: { id: true, assigneeId: true, status: true } },
      items: { select: { id: true, status: true, sortOrder: true } },
      createdBy: { select: { id: true, name: true } },
    },
    orderBy: { updatedAt: 'desc' },
  });
  console.log('count', tasks.length);
  for (const [i, t] of tasks.entries()) {
    const display = `T-${String(i + 1).padStart(4, '0')}`;
    const deadline = t.deadline ? t.deadline.toISOString() : null;
    const activeAssignments = t.assignments.filter((a) => a.status !== 'CANCELLED');
    const claimedByMe = activeAssignments.some((a) => a.assigneeId === 'user_labeler_li_lei');
    const unassignedCount = t.items.filter((i) => i.status === 'UNASSIGNED').length;
    const assignedCount = activeAssignments.length;
    const quotaRemaining = t.quota === null ? unassignedCount : Math.max(0, t.quota - assignedCount);
    const remainingCount = Math.max(0, Math.min(unassignedCount, quotaRemaining));
    const isExpired = deadline !== null && new Date(deadline).getTime() <= Date.now();
    const status = isExpired ? 'expired' : claimedByMe ? 'claimed' : remainingCount <= 0 ? 'full' : 'available';

    console.log(`${display}, id=${t.id}, title=${t.title}, updated=${t.updatedAt.toISOString()}, created=${t.createdAt.toISOString()}, deadline=${deadline}, isExpired=${isExpired}, remaining=${remainingCount}, assigned=${assignedCount}, quota=${t.quota}, claimedByMe=${claimedByMe}, claimStatus=${status}`);
  }
  await client.$disconnect();
}

void main().catch(async (error) => {
  console.error(error);
  process.exitCode = 1;
});
