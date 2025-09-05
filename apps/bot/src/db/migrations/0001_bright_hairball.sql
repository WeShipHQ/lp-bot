CREATE TYPE "public"."RebalanceStrategy" AS ENUM('STANDARD', 'DIP_PROTECTION');--> statement-breakpoint
ALTER TABLE "Position" ADD COLUMN "priceRangeMin" numeric(20, 8);--> statement-breakpoint
ALTER TABLE "Position" ADD COLUMN "priceRangeMax" numeric(20, 8);--> statement-breakpoint
ALTER TABLE "User" ADD COLUMN "rebalanceStrategy" "RebalanceStrategy" DEFAULT 'STANDARD' NOT NULL;