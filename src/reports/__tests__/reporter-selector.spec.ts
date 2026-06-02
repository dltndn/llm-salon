import {
  ParticipantStatus,
  ParticipantType,
} from '@prisma/client';

import { selectReporterParticipantId } from '../reporter-selector';

describe('selectReporterParticipantId', () => {
  it('selects the active provider with the lowest join order', () => {
    const reporterId = selectReporterParticipantId([
      {
        id: 'app-1',
        joinOrder: 1,
        participantType: ParticipantType.app,
        status: ParticipantStatus.active,
      },
      {
        id: 'provider-2',
        joinOrder: 3,
        participantType: ParticipantType.provider,
        status: ParticipantStatus.active,
      },
      {
        id: 'provider-1',
        joinOrder: 2,
        participantType: ParticipantType.provider,
        status: ParticipantStatus.active,
      },
    ]);

    expect(reporterId).toBe('provider-1');
  });

  it('falls back to the current turn holder when no active provider exists', () => {
    const reporterId = selectReporterParticipantId(
      [
        {
          id: 'app-1',
          joinOrder: 1,
          participantType: ParticipantType.app,
          status: ParticipantStatus.active,
        },
        {
          id: 'provider-inactive',
          joinOrder: 2,
          participantType: ParticipantType.provider,
          status: ParticipantStatus.inactive,
        },
      ],
      'app-1',
    );

    expect(reporterId).toBe('app-1');
  });

  it('returns null when no provider or fallback is available', () => {
    const reporterId = selectReporterParticipantId([
      {
        id: 'app-1',
        joinOrder: 1,
        participantType: ParticipantType.app,
        status: ParticipantStatus.active,
      },
      {
        id: 'provider-inactive',
        joinOrder: 2,
        participantType: ParticipantType.provider,
        status: ParticipantStatus.inactive,
      },
    ]);

    expect(reporterId).toBeNull();
  });
});
