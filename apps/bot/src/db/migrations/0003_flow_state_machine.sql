-- Migration: 0003_flow_state_machine
-- Purpose: extend pending_transactions to support flow state machines with idempotency and checkpoints

ALTER TABLE "pending_transactions"
  ADD COLUMN IF NOT EXISTS "idempotency_key" text,
  ADD COLUMN IF NOT EXISTS "flow_state" text NOT NULL DEFAULT 'INITIATED',
  ADD COLUMN IF NOT EXISTS "flow_status" text NOT NULL DEFAULT 'PENDING',
  ADD COLUMN IF NOT EXISTS "flow_checkpoint" jsonb,
  ADD COLUMN IF NOT EXISTS "flow_started_at" timestamptz,
  ADD COLUMN IF NOT EXISTS "flow_last_transition_at" timestamptz,
  ADD COLUMN IF NOT EXISTS "flow_completed_at" timestamptz,
  ADD COLUMN IF NOT EXISTS "flow_expires_at" timestamptz,
  ADD COLUMN IF NOT EXISTS "flow_timeout_ms" integer;

-- Backfill existing records with sane defaults
UPDATE "pending_transactions"
SET
  "flow_state" = COALESCE("flow_state", 'INITIATED'),
  "flow_status" = CASE
    WHEN "status" = 'COMPLETED' THEN 'COMPLETED'
    WHEN "status" = 'FAILED' THEN 'FAILED'
    ELSE 'PENDING'
  END,
  "flow_started_at" = COALESCE("flow_started_at", "created_at"),
  "flow_last_transition_at" = COALESCE("flow_last_transition_at", "updated_at"),
  "flow_timeout_ms" = COALESCE("flow_timeout_ms", 600000);

-- Ensure idempotency keys remain unique when present
CREATE UNIQUE INDEX IF NOT EXISTS "pending_transactions_idempotency_key_idx"
  ON "pending_transactions" ("idempotency_key")
  WHERE "idempotency_key" IS NOT NULL;
