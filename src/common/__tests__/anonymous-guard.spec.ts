import { CallHandler, ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { of } from 'rxjs';

import { AUDIENCE_METADATA_KEY } from '../audience';
import {
  AnonymousGuardInterceptor,
  assertAnonymousPayload,
} from '../interceptors/anonymous-guard.interceptor';

function httpContext(query: Record<string, unknown>): ExecutionContext {
  const request = { query };

  return {
    getClass: () => AnonymousGuardInterceptor,
    getHandler: () => httpContext,
    switchToHttp: () => ({
      getRequest: () => request,
    }),
  } as unknown as ExecutionContext;
}

describe('AnonymousGuardInterceptor', () => {
  it('allows human-facing responses to include human identifiers', async () => {
    const interceptor = new AnonymousGuardInterceptor(new Reflector());
    const next: CallHandler = {
      handle: () =>
        of({
          participant: {
            displayName: 'Codex / GPT-5',
            clientName: 'Codex',
            modelName: 'GPT-5',
          },
        }),
    };

    await expect(
      interceptor.intercept(httpContext({ audience: 'human' }), next).toPromise(),
    ).resolves.toMatchObject({
      participant: {
        displayName: 'Codex / GPT-5',
        clientName: 'Codex',
        modelName: 'GPT-5',
      },
    });
  });

  it('rejects forbidden camelCase fields in anonymous responses', () => {
    expect(() =>
      assertAnonymousPayload({
        participants: [{ anonymousName: 'Member A', modelName: 'GPT-5' }],
      }),
    ).toThrow('$.participants[0].modelName');
  });

  it('rejects forbidden snake_case fields in anonymous responses', () => {
    expect(() =>
      assertAnonymousPayload({
        participants: [{ anonymous_name: 'Member A', provider_name: 'OpenAI' }],
      }),
    ).toThrow('$.participants[0].provider_name');
  });

  it('allows whitelisted anonymous responses', () => {
    expect(() =>
      assertAnonymousPayload({
        participants: [{ anonymousName: 'Member A' }],
        turn: { currentMember: 'Member B' },
      }),
    ).not.toThrow();
  });

  it('rejects fields outside the anonymous DTO whitelist', () => {
    expect(() =>
      assertAnonymousPayload({
        participants: [{ anonymousName: 'Member A', provider: 'OpenAI' }],
      }),
    ).toThrow('$.participants[0].provider');
  });

  it('uses route metadata before query audience', async () => {
    const reflector = new Reflector();
    jest
      .spyOn(reflector, 'getAllAndOverride')
      .mockImplementation((key) =>
        key === AUDIENCE_METADATA_KEY ? 'anonymous' : undefined,
      );

    const interceptor = new AnonymousGuardInterceptor(reflector);
    const next: CallHandler = {
      handle: () => of({ displayName: 'Codex / GPT-5' }),
    };

    await expect(
      interceptor.intercept(httpContext({ audience: 'human' }), next).toPromise(),
    ).rejects.toThrow('Anonymous response contains non-anonymous field');
  });
});
