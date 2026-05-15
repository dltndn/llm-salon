import {
  ParticipantType,
  Prisma,
  PrismaClient,
} from '@prisma/client';

const describeIfDatabase =
  process.env.DATABASE_URL === undefined ||
  process.env.LLM_SALON_RUN_DB_TESTS !== '1'
    ? describe.skip
    : describe;

describeIfDatabase('participant database constraints', () => {
  const prisma = new PrismaClient();

  beforeAll(async () => {
    await prisma.$connect();
  });

  afterAll(async () => {
    await prisma.project.deleteMany({
      where: { slug: { startsWith: 'unique-constraint-test-' } },
    });
    await prisma.$disconnect();
  });

  it('rejects duplicate anonymous names within a project', async () => {
    const project = await prisma.project.create({
      data: {
        name: 'Unique Constraint Test',
        slug: `unique-constraint-test-${Date.now()}`,
      },
    });

    await prisma.participant.create({
      data: {
        projectId: project.id,
        displayName: 'Client / Model 1',
        anonymousName: 'Member A',
        participantType: ParticipantType.app,
        clientName: 'Client',
        modelName: 'Model 1',
        joinOrder: 1,
      },
    });

    await expect(
      prisma.participant.create({
        data: {
          projectId: project.id,
          displayName: 'Other / Model 2',
          anonymousName: 'Member A',
          participantType: ParticipantType.app,
          clientName: 'Other',
          modelName: 'Model 2',
          joinOrder: 2,
        },
      }),
    ).rejects.toMatchObject<Partial<Prisma.PrismaClientKnownRequestError>>({
      code: 'P2002',
    });
  });
});
