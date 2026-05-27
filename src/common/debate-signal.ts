import { DebateSignal } from '@prisma/client';

export const DEBATE_SIGNAL_VALUES = [
  'continue',
  'ready_to_finalize',
] as const;

export type DebateSignalValue = (typeof DEBATE_SIGNAL_VALUES)[number];

export function isDebateSignalValue(value: unknown): value is DebateSignalValue {
  return (
    value === DEBATE_SIGNAL_VALUES[0] || value === DEBATE_SIGNAL_VALUES[1]
  );
}

export function toPrismaDebateSignal(
  value: DebateSignalValue | undefined,
): DebateSignal {
  return value === 'ready_to_finalize'
    ? DebateSignal.ReadyToFinalize
    : DebateSignal.Continue;
}

export function fromPrismaDebateSignal(signal: DebateSignal): DebateSignalValue {
  return signal === DebateSignal.ReadyToFinalize
    ? 'ready_to_finalize'
    : 'continue';
}
