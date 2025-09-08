ALTER TABLE "Position" RENAME COLUMN "tokenXAmount" TO "depositTokenXAmount";--> statement-breakpoint
ALTER TABLE "Position" RENAME COLUMN "tokenYAmount" TO "depositTokenYAmount";--> statement-breakpoint
ALTER TABLE "Position" ADD COLUMN "withdrawTokenXAmount" numeric(20, 8) NOT NULL;--> statement-breakpoint
ALTER TABLE "Position" ADD COLUMN "withdrawTokenYAmount" numeric(20, 8) NOT NULL;--> statement-breakpoint
ALTER TABLE "Position" ADD COLUMN "feeTokenXAmount" numeric(20, 8) NOT NULL;--> statement-breakpoint
ALTER TABLE "Position" ADD COLUMN "feeTokenYAmount" numeric(20, 8) NOT NULL;--> statement-breakpoint
ALTER TABLE "Position" ADD COLUMN "pnlInUsd" numeric(20, 8);