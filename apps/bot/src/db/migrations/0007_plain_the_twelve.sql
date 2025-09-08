ALTER TABLE "Position" ADD COLUMN "tokenXPriceAtCreation" numeric(20, 8) NOT NULL;--> statement-breakpoint
ALTER TABLE "Position" ADD COLUMN "tokenYPriceAtCreation" numeric(20, 8) NOT NULL;--> statement-breakpoint
ALTER TABLE "Position" ADD COLUMN "tokenXPriceAtClosure" numeric(20, 8);--> statement-breakpoint
ALTER TABLE "Position" ADD COLUMN "tokenYPriceAtClosure" numeric(20, 8);--> statement-breakpoint
ALTER TABLE "Position" ADD COLUMN "initialValueInSol" numeric(20, 8) NOT NULL;--> statement-breakpoint
ALTER TABLE "Position" ADD COLUMN "finalValueInSol" numeric(20, 8);--> statement-breakpoint
ALTER TABLE "Position" ADD COLUMN "feesEarnedInSol" numeric(20, 8) DEFAULT '0';--> statement-breakpoint
ALTER TABLE "Position" ADD COLUMN "pnlInSol" numeric(20, 8);--> statement-breakpoint
ALTER TABLE "Position" ADD COLUMN "pnlPercentage" numeric(10, 4);