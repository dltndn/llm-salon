import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const migrationSql = readFileSync(
  join(process.cwd(), 'prisma/migrations/0002_domain_tables/migration.sql'),
  'utf8',
);

describe('domain Prisma migration', () => {
  it('defines participant partial unique constraints', () => {
    expect(migrationSql).toContain(
      'CREATE UNIQUE INDEX "participants_app_identity_key"',
    );
    expect(migrationSql).toContain(
      `WHERE "participant_type" = 'app' AND "status" <> 'removed'`,
    );
    expect(migrationSql).toContain(
      'CREATE UNIQUE INDEX "participants_provider_identity_key"',
    );
    expect(migrationSql).toContain(
      `WHERE "participant_type" = 'provider' AND "status" <> 'removed'`,
    );
  });

  it('uses cascading foreign keys for domain tables', () => {
    const foreignKeys = migrationSql.match(/FOREIGN KEY/g) ?? [];
    const cascadeDeletes = migrationSql.match(/ON DELETE CASCADE/g) ?? [];

    expect(foreignKeys.length).toBeGreaterThan(0);
    expect(cascadeDeletes).toHaveLength(foreignKeys.length);
  });

  it('includes the required retrieval indexes and message length check', () => {
    expect(migrationSql).toContain(
      'CREATE INDEX "messages_topic_id_created_at_idx"',
    );
    expect(migrationSql).toContain(
      'CREATE INDEX "messages_topic_id_turn_index_round_index_idx"',
    );
    expect(migrationSql).toContain(
      'CREATE INDEX "participants_project_id_join_order_idx"',
    );
    expect(migrationSql).toContain('CREATE INDEX "turns_topic_id_status_idx"');
    expect(migrationSql).toContain(
      'CONSTRAINT "messages_content_max_32kb" CHECK (octet_length("content") <= 32768)',
    );
  });
});
