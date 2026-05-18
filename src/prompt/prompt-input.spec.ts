import type { ParticipantHumanDto, ParticipantAnonymousDto } from '../common/dto';
import { createPromptBuilderInput } from './prompt-input';

describe('prompt input anonymization boundary', () => {
  it('accepts anonymous DTO inputs', () => {
    const participant: ParticipantAnonymousDto = {
      anonymousName: 'Member A',
    } as ParticipantAnonymousDto;

    expect(createPromptBuilderInput(participant)).toBe(participant);
  });

  it('rejects human identifiers at runtime', () => {
    expect(() =>
      createPromptBuilderInput({
        anonymousName: 'Member A',
        modelName: 'GPT-5',
      } as ParticipantAnonymousDto & { modelName: string }),
    ).toThrow('$.modelName');
  });

  it('rejects provider and model names in allowed string fields', () => {
    expect(() =>
      createPromptBuilderInput({
        anonymousName: 'GPT-5',
      } as ParticipantAnonymousDto),
    ).toThrow('$.anonymousName');
  });
});

declare function acceptsPromptInput(
  input: Parameters<typeof createPromptBuilderInput>[0],
): void;

const humanParticipant = {} as ParticipantHumanDto;
if (false) {
  // @ts-expect-error Prompt inputs must be anonymous DTOs.
  acceptsPromptInput(humanParticipant);
}
