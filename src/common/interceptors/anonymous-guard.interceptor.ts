import {
  CallHandler,
  ExecutionContext,
  Injectable,
  InternalServerErrorException,
  NestInterceptor,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Observable, map } from 'rxjs';

import {
  AUDIENCE_METADATA_KEY,
  Audience,
  normalizeAudience,
} from '../audience';

const FORBIDDEN_ANONYMOUS_KEYS = new Set([
  'display_name',
  'displayName',
  'provider_name',
  'providerName',
  'client_name',
  'clientName',
  'model_name',
  'modelName',
]);

const ALLOWED_ANONYMOUS_KEYS = new Set([
  'anonymousName',
  'anonymous_name',
  'content',
  'contentHash',
  'contextMessages',
  'createdAt',
  'currentMember',
  'currentRound',
  'currentTurnIndex',
  'description',
  'documentId',
  'documents',
  'draftAvailable',
  'draftContent',
  'draftPreview',
  'error',
  'fileName',
  'filePath',
  'finalAvailable',
  'finalContent',
  'host',
  'id',
  'isMyTurn',
  'joinOrder',
  'kind',
  'maxRounds',
  'maxTurns',
  'message',
  'messages',
  'messageId',
  'mimeType',
  'mode',
  'mySelf',
  'name',
  'nextMember',
  'participant',
  'participantId',
  'participantType',
  'participants',
  'phase',
  'phaseAfter',
  'port',
  'project',
  'projectId',
  'projects',
  'reporterMember',
  'reporterParticipantId',
  'roundIndex',
  'role',
  'serverTime',
  'sizeBytes',
  'slug',
  'status',
  'statusCode',
  'structuredContent',
  'systemPrompt',
  'title',
  'topic',
  'topicId',
  'topicVersion',
  'topics',
  'turn',
  'turnIndex',
  'updatedAt',
  'url',
  'version',
]);

@Injectable()
export class AnonymousGuardInterceptor implements NestInterceptor {
  constructor(private readonly reflector: Reflector) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const audience = this.resolveAudience(context);
    const request = context.switchToHttp().getRequest<{ audience?: Audience }>();
    request.audience = audience;

    return next.handle().pipe(
      map((payload) => {
        if (audience === 'anonymous') {
          assertAnonymousPayload(payload);
        }

        return payload;
      }),
    );
  }

  private resolveAudience(context: ExecutionContext): Audience {
    const metadataAudience = this.reflector.getAllAndOverride<Audience>(
      AUDIENCE_METADATA_KEY,
      [context.getHandler(), context.getClass()],
    );

    if (metadataAudience) {
      return metadataAudience;
    }

    const request = context.switchToHttp().getRequest<{
      query?: { audience?: unknown };
    }>();

    return normalizeAudience(request.query?.audience);
  }
}

export function assertAnonymousPayload(payload: unknown): void {
  const path = findAnonymousPayloadViolation(payload);

  if (path) {
    throw new InternalServerErrorException(
      `Anonymous response contains non-anonymous field: ${path}`,
    );
  }
}

function findAnonymousPayloadViolation(
  value: unknown,
  path = '$',
  seen = new WeakSet<object>(),
): string | null {
  if (value === null || typeof value !== 'object') {
    return null;
  }

  if (seen.has(value)) {
    return null;
  }
  seen.add(value);

  if (value instanceof Date) {
    return null;
  }

  if (Array.isArray(value)) {
    for (let index = 0; index < value.length; index += 1) {
      const result = findAnonymousPayloadViolation(
        value[index],
        `${path}[${index}]`,
        seen,
      );

      if (result) {
        return result;
      }
    }

    return null;
  }

  for (const [key, child] of Object.entries(value)) {
    const childPath = `${path}.${key}`;

    if (FORBIDDEN_ANONYMOUS_KEYS.has(key)) {
      return childPath;
    }

    if (!ALLOWED_ANONYMOUS_KEYS.has(key)) {
      return childPath;
    }

    const result = findAnonymousPayloadViolation(child, childPath, seen);

    if (result) {
      return result;
    }
  }

  return null;
}
