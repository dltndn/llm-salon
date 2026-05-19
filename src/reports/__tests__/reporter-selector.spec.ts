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

  it('ignores inactive providers and app participants', () => {
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
