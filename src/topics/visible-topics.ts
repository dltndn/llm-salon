import { Prisma } from '@prisma/client';

export const VISIBLE_TOPIC_WHERE: Prisma.TopicWhereInput = {
  deletedAt: null,
};
