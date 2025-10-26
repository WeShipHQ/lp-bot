ALTER TYPE "public"."operation_type" ADD VALUE 'SOL_TO_TOKEN_SWAP';--> statement-breakpoint
ALTER TYPE "public"."transaction_status" ADD VALUE 'PENDING_SWAPS' BEFORE 'CONFIRMED';--> statement-breakpoint
ALTER TABLE "pending_transactions" ADD COLUMN "group" varchar;