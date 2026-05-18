import { createParamDecorator, ExecutionContext, SetMetadata } from '@nestjs/common';

export type Audience = 'human' | 'anonymous';

export const AUDIENCE_METADATA_KEY = 'llm-salon:audience';

export const AudienceRoute = (audience: Audience) =>
  SetMetadata(AUDIENCE_METADATA_KEY, audience);

export function normalizeAudience(value: unknown): Audience {
  return value === 'anonymous' ? 'anonymous' : 'human';
}

export const RequestAudience = createParamDecorator(
  (_data: unknown, context: ExecutionContext): Audience => {
    const request = context.switchToHttp().getRequest<{
      audience?: Audience;
      query?: { audience?: unknown };
    }>();

    return request.audience ?? normalizeAudience(request.query?.audience);
  },
);
