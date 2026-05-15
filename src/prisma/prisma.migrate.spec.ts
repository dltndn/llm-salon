import { resolveAutoMigrateFlag } from './prisma.migrate';

describe('resolveAutoMigrateFlag', () => {
  it('defaults to the provided value when no flags are set', () => {
    expect(resolveAutoMigrateFlag([], true)).toBe(true);
    expect(resolveAutoMigrateFlag([], false)).toBe(false);
  });

  it('disables auto-migrate when --no-auto-migrate is present', () => {
    expect(resolveAutoMigrateFlag(['--no-auto-migrate'], true)).toBe(false);
  });

  it('uses the last auto-migrate flag when both are present', () => {
    expect(
      resolveAutoMigrateFlag(
        ['--no-auto-migrate', '--auto-migrate', '--no-auto-migrate'],
        true,
      ),
    ).toBe(false);
    expect(
      resolveAutoMigrateFlag(
        ['--auto-migrate', '--no-auto-migrate', '--auto-migrate'],
        false,
      ),
    ).toBe(true);
  });
});
