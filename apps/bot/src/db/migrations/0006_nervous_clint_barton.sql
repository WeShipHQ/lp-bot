ALTER TABLE "Position" ADD COLUMN "tokenX" jsonb;--> statement-breakpoint
ALTER TABLE "Position" ADD COLUMN "tokenY" jsonb;--> statement-breakpoint
ALTER TABLE "Position" DROP COLUMN "currentValue";--> statement-breakpoint
ALTER TABLE "Position" DROP COLUMN "feesEarned";--> statement-breakpoint
ALTER TABLE "Position" DROP COLUMN "priceRangeMin";--> statement-breakpoint
ALTER TABLE "Position" DROP COLUMN "priceRangeMax";