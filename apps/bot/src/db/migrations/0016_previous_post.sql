ALTER TABLE "claim_history" RENAME COLUMN "timestamp" TO "updated_at";--> statement-breakpoint
ALTER TABLE "PositionSnapshot" RENAME COLUMN "snapshot_timestamp" TO "updated_at";--> statement-breakpoint
ALTER TABLE "RebalanceEvent" RENAME COLUMN "timestamp" TO "updated_at";--> statement-breakpoint
ALTER TABLE "claim_history" ALTER COLUMN "created_at" SET DATA TYPE timestamp with time zone;--> statement-breakpoint
ALTER TABLE "claim_history" ALTER COLUMN "created_at" SET DEFAULT (now() AT TIME ZONE 'utc'::text);--> statement-breakpoint
ALTER TABLE "pending_transactions" ALTER COLUMN "last_processed_at" SET DATA TYPE timestamp with time zone;--> statement-breakpoint
ALTER TABLE "pending_transactions" ALTER COLUMN "created_at" SET DATA TYPE timestamp with time zone;--> statement-breakpoint
ALTER TABLE "pending_transactions" ALTER COLUMN "created_at" SET DEFAULT (now() AT TIME ZONE 'utc'::text);--> statement-breakpoint
ALTER TABLE "pending_transactions" ALTER COLUMN "updated_at" SET DATA TYPE timestamp with time zone;--> statement-breakpoint
ALTER TABLE "pending_transactions" ALTER COLUMN "updated_at" SET DEFAULT (now() AT TIME ZONE 'utc'::text);--> statement-breakpoint
ALTER TABLE "points" ALTER COLUMN "created_at" SET DATA TYPE timestamp with time zone;--> statement-breakpoint
ALTER TABLE "points" ALTER COLUMN "created_at" SET DEFAULT (now() AT TIME ZONE 'utc'::text);--> statement-breakpoint
ALTER TABLE "PositionSegment" ALTER COLUMN "start_timestamp" SET DATA TYPE timestamp with time zone;--> statement-breakpoint
ALTER TABLE "PositionSegment" ALTER COLUMN "end_timestamp" SET DATA TYPE timestamp with time zone;--> statement-breakpoint
ALTER TABLE "PositionSegment" ALTER COLUMN "created_at" SET DATA TYPE timestamp with time zone;--> statement-breakpoint
ALTER TABLE "PositionSegment" ALTER COLUMN "created_at" SET DEFAULT (now() AT TIME ZONE 'utc'::text);--> statement-breakpoint
ALTER TABLE "PositionSnapshot" ALTER COLUMN "created_at" SET DATA TYPE timestamp with time zone;--> statement-breakpoint
ALTER TABLE "PositionSnapshot" ALTER COLUMN "created_at" SET DEFAULT (now() AT TIME ZONE 'utc'::text);--> statement-breakpoint
ALTER TABLE "positions" ALTER COLUMN "created_at" SET DATA TYPE timestamp with time zone;--> statement-breakpoint
ALTER TABLE "positions" ALTER COLUMN "created_at" SET DEFAULT (now() AT TIME ZONE 'utc'::text);--> statement-breakpoint
ALTER TABLE "positions" ALTER COLUMN "closed_at" SET DATA TYPE timestamp with time zone;--> statement-breakpoint
ALTER TABLE "positions" ALTER COLUMN "current_segment_start_at" SET DATA TYPE timestamp with time zone;--> statement-breakpoint
ALTER TABLE "positions" ALTER COLUMN "current_segment_start_at" SET DEFAULT now();--> statement-breakpoint
ALTER TABLE "positions" ALTER COLUMN "updated_at" SET DATA TYPE timestamp with time zone;--> statement-breakpoint
ALTER TABLE "positions" ALTER COLUMN "updated_at" SET DEFAULT (now() AT TIME ZONE 'utc'::text);--> statement-breakpoint
ALTER TABLE "RebalanceEvent" ALTER COLUMN "created_at" SET DATA TYPE timestamp with time zone;--> statement-breakpoint
ALTER TABLE "RebalanceEvent" ALTER COLUMN "created_at" SET DEFAULT (now() AT TIME ZONE 'utc'::text);--> statement-breakpoint
ALTER TABLE "Referral" ALTER COLUMN "created_at" SET DATA TYPE timestamp with time zone;--> statement-breakpoint
ALTER TABLE "Referral" ALTER COLUMN "created_at" SET DEFAULT (now() AT TIME ZONE 'utc'::text);--> statement-breakpoint
ALTER TABLE "Referral" ALTER COLUMN "updated_at" SET DATA TYPE timestamp with time zone;--> statement-breakpoint
ALTER TABLE "Referral" ALTER COLUMN "updated_at" SET DEFAULT (now() AT TIME ZONE 'utc'::text);--> statement-breakpoint
ALTER TABLE "users" ALTER COLUMN "created_at" SET DATA TYPE timestamp with time zone;--> statement-breakpoint
ALTER TABLE "users" ALTER COLUMN "created_at" SET DEFAULT (now() AT TIME ZONE 'utc'::text);--> statement-breakpoint
ALTER TABLE "users" ALTER COLUMN "updated_at" SET DATA TYPE timestamp with time zone;--> statement-breakpoint
ALTER TABLE "users" ALTER COLUMN "updated_at" SET DEFAULT (now() AT TIME ZONE 'utc'::text);--> statement-breakpoint
ALTER TABLE "points" ADD COLUMN "updated_at" timestamp with time zone DEFAULT (now() AT TIME ZONE 'utc'::text) NOT NULL;--> statement-breakpoint
ALTER TABLE "PositionSegment" ADD COLUMN "updated_at" timestamp with time zone DEFAULT (now() AT TIME ZONE 'utc'::text) NOT NULL;