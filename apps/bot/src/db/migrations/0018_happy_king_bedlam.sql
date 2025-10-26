ALTER TABLE "users" ALTER COLUMN "rebalance_threshold" SET DEFAULT '20.00';--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "rebalance_schedule" text DEFAULT '15m' NOT NULL;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "default_bin_range" integer DEFAULT 10 NOT NULL;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "stop_loss_percentage" numeric(5, 2) DEFAULT '25.00';--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "take_profit_percentage" numeric(5, 2) DEFAULT '25.00';--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "auto_convert_to_sol" boolean DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "slippage_percentage" numeric(5, 2) DEFAULT '3.00' NOT NULL;