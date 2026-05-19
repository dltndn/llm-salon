import { DocumentTooLargeError } from '../../common/errors/domain.errors';
import { CONTEXT_PROFILE_POLICIES } from '../../llm/context-policy';
import { assertDocumentWithinProfileLimit } from '../document-size-policy';

describe('assertDocumentWithinProfileLimit', () => {
  it('allows files within the active profile limit', () => {
    expect(() =>
      assertDocumentWithinProfileLimit({
        profile: 'low',
        sizeBytes:
          CONTEXT_PROFILE_POLICIES.low.documentInlineLimitBytesPerFile,
      }),
    ).not.toThrow();
  });

  it('throws DocumentTooLargeError when a file exceeds the profile limit', () => {
    expect(() =>
      assertDocumentWithinProfileLimit({
        profile: 'low',
        sizeBytes:
          CONTEXT_PROFILE_POLICIES.low.documentInlineLimitBytesPerFile + 1,
      }),
    ).toThrow(DocumentTooLargeError);
  });
});
