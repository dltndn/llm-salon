import {
  Participant,
  Prisma,
  ProjectStatus,
  TopicMode,
  TopicPhase,
} from '@prisma/client';

type StoredProject = {
  id: string;
  name: string;
  slug: string;
  status: ProjectStatus;
  createdAt: Date;
  updatedAt: Date;
};

type StoredTopic = {
  id: string;
  projectId: string;
  title: string;
  description: string | null;
  mode: TopicMode;
  phase: TopicPhase;
  maxRounds: number | null;
  maxTurns: number | null;
  currentRound: number;
  currentTurnIndex: number;
  reporterParticipantId: string | null;
  createdAt: Date;
  updatedAt: Date;
};

export class InMemoryPrisma {
  private projects: StoredProject[] = [];
  private topics: StoredTopic[] = [];
  private participants: Participant[] = [];
  private nextProjectId = 1;
  private nextTopicId = 1;

  seedParticipant(
    projectSlug: string,
    participant: Omit<Participant, 'projectId'>,
  ) {
    const project = this.projects.find((item) => item.slug === projectSlug);

    if (!project) {
      throw new Error(`Project not found in test store: ${projectSlug}`);
    }

    this.participants.push({
      ...participant,
      projectId: project.id,
    });
  }

  readonly project = {
    create: jest.fn(({ data }) => {
      if (this.projects.some((project) => project.slug === data.slug)) {
        throw new Prisma.PrismaClientKnownRequestError(
          'Unique constraint failed on the fields: (`slug`)',
          {
            clientVersion: 'test',
            code: 'P2002',
            meta: { target: ['slug'] },
          },
        );
      }

      const now = new Date();
      const project: StoredProject = {
        id: `project-${this.nextProjectId}`,
        name: data.name,
        slug: data.slug,
        status: data.status,
        createdAt: now,
        updatedAt: now,
      };

      this.nextProjectId += 1;
      this.projects.push(project);

      return Promise.resolve(project);
    }),
    findMany: jest.fn(() =>
      Promise.resolve(
        [...this.projects].reverse().map((project) => ({
          ...project,
          topics: this.topics.filter((topic) => topic.projectId === project.id),
        })),
      ),
    ),
    findUnique: jest.fn(({ where, include, select }) => {
      const project = this.projects.find((item) => item.slug === where.slug);

      if (!project) {
        return Promise.resolve(null);
      }

      if (select?.id) {
        return Promise.resolve({ id: project.id });
      }

      if (include) {
        return Promise.resolve({
          ...project,
          participants: this.participants.filter(
            (participant) => participant.projectId === project.id,
          ),
          topics: this.topics.filter((topic) => topic.projectId === project.id),
        });
      }

      return Promise.resolve(project);
    }),
  };

  readonly topic = {
    create: jest.fn(({ data }) => {
      const now = new Date();
      const topic: StoredTopic = {
        id: `topic-${this.nextTopicId}`,
        projectId: data.projectId,
        title: data.title,
        description: data.description ?? null,
        mode: data.mode,
        phase: data.phase,
        maxRounds: data.maxRounds ?? null,
        maxTurns: data.maxTurns ?? null,
        currentRound: 0,
        currentTurnIndex: 0,
        reporterParticipantId: null,
        createdAt: now,
        updatedAt: now,
      };

      this.nextTopicId += 1;
      this.topics.push(topic);

      return Promise.resolve(topic);
    }),
  };
}
