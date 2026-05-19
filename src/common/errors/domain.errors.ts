export class DuplicateAppRegistrationError extends Error {
  constructor(clientName: string, modelName: string) {
    super(
      `App participant is already registered: ${clientName} / ${modelName}`,
    );
    this.name = 'DuplicateAppRegistrationError';
  }
}

export class ParticipantConflictError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ParticipantConflictError';
  }
}

export class RegistrationClosedError extends Error {
  constructor(projectSlug: string) {
    super(`Participant registration is closed for project: ${projectSlug}`);
    this.name = 'RegistrationClosedError';
  }
}

export class WrongTurnError extends Error {
  constructor(readonly currentMember: string | null) {
    super(
      currentMember
        ? `Wrong turn. Current participant: ${currentMember}`
        : 'Wrong turn. No active turn is available.',
    );
    this.name = 'WrongTurnError';
  }
}

export class PhaseTransitionError extends Error {
  constructor(from: string, to: string) {
    super(`Invalid topic phase transition: ${from} -> ${to}`);
    this.name = 'PhaseTransitionError';
  }
}

export class DocumentTooLargeError extends Error {
  constructor(profile: string, limit: string) {
    super(
      `The attached file exceeds the current context profile (${profile}) limit (${limit}). Please split it into smaller files or raise LLM_SALON_CONTEXT_PROFILE.`,
    );
    this.name = 'DocumentTooLargeError';
  }
}
