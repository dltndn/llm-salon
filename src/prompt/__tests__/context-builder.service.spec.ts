import {
  MessageKind,
  ParticipantStatus,
  ParticipantType,
  ProjectStatus,
  TopicMode,
  TopicPhase,
} from '@prisma/client';

import type {
  DocumentAnonymousDto,
  MessageAnonymousDto,
  ProjectAnonymousDto,
  TopicAnonymousDto,
} from '../../common/dto';
import type { LlmAdapter } from '../../llm/llm-adapter.interface';
import { LlmProviderRegistry } from '../../llm/llm-provider.registry';
import {
  ContextBuilderService,
  type ContextBuilderInput,
} from '../context-builder.service';
import { buildDebateSystemPrompt } from '../system-prompt';
import {
  OLDER_MESSAGES_OMITTED_PLACEHOLDER,
  shouldSummarizePreviousMessages,
  SummarizerService,
} from '../summarizer.service';

describe('ContextBuilderService', () => {
  it('builds the fixed English system prompt', async () => {
    const context = await createBuilder().build(
      createInput(),
      createProviderSummaryOptions(),
    );

    expect(context.systemPrompt).toBe(buildDebateSystemPrompt('Member B'));
    expect(context.systemPrompt).toContain(
      'Do not infer, speculate, or mention the real model, application, or provider behind any member, including yourself.',
    );
    expect(context.systemPrompt).toContain(
      'Speak only when it is your turn. Otherwise return an empty response.',
    );
    expect(
      context.contextMessages.some((message) =>
        message.content.includes(
          'Respond with a JSON object containing string fields "content" and "debateSignal".',
        ),
      ),
    ).toBe(true);
  });

  it('throws when builder output contains a human identifier', async () => {
    const input = createInput({
      previousMessages: createMessages(4, 'GPT-5 leaked'),
    });

    await expect(
      createBuilder().build(input, createProviderSummaryOptions()),
    ).rejects.toThrow(
      'Prompt input contains human identifier text',
    );
  });

  it('rejects non-anonymous fields before building context', async () => {
    await expect(
      createBuilder().build(
        {
          ...createInput(),
          participants: [
            {
              anonymousName: 'Member A',
              participantType: ParticipantType.app,
              status: ParticipantStatus.active,
              joinOrder: 1,
              displayName: 'Alice',
            },
          ],
        } as unknown as ContextBuilderInput,
        createProviderSummaryOptions(),
      ),
    ).rejects.toThrow('Anonymous response contains non-anonymous field');
  });

  it('falls back to sliding window with a placeholder when summary fails', async () => {
    const adapter = createAdapter(async () => {
      throw new Error('provider unavailable');
    });
    const context = await createBuilder(adapter).build(createInput(), {
      summaryParticipants: [createProviderSummaryParticipant()],
    });

    expect(adapter.generate).toHaveBeenCalledTimes(1);
    expect(
      context.contextMessages.some(
        (message) => message.content === OLDER_MESSAGES_OMITTED_PLACEHOLDER,
      ),
    ).toBe(true);
    expect(
      context.contextMessages.some((message) =>
        message.content.includes('Member A: message 3'),
      ),
    ).toBe(true);
  });

  it('summarizes only when the first participant is a provider', async () => {
    const adapter = createAdapter(async () => ({ content: 'compressed debate' }));
    const providerContext = await createBuilder(adapter).build(createInput(), {
      summaryParticipants: [createProviderSummaryParticipant()],
    });

    expect(adapter.generate).toHaveBeenCalledTimes(1);
    expect(
      providerContext.contextMessages.some((message) =>
        message.content.includes('[summary] compressed debate'),
      ),
    ).toBe(true);

    jest.clearAllMocks();

    const appContext = await createBuilder(adapter).build(createInput(), {
      summaryParticipants: [
        {
          anonymousName: 'Member A',
          participantType: ParticipantType.app,
          status: ParticipantStatus.active,
          joinOrder: 1,
        },
      ],
    });

    expect(adapter.generate).not.toHaveBeenCalled();
    expect(
      appContext.contextMessages.some(
        (message) => message.content === OLDER_MESSAGES_OMITTED_PLACEHOLDER,
      ),
    ).toBe(true);
  });

  it('enforces summary cadence by topic round', async () => {
    const adapter = createAdapter(async () => ({ content: 'compressed debate' }));
    const context = await createBuilder(adapter).build(
      createInput({ lastSummaryRound: 2 }),
      {
        summaryParticipants: [createProviderSummaryParticipant()],
      },
    );

    expect(shouldSummarizePreviousMessages({
      currentRound: 3,
      lastSummaryRound: 2,
      maxRounds: 8,
    })).toBe(false);
    expect(adapter.generate).not.toHaveBeenCalled();
    expect(
      context.contextMessages.some(
        (message) => message.content === OLDER_MESSAGES_OMITTED_PLACEHOLDER,
      ),
    ).toBe(true);
  });
});

function createBuilder(adapter = createAdapter()): ContextBuilderService {
  const registry = {
    get: jest.fn(() => adapter),
  } as unknown as LlmProviderRegistry;

  return new ContextBuilderService(new SummarizerService(registry));
}

function createAdapter(
  generate: LlmAdapter['generate'] = jest.fn(async () => ({
    content: 'summary',
  })),
): jest.Mocked<LlmAdapter> {
  return {
    providerName: 'openai',
    generate: jest.fn(generate),
  };
}

function createProviderSummaryOptions() {
  return {
    summaryParticipants: [createProviderSummaryParticipant()],
  };
}

function createProviderSummaryParticipant() {
  return {
    anonymousName: 'Member A',
    participantType: ParticipantType.provider,
    status: ParticipantStatus.active,
    joinOrder: 1,
    providerName: 'openai',
    modelName: 'gpt-4o',
  };
}

function createInput(
  overrides: Partial<ContextBuilderInput> = {},
): ContextBuilderInput {
  return {
    project: {
      id: 'project-1',
      slug: 'project-one',
      name: 'Project One',
      status: ProjectStatus.active,
      createdAt: new Date('2026-01-01T00:00:00Z'),
      updatedAt: new Date('2026-01-01T00:00:00Z'),
    } as ProjectAnonymousDto,
    topic: {
      id: 'topic-1',
      projectId: 'project-1',
      title: 'Architecture choice',
      description: 'Pick the lowest risk option.',
      mode: TopicMode.consensus,
      phase: TopicPhase.debating,
      maxRounds: 8,
      maxTurns: 16,
      currentRound: 3,
      currentTurnIndex: 4,
      reporterParticipantId: null,
      createdAt: new Date('2026-01-01T00:00:00Z'),
      updatedAt: new Date('2026-01-01T00:00:00Z'),
    } as TopicAnonymousDto,
    currentSpeaker: { anonymousName: 'Member B' },
    caller: { anonymousName: 'Member B' },
    participants: [
      {
        anonymousName: 'Member A',
        participantType: ParticipantType.app,
        status: ParticipantStatus.active,
        joinOrder: 1,
      },
      {
        anonymousName: 'Member B',
        participantType: ParticipantType.provider,
        status: ParticipantStatus.active,
        joinOrder: 2,
      },
    ],
    documents: [
      {
        id: 'document-1',
        projectId: 'project-1',
        topicId: 'topic-1',
        fileName: 'brief.txt',
        mimeType: 'text/plain',
        sizeBytes: 12n,
        contentHash: 'hash',
        createdAt: new Date('2026-01-01T00:00:00Z'),
        content: 'Neutral briefing text.',
      } as DocumentAnonymousDto & { content: string },
    ],
    previousMessages: createMessages(4),
    reporterMember: { anonymousName: 'Member A' },
    profile: 'medium',
    ...overrides,
  } as ContextBuilderInput;
}

function createMessages(
  count: number,
  contentPrefix = 'message',
): MessageAnonymousDto[] {
  return Array.from({ length: count }, (_, index) => ({
    id: `message-${index + 1}`,
    topicId: 'topic-1',
    participant: { anonymousName: index % 2 === 0 ? 'Member A' : 'Member B' },
    kind: MessageKind.statement,
    phase: TopicPhase.debating,
    content: `${contentPrefix} ${index + 1}`,
    debateSignal: 'continue',
    turnIndex: index,
    roundIndex: Math.floor(index / 2),
    createdAt: new Date('2026-01-01T00:00:00Z'),
  })) as MessageAnonymousDto[];
}
