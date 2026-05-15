CREATE TYPE "participant_type" AS ENUM ('app', 'provider');
CREATE TYPE "participant_status" AS ENUM ('active', 'waiting', 'inactive', 'removed');
CREATE TYPE "project_status" AS ENUM ('created', 'active', 'drafting', 'reviewing', 'finalized', 'closed');
CREATE TYPE "topic_phase" AS ENUM ('preparing', 'debating', 'drafting', 'reviewing', 'finalizing', 'finalized', 'closed');
CREATE TYPE "topic_mode" AS ENUM ('consensus', 'options');
CREATE TYPE "turn_status" AS ENUM ('idle', 'in_progress', 'completed', 'skipped');
CREATE TYPE "report_status" AS ENUM ('none', 'drafting', 'draft_ready', 'reviewing', 'finalizing', 'finalized');
CREATE TYPE "message_kind" AS ENUM ('statement', 'feedback', 'report_draft', 'report_final', 'system');

CREATE TABLE "projects" (
  "id" uuid NOT NULL DEFAULT gen_random_uuid(),
  "slug" text NOT NULL,
  "name" text NOT NULL,
  "status" "project_status" NOT NULL DEFAULT 'created',
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT "projects_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "topics" (
  "id" uuid NOT NULL DEFAULT gen_random_uuid(),
  "project_id" uuid NOT NULL,
  "title" text NOT NULL,
  "description" text,
  "mode" "topic_mode" NOT NULL DEFAULT 'consensus',
  "phase" "topic_phase" NOT NULL DEFAULT 'preparing',
  "max_rounds" integer,
  "max_turns" integer,
  "current_round" integer NOT NULL DEFAULT 0,
  "current_turn_index" integer NOT NULL DEFAULT 0,
  "reporter_participant_id" uuid,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT "topics_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "participants" (
  "id" uuid NOT NULL DEFAULT gen_random_uuid(),
  "project_id" uuid NOT NULL,
  "display_name" text NOT NULL,
  "anonymous_name" text NOT NULL,
  "participant_type" "participant_type" NOT NULL,
  "provider_name" text,
  "model_name" text,
  "client_name" text,
  "status" "participant_status" NOT NULL DEFAULT 'waiting',
  "join_order" integer NOT NULL,
  "joined_at" timestamptz NOT NULL DEFAULT now(),
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT "participants_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "documents" (
  "id" uuid NOT NULL DEFAULT gen_random_uuid(),
  "project_id" uuid NOT NULL,
  "topic_id" uuid,
  "file_name" text NOT NULL,
  "file_path" text NOT NULL,
  "mime_type" text NOT NULL,
  "size_bytes" bigint NOT NULL,
  "content_hash" text NOT NULL,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT "documents_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "messages" (
  "id" uuid NOT NULL DEFAULT gen_random_uuid(),
  "project_id" uuid NOT NULL,
  "topic_id" uuid NOT NULL,
  "participant_id" uuid NOT NULL,
  "kind" "message_kind" NOT NULL DEFAULT 'statement',
  "turn_index" integer NOT NULL,
  "round_index" integer NOT NULL,
  "phase" "topic_phase" NOT NULL,
  "content" text NOT NULL,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT "messages_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "messages_content_max_32kb" CHECK (octet_length("content") <= 32768)
);

CREATE TABLE "turns" (
  "id" uuid NOT NULL DEFAULT gen_random_uuid(),
  "project_id" uuid NOT NULL,
  "topic_id" uuid NOT NULL,
  "current_participant_id" uuid,
  "turn_index" integer NOT NULL,
  "round_index" integer NOT NULL,
  "phase" "topic_phase" NOT NULL,
  "status" "turn_status" NOT NULL DEFAULT 'idle',
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT "turns_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "reports" (
  "id" uuid NOT NULL DEFAULT gen_random_uuid(),
  "project_id" uuid NOT NULL,
  "topic_id" uuid NOT NULL,
  "reporter_participant_id" uuid NOT NULL,
  "status" "report_status" NOT NULL DEFAULT 'none',
  "draft_content" text,
  "final_content" text,
  "file_path" text,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT "reports_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "projects_slug_key" ON "projects"("slug");
CREATE UNIQUE INDEX "participants_project_id_anonymous_name_key" ON "participants"("project_id", "anonymous_name");
CREATE UNIQUE INDEX "participants_app_identity_key" ON "participants"("project_id", "client_name", "model_name")
  WHERE "participant_type" = 'app' AND "status" <> 'removed';
CREATE UNIQUE INDEX "participants_provider_identity_key" ON "participants"("project_id", "provider_name", "model_name")
  WHERE "participant_type" = 'provider' AND "status" <> 'removed';
CREATE UNIQUE INDEX "turns_topic_id_turn_index_key" ON "turns"("topic_id", "turn_index");

CREATE INDEX "messages_topic_id_created_at_idx" ON "messages"("topic_id", "created_at");
CREATE INDEX "messages_topic_id_turn_index_round_index_idx" ON "messages"("topic_id", "turn_index", "round_index");
CREATE INDEX "participants_project_id_join_order_idx" ON "participants"("project_id", "join_order");
CREATE INDEX "turns_topic_id_status_idx" ON "turns"("topic_id", "status");

ALTER TABLE "topics" ADD CONSTRAINT "topics_project_id_fkey"
  FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "topics" ADD CONSTRAINT "topics_reporter_participant_id_fkey"
  FOREIGN KEY ("reporter_participant_id") REFERENCES "participants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "participants" ADD CONSTRAINT "participants_project_id_fkey"
  FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "documents" ADD CONSTRAINT "documents_project_id_fkey"
  FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "documents" ADD CONSTRAINT "documents_topic_id_fkey"
  FOREIGN KEY ("topic_id") REFERENCES "topics"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "messages" ADD CONSTRAINT "messages_project_id_fkey"
  FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "messages" ADD CONSTRAINT "messages_topic_id_fkey"
  FOREIGN KEY ("topic_id") REFERENCES "topics"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "messages" ADD CONSTRAINT "messages_participant_id_fkey"
  FOREIGN KEY ("participant_id") REFERENCES "participants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "turns" ADD CONSTRAINT "turns_project_id_fkey"
  FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "turns" ADD CONSTRAINT "turns_topic_id_fkey"
  FOREIGN KEY ("topic_id") REFERENCES "topics"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "turns" ADD CONSTRAINT "turns_current_participant_id_fkey"
  FOREIGN KEY ("current_participant_id") REFERENCES "participants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "reports" ADD CONSTRAINT "reports_project_id_fkey"
  FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "reports" ADD CONSTRAINT "reports_topic_id_fkey"
  FOREIGN KEY ("topic_id") REFERENCES "topics"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "reports" ADD CONSTRAINT "reports_reporter_participant_id_fkey"
  FOREIGN KEY ("reporter_participant_id") REFERENCES "participants"("id") ON DELETE CASCADE ON UPDATE CASCADE;
