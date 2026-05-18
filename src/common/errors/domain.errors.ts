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
