import { prisma } from '@/lib/prisma';

export type NoticePollOptionInput = { label: string };

export function isNoticeVisible(notice: {
  isActive: boolean;
  expiresAt: Date | null;
}): boolean {
  if (!notice.isActive) return false;
  if (notice.expiresAt && notice.expiresAt.getTime() <= Date.now()) return false;
  return true;
}

export async function listActiveNoticesForUser(userId: string) {
  const now = new Date();
  const notices = await prisma.systemNotice.findMany({
    where: {
      isActive: true,
      OR: [{ expiresAt: null }, { expiresAt: { gt: now } }],
    },
    orderBy: { publishedAt: 'desc' },
    include: {
      options: { orderBy: { sortOrder: 'asc' } },
      votes: {
        select: { optionId: true, userId: true },
      },
    },
  });

  return notices.map((n) => {
    const totalVotes = n.votes.length;
    const myVote = n.votes.find((v) => v.userId === userId);
    const options = n.options.map((o) => {
      const count = n.votes.filter((v) => v.optionId === o.id).length;
      const pct = totalVotes > 0 ? Math.round((count / totalVotes) * 1000) / 10 : 0;
      return { id: o.id, label: o.label, count, pct };
    });
    return {
      id: n.id,
      title: n.title,
      body: n.body,
      hasPoll: n.hasPoll,
      publishedAt: n.publishedAt.toISOString(),
      expiresAt: n.expiresAt?.toISOString() ?? null,
      options,
      totalVotes,
      myOptionId: myVote?.optionId ?? null,
      pollClosed: n.expiresAt ? n.expiresAt.getTime() <= Date.now() : false,
    };
  });
}

export async function createNoticeWithPoll(input: {
  title: string;
  body: string;
  hasPoll: boolean;
  expiresAt: Date | null;
  options: NoticePollOptionInput[];
  createdById: string;
}) {
  const title = input.title.trim();
  const body = input.body.trim();
  if (!title) throw new Error('Title is required.');
  if (!body) throw new Error('Message is required.');
  if (input.hasPoll && input.options.filter((o) => o.label.trim()).length < 2) {
    throw new Error('A poll needs at least two options.');
  }

  return prisma.systemNotice.create({
    data: {
      title,
      body,
      hasPoll: input.hasPoll,
      expiresAt: input.expiresAt,
      createdById: input.createdById,
      options: input.hasPoll
        ? {
            create: input.options
              .map((o) => o.label.trim())
              .filter(Boolean)
              .map((label, i) => ({ label, sortOrder: i })),
          }
        : undefined,
    },
    include: { options: true },
  });
}

export async function castPollVote(noticeId: string, optionId: string, userId: string) {
  const notice = await prisma.systemNotice.findUnique({
    where: { id: noticeId },
    include: { options: true },
  });
  if (!notice || !isNoticeVisible(notice)) {
    throw new Error('This notice is not available.');
  }
  if (!notice.hasPoll) throw new Error('This notice has no poll.');
  if (!notice.options.some((o) => o.id === optionId)) {
    throw new Error('Invalid poll option.');
  }

  await prisma.systemPollVote.upsert({
    where: { noticeId_userId: { noticeId, userId } },
    create: { noticeId, optionId, userId },
    update: { optionId },
  });
}
