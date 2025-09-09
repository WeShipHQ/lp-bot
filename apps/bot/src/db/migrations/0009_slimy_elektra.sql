CREATE TABLE "ClaimHistory" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"positionId" uuid NOT NULL,
	"timestamp" timestamp DEFAULT now() NOT NULL,
	"claimedAmountX" numeric(28, 9) NOT NULL,
	"claimedAmountY" numeric(28, 9) NOT NULL,
	"claimedRewardsOther" jsonb,
	"claimedUSD" numeric(18, 2) NOT NULL,
	"isDuringRebalance" boolean DEFAULT false,
	"txHash" text,
	"notes" text,
	"createdAt" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "PositionSnapshot" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"positionId" uuid NOT NULL,
	"snapshotTimestamp" timestamp DEFAULT now() NOT NULL,
	"currentValueUSD" numeric(18, 2) NOT NULL,
	"unrealizedPnlUSD" numeric(18, 2) NOT NULL,
	"unrealizedPnlPct" numeric(5, 2) NOT NULL,
	"tokenXAmount" numeric(28, 9) NOT NULL,
	"tokenYAmount" numeric(28, 9) NOT NULL,
	"unclaimedFeesUSD" numeric(18, 2) NOT NULL,
	"priceXUSD" numeric(18, 9) NOT NULL,
	"priceYUSD" numeric(18, 9) NOT NULL,
	"createdAt" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "Position" RENAME COLUMN "initialValueInSol" TO "initialValueSOL";--> statement-breakpoint
ALTER TABLE "Position" RENAME COLUMN "finalValueInSol" TO "finalValueSol";--> statement-breakpoint
ALTER TABLE "Position" ADD COLUMN "slPercentage" numeric(5, 2);--> statement-breakpoint
ALTER TABLE "Position" ADD COLUMN "tpPercentage" numeric(5, 2);--> statement-breakpoint
ALTER TABLE "Position" ADD COLUMN "trailingStopPercentage" numeric(5, 2);--> statement-breakpoint
ALTER TABLE "Position" ADD COLUMN "timeBasedSLPercentage" numeric(5, 2);--> statement-breakpoint
ALTER TABLE "Position" ADD COLUMN "volatilityAdjusted" boolean DEFAULT false;--> statement-breakpoint
ALTER TABLE "Position" ADD COLUMN "initialValueUSD" numeric(18, 2) NOT NULL;--> statement-breakpoint
ALTER TABLE "Position" ADD COLUMN "cumulativeAbsolutePnlUSD" numeric(18, 2) DEFAULT '0';--> statement-breakpoint
ALTER TABLE "Position" ADD COLUMN "currentSegmentInitialUSD" numeric(18, 2);--> statement-breakpoint
ALTER TABLE "Position" ADD COLUMN "isRebalancingEnabled" boolean DEFAULT false;--> statement-breakpoint
ALTER TABLE "Position" ADD COLUMN "rebalanceThreshold" numeric(5, 2) DEFAULT '20.0';--> statement-breakpoint
ALTER TABLE "Position" ADD COLUMN "finalValueUSD" numeric(18, 2) NOT NULL;--> statement-breakpoint
ALTER TABLE "RebalanceEvent" ADD COLUMN "timestamp" timestamp DEFAULT now() NOT NULL;--> statement-breakpoint
ALTER TABLE "RebalanceEvent" ADD COLUMN "oldPositionAddress" text NOT NULL;--> statement-breakpoint
ALTER TABLE "RebalanceEvent" ADD COLUMN "newPositionAddress" text NOT NULL;--> statement-breakpoint
ALTER TABLE "RebalanceEvent" ADD COLUMN "segmentFinalUSD" numeric(18, 2) NOT NULL;--> statement-breakpoint
ALTER TABLE "RebalanceEvent" ADD COLUMN "segmentPnlUSD" numeric(18, 2) NOT NULL;--> statement-breakpoint
ALTER TABLE "RebalanceEvent" ADD COLUMN "segmentPnlPct" numeric(5, 2) NOT NULL;--> statement-breakpoint
ALTER TABLE "RebalanceEvent" ADD COLUMN "notes" text;--> statement-breakpoint
ALTER TABLE "ClaimHistory" ADD CONSTRAINT "ClaimHistory_positionId_Position_id_fk" FOREIGN KEY ("positionId") REFERENCES "public"."Position"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "PositionSnapshot" ADD CONSTRAINT "PositionSnapshot_positionId_Position_id_fk" FOREIGN KEY ("positionId") REFERENCES "public"."Position"("id") ON DELETE cascade ON UPDATE no action;