import {
  DebateSignal,
  Document,
  Message,
  Participant,
  ParticipantStatus,
  Prisma,
  ProjectStatus,
  Report,
  TopicMode,
  TopicPhase,
  Turn,
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
  version: number;
  reporterParticipantId: string | null;
  deletedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
};

export class InMemoryPrisma {
  private projects: StoredProject[] = [];
  private topics: StoredTopic[] = [];
  private participants: Participant[] = [];
  private documents: Document[] = [];
  private turns: Turn[] = [];
  private messages: (Message & {
    participant?: { anonymousName: string; displayName: string };
  })[] = [];
  private reports: Report[] = [];
  private nextProjectId = 1;
  private nextTopicId = 1;
  private nextParticipantId = 1;
  private nextDocumentId = 1;
  private nextTurnId = 1;
  private nextMessageId = 1;
  private nextReportId = 1;

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

  seedMessage(input: {
    topicId: string;
    participantId: string;
    kind: Message['kind'];
    phase: Message['phase'];
    content: string;
    debateSignal?: DebateSignal;
    turnIndex?: number;
    roundIndex?: number;
  }) {
    const topic = this.topics.find((item) => item.id === input.topicId);

    if (!topic) {
      throw new Error(`Topic not found in test store: ${input.topicId}`);
    }

    this.messages.push({
      id: uuid('60000000', this.nextMessageId),
      projectId: topic.projectId,
      topicId: input.topicId,
      participantId: input.participantId,
      kind: input.kind,
      turnIndex: input.turnIndex ?? 0,
      roundIndex: input.roundIndex ?? 0,
      phase: input.phase,
      content: input.content,
      debateSignal: input.debateSignal ?? DebateSignal.Continue,
      createdAt: new Date(),
    });
    this.nextMessageId += 1;
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
        id: uuid('10000000', this.nextProjectId),
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
      const project = this.projects.find(
        (item) => item.slug === where.slug || item.id === where.id,
      );

      if (!project) {
        return Promise.resolve(null);
      }

      if (select) {
        return Promise.resolve(pickSelected(project, select));
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
        id: uuid('20000000', this.nextTopicId),
        projectId: data.projectId,
        title: data.title,
        description: data.description ?? null,
        mode: data.mode,
        phase: data.phase,
        maxRounds: data.maxRounds ?? null,
        maxTurns: data.maxTurns ?? null,
        currentRound: 0,
        currentTurnIndex: 0,
        version: data.version ?? 0,
        reporterParticipantId: null,
        deletedAt: null,
        createdAt: now,
        updatedAt: now,
      };

      this.nextTopicId += 1;
      this.topics.push(topic);

      return Promise.resolve(topic);
    }),
    findFirst: jest.fn(({ where, select }) => {
      const topic = this.topics.find(
        (item) =>
          (!where.id || item.id === where.id) &&
          (!where.projectId || item.projectId === where.projectId) &&
          (!where.phase ||
            (where.phase.in
              ? where.phase.in.includes(item.phase)
              : item.phase === where.phase)),
      );

      return Promise.resolve(
        topic ? (select ? pickSelected(topic, select) : { ...topic }) : null,
      );
    }),
    update: jest.fn(({ where, data }) => {
      const index = this.topics.findIndex((topic) => topic.id === where.id);
      this.topics[index] = {
        ...this.topics[index],
        ...applyTopicUpdateData(this.topics[index], data),
        updatedAt: new Date(),
      };

      return Promise.resolve({ ...this.topics[index] });
    }),
  };

  readonly participant = {
    aggregate: jest.fn(({ where }) => {
      const maxJoinOrder = Math.max(
        0,
        ...this.participants
          .filter((participant) => participant.projectId === where.projectId)
          .map((participant) => participant.joinOrder),
      );

      return Promise.resolve({ _max: { joinOrder: maxJoinOrder || null } });
    }),
    create: jest.fn(({ data }) => {
      const now = new Date();
      const participant: Participant = {
        id: uuid('30000000', this.nextParticipantId),
        projectId: data.projectId,
        displayName: data.displayName,
        anonymousName: data.anonymousName,
        participantType: data.participantType,
        providerName: data.providerName ?? null,
        modelName: data.modelName,
        clientName: data.clientName ?? null,
        status: data.status,
        joinOrder: data.joinOrder,
        joinedAt: now,
        createdAt: now,
        updatedAt: now,
      };

      this.nextParticipantId += 1;
      this.participants.push(participant);
      return Promise.resolve({ ...participant });
    }),
    findFirst: jest.fn(({ where, select, orderBy }) => {
      const participants = this.filterParticipants(where).sort((left, right) =>
        orderBy?.joinOrder === 'asc'
          ? left.joinOrder - right.joinOrder
          : right.joinOrder - left.joinOrder,
      );
      const participant = participants[0] ?? null;

      return Promise.resolve(
        participant
          ? select
            ? pickSelected(participant, select)
            : { ...participant }
          : null,
      );
    }),
    findMany: jest.fn(({ where, orderBy, select } = {}) => {
      const participants = this.filterParticipants(where).sort((left, right) =>
        orderBy?.joinOrder === 'asc'
          ? left.joinOrder - right.joinOrder
          : left.joinOrder - right.joinOrder,
      );

      return Promise.resolve(
        participants.map((participant) =>
          select ? pickSelected(participant, select) : { ...participant },
        ),
      );
    }),
    updateMany: jest.fn(({ where, data }) => {
      let count = 0;
      this.participants = this.participants.map((participant) => {
        if (this.filterParticipants(where).some((item) => item.id === participant.id)) {
          count += 1;
          return { ...participant, ...data, updatedAt: new Date() };
        }

        return participant;
      });

      return Promise.resolve({ count });
    }),
  };

  readonly document = {
    create: jest.fn(({ data }) => {
      const document: Document = {
        id: uuid('40000000', this.nextDocumentId),
        projectId: data.projectId,
        topicId: data.topicId ?? null,
        fileName: data.fileName,
        filePath: data.filePath,
        mimeType: data.mimeType,
        sizeBytes: BigInt(data.sizeBytes),
        contentHash: data.contentHash,
        createdAt: new Date(),
      };

      this.nextDocumentId += 1;
      this.documents.push(document);
      return Promise.resolve({ ...document });
    }),
    findMany: jest.fn(({ where }) =>
      Promise.resolve(
        this.documents.filter(
          (document) =>
            document.projectId === where.projectId &&
            (where.topicId === undefined || document.topicId === where.topicId) &&
            (!where.OR ||
              where.OR.some(
                (condition: { topicId: string | null }) =>
                  document.topicId === condition.topicId,
              )),
        ),
      ),
    ),
  };

  readonly turn = {
    create: jest.fn(({ data }) => {
      const turn: Turn = {
        id: uuid('50000000', this.nextTurnId),
        projectId: data.projectId,
        topicId: data.topicId,
        currentParticipantId: data.currentParticipantId ?? null,
        turnIndex: data.turnIndex,
        roundIndex: data.roundIndex,
        phase: data.phase,
        status: data.status,
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      this.nextTurnId += 1;
      this.turns.push(turn);
      return Promise.resolve({ ...turn });
    }),
    findFirst: jest.fn(({ where, orderBy, select, include }) => {
      const turns = this.turns
        .filter((turn) =>
          Object.entries(where).every(
            ([key, value]) => turn[key as keyof Turn] === value,
          ),
        )
        .sort((left, right) =>
          orderBy?.turnIndex === 'desc'
            ? right.turnIndex - left.turnIndex
            : left.turnIndex - right.turnIndex,
        );
      const turn = turns[0] ?? null;

      return Promise.resolve(this.serializeTurn(turn, select, include));
    }),
    findUnique: jest.fn(({ where, include }) => {
      const turn = this.turns.find((item) => item.id === where.id) ?? null;
      return Promise.resolve(this.serializeTurn(turn, undefined, include));
    }),
    findMany: jest.fn(({ where, select }) => {
      const turns = this.turns.filter(
        (turn) =>
          (!where?.topicId || turn.topicId === where.topicId) &&
          (!where?.currentParticipantId?.in ||
            where.currentParticipantId.in.includes(
              turn.currentParticipantId,
            )) &&
          (!where?.status?.not || turn.status !== where.status.not),
      );

      return Promise.resolve(
        turns.map((turn) => (select ? pickSelected(turn, select) : { ...turn })),
      );
    }),
    update: jest.fn(({ where, data }) => {
      const index = this.turns.findIndex((turn) => turn.id === where.id);
      this.turns[index] = {
        ...this.turns[index],
        ...data,
        updatedAt: new Date(),
      };

      return Promise.resolve({ ...this.turns[index] });
    }),
  };

  readonly message = {
    create: jest.fn(({ data }) => {
      const participant = this.participants.find(
        (item) => item.id === data.participantId,
      );
      const message = {
        id: uuid('60000000', this.nextMessageId),
        projectId: data.projectId,
        topicId: data.topicId,
        participantId: data.participantId,
        kind: data.kind,
        turnIndex: data.turnIndex,
        roundIndex: data.roundIndex,
        phase: data.phase,
        content: data.content,
        debateSignal: data.debateSignal ?? DebateSignal.Continue,
        createdAt: new Date(),
        participant: participant
          ? {
              anonymousName: participant.anonymousName,
              displayName: participant.displayName,
            }
          : undefined,
      };

      this.nextMessageId += 1;
      this.messages.push(message);
      return Promise.resolve({ ...message });
    }),
    findFirst: jest.fn(({ where, select }) => {
      const message =
        this.messages.find(
          (message) =>
            message.topicId === where.topicId &&
            (!where.participantId ||
              message.participantId === where.participantId) &&
            (!where.kind || message.kind === where.kind),
        ) ?? null;

      return Promise.resolve(
        message ? (select ? pickSelected(message, select) : { ...message }) : null,
      );
    }),
    findMany: jest.fn(({ where, orderBy, select }) => {
      const messages = this.messages
        .filter(
          (message) =>
            message.topicId === where.topicId &&
            (!where.kind || message.kind === where.kind) &&
            (!where.phase || message.phase === where.phase) &&
            (!where.participantId?.in ||
              where.participantId.in.includes(message.participantId)),
        )
        .sort((left, right) =>
          orderBy?.turnIndex === 'asc'
            ? left.turnIndex - right.turnIndex
            : 0,
        );

      return Promise.resolve(
        messages.map((message) =>
          select ? pickSelected(message, select) : { ...message },
        ),
      );
    }),
  };

  readonly report = {
    findFirst: jest.fn(({ where }) =>
      Promise.resolve(
        this.reports.find(
          (report) =>
            report.projectId === where.projectId && report.topicId === where.topicId,
        ) ?? null,
      ),
    ),
    findMany: jest.fn(({ where, take }) => {
      const matches = this.reports.filter(
        (report) =>
          report.projectId === where.projectId && report.topicId === where.topicId,
      );

      return Promise.resolve(
        typeof take === 'number' ? matches.slice(0, take) : matches,
      );
    }),
    create: jest.fn(({ data }) => {
      const report: Report = {
        id: uuid('70000000', this.nextReportId),
        projectId: data.projectId,
        topicId: data.topicId,
        reporterParticipantId: data.reporterParticipantId,
        status: data.status,
        draftContent: data.draftContent ?? null,
        finalContent: data.finalContent ?? null,
        filePath: data.filePath ?? null,
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      this.nextReportId += 1;
      this.reports.push(report);
      return Promise.resolve({ ...report });
    }),
    update: jest.fn(({ where, data }) => {
      const index = this.reports.findIndex((report) => report.id === where.id);
      this.reports[index] = {
        ...this.reports[index],
        ...data,
        updatedAt: new Date(),
      };

      return Promise.resolve({ ...this.reports[index] });
    }),
  };

  $transaction = jest.fn((callback) => callback(this));
  $queryRaw = jest.fn(() => Promise.resolve([]));

  private filterParticipants(where?: {
    projectId?: string;
    id?: string;
    status?: ParticipantStatus | { in: ParticipantStatus[] };
  }) {
    return this.participants.filter(
      (participant) =>
        (!where?.projectId || participant.projectId === where.projectId) &&
        (!where?.id || participant.id === where.id) &&
        (!where?.status ||
          (typeof where.status === 'object'
            ? where.status.in.includes(participant.status)
            : participant.status === where.status)),
    );
  }

  private serializeTurn(
    turn: Turn | null,
    select?: Record<string, boolean>,
    include?: { currentParticipant?: unknown },
  ) {
    if (!turn) {
      return null;
    }

    if (select) {
      return pickSelected(turn, select);
    }

    return {
      ...turn,
      ...(include?.currentParticipant
        ? { currentParticipant: this.participantFor(turn.currentParticipantId) }
        : {}),
    };
  }

  private participantFor(id: string | null) {
    const participant = this.participants.find((item) => item.id === id);
    return participant
      ? {
          id: participant.id,
          anonymousName: participant.anonymousName,
          displayName: participant.displayName,
        }
      : null;
  }
}

function uuid(prefix: string, value: number): string {
  return `${prefix}-0000-4000-8000-${String(value).padStart(12, '0')}`;
}

function pickSelected<T extends Record<string, unknown>>(
  value: T,
  select: Record<string, boolean>,
) {
  return Object.fromEntries(
    Object.keys(select)
      .filter((key) => select[key])
      .map((key) => [key, value[key]]),
  );
}

function applyTopicUpdateData(
  topic: StoredTopic,
  data: Omit<Partial<StoredTopic>, 'version'> & {
    version?: number | { increment: number };
  },
): Partial<StoredTopic> {
  const { version, ...rest } = data;

  return {
    ...rest,
    ...(typeof version === 'object'
      ? { version: topic.version + version.increment }
      : version !== undefined
        ? { version }
        : {}),
  };
}
