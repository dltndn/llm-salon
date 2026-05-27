CREATE TYPE "debate_signal" AS ENUM ('continue', 'ready_to_finalize');

ALTER TABLE "messages"
  ADD COLUMN "debate_signal" "debate_signal" NOT NULL DEFAULT 'continue';
