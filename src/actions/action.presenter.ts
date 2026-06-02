import { Topic } from '@prisma/client';

import type { ActionType } from './action-resolver';

export type ActionWaitWakeupReason =
  | 'immediate'
  | 'turn_changed'
  | 'phase_changed'
  | 'topic_updated'
  | 'timeout'
  | 'closed';

export type ActionWaitResponse = {
  isActionable: boolean;
  action: ActionType;
  assignedMember: string | null;
  mySelf: string | null;
  phase: string;
  currentRound: number;
  currentTurnIndex: number;
  serverTime: string;
  topicVersion: number;
  wakeupReason: ActionWaitWakeupReason;
};

export function serializeActionWaitResponse(input: {
  topic: Topic;
  isActionable: boolean;
  action: ActionType;
  assignedMember: string | null;
  mySelf: string | null;
  wakeupReason: ActionWaitWakeupReason;
}): ActionWaitResponse {
  return {
    isActionable: input.isActionable,
    action: input.action,
    assignedMember: input.assignedMember,
    mySelf: input.mySelf,
    phase: input.topic.phase,
    currentRound: input.topic.currentRound,
    currentTurnIndex: input.topic.currentTurnIndex,
    serverTime: new Date().toISOString(),
    topicVersion: input.topic.version,
    wakeupReason: input.wakeupReason,
  };
}
