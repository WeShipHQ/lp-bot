CREATE TYPE "public"."ClaimType" AS ENUM('manual', 'rebalance', 'closure');--> statement-breakpoint
CREATE TYPE "public"."SnapshotType" AS ENUM('creation', 'claim', 'rebalance', 'closure', 'periodic');--> statement-breakpoint
CREATE TABLE "PositionSegment" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"positionId" uuid NOT NULL,
	"segmentNumber" integer NOT NULL,
	"startTimestamp" timestamp NOT NULL,
	"endTimestamp" timestamp,
	"initialValueUSD" numeric(18, 2) NOT NULL,
	"finalValueUSD" numeric(18, 2),
	"realizedPnlUSD" numeric(18, 2),
	"realizedPnlPercentage" numeric(10, 4),
	"feesClaimedUSD" numeric(18, 2) DEFAULT '0',
	"closureReason" text,
	"closureSignature" text,
	"startPositionAddress" text NOT NULL,
	"endPositionAddress" text,
	"createdAt" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "ClaimHistory" RENAME COLUMN "claimedAmountX" TO "claimedTokenXAmount";--> statement-breakpoint
ALTER TABLE "ClaimHistory" RENAME COLUMN "claimedAmountY" TO "claimedTokenYAmount";--> statement-breakpoint
ALTER TABLE "ClaimHistory" RENAME COLUMN "claimedUSD" TO "claimedUSDValue";--> statement-breakpoint
ALTER TABLE "PositionSnapshot" RENAME COLUMN "unrealizedPnlPct" TO "unrealizedPnlPercentage";--> statement-breakpoint
ALTER TABLE "PositionSnapshot" RENAME COLUMN "priceXUSD" TO "tokenXPriceUSD";--> statement-breakpoint
ALTER TABLE "PositionSnapshot" RENAME COLUMN "priceYUSD" TO "tokenYPriceUSD";--> statement-breakpoint
ALTER TABLE "Position" RENAME COLUMN "depositTokenXAmount" TO "initialTokenXAmount";--> statement-breakpoint
ALTER TABLE "Position" RENAME COLUMN "depositTokenYAmount" TO "initialTokenYAmount";--> statement-breakpoint
ALTER TABLE "Position" RENAME COLUMN "tokenXPriceAtCreation" TO "initialTokenXPriceUSD";--> statement-breakpoint
ALTER TABLE "Position" RENAME COLUMN "tokenYPriceAtCreation" TO "initialTokenYPriceUSD";--> statement-breakpoint
ALTER TABLE "Position" RENAME COLUMN "withdrawTokenXAmount" TO "finalTokenXAmount";--> statement-breakpoint
ALTER TABLE "Position" RENAME COLUMN "withdrawTokenYAmount" TO "finalTokenYAmount";--> statement-breakpoint
ALTER TABLE "Position" RENAME COLUMN "tokenXPriceAtClosure" TO "finalTokenXPriceUSD";--> statement-breakpoint
ALTER TABLE "Position" RENAME COLUMN "tokenYPriceAtClosure" TO "finalTokenYPriceUSD";--> statement-breakpoint
ALTER TABLE "RebalanceEvent" RENAME COLUMN "reason" TO "triggerReason";--> statement-breakpoint
ALTER TABLE "RebalanceEvent" RENAME COLUMN "feesCollected" TO "feesCollectedUSD";--> statement-breakpoint
ALTER TABLE "RebalanceEvent" RENAME COLUMN "txHash" TO "closeTransactionSignature";--> statement-breakpoint
ALTER TABLE "Position" ALTER COLUMN "tokenX" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "Position" ALTER COLUMN "tokenY" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "Position" ALTER COLUMN "creationSignature" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "Position" ALTER COLUMN "currentSegmentInitialUSD" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "Position" ALTER COLUMN "finalValueUSD" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "ClaimHistory" ADD COLUMN "segmentId" uuid;--> statement-breakpoint
ALTER TABLE "ClaimHistory" ADD COLUMN "claimType" "ClaimType" DEFAULT 'manual' NOT NULL;--> statement-breakpoint
ALTER TABLE "ClaimHistory" ADD COLUMN "tokenXPriceUSD" numeric(18, 9) NOT NULL;--> statement-breakpoint
ALTER TABLE "ClaimHistory" ADD COLUMN "tokenYPriceUSD" numeric(18, 9) NOT NULL;--> statement-breakpoint
ALTER TABLE "ClaimHistory" ADD COLUMN "solReceived" numeric(18, 9);--> statement-breakpoint
ALTER TABLE "ClaimHistory" ADD COLUMN "solPriceUSD" numeric(18, 9);--> statement-breakpoint
ALTER TABLE "ClaimHistory" ADD COLUMN "transactionSignature" text NOT NULL;--> statement-breakpoint
ALTER TABLE "PositionSnapshot" ADD COLUMN "segmentId" uuid;--> statement-breakpoint
ALTER TABLE "PositionSnapshot" ADD COLUMN "snapshotType" "SnapshotType" NOT NULL;--> statement-breakpoint
ALTER TABLE "PositionSnapshot" ADD COLUMN "unclaimedFeesX" numeric(28, 9) NOT NULL;--> statement-breakpoint
ALTER TABLE "PositionSnapshot" ADD COLUMN "unclaimedFeesY" numeric(28, 9) NOT NULL;--> statement-breakpoint
ALTER TABLE "PositionSnapshot" ADD COLUMN "totalPnlUSD" numeric(18, 2) NOT NULL;--> statement-breakpoint
ALTER TABLE "PositionSnapshot" ADD COLUMN "totalPnlPercentage" numeric(10, 4) NOT NULL;--> statement-breakpoint
ALTER TABLE "PositionSnapshot" ADD COLUMN "solPriceUSD" numeric(18, 9) NOT NULL;--> statement-breakpoint
ALTER TABLE "Position" ADD COLUMN "dex" text DEFAULT 'meteora' NOT NULL;--> statement-breakpoint
ALTER TABLE "Position" ADD COLUMN "closedAt" timestamp;--> statement-breakpoint
ALTER TABLE "Position" ADD COLUMN "currentSegmentNumber" integer DEFAULT 1 NOT NULL;--> statement-breakpoint
ALTER TABLE "Position" ADD COLUMN "currentSegmentStartAt" timestamp DEFAULT now() NOT NULL;--> statement-breakpoint
ALTER TABLE "Position" ADD COLUMN "totalRealizedPnlUSD" numeric(18, 2) DEFAULT '0' NOT NULL;--> statement-breakpoint
ALTER TABLE "Position" ADD COLUMN "totalFeesClaimedUSD" numeric(18, 2) DEFAULT '0' NOT NULL;--> statement-breakpoint
ALTER TABLE "Position" ADD COLUMN "finalValueSOL" numeric(18, 9);--> statement-breakpoint
ALTER TABLE "RebalanceEvent" ADD COLUMN "closedSegmentId" uuid;--> statement-breakpoint
ALTER TABLE "RebalanceEvent" ADD COLUMN "segmentInitialUSD" numeric(18, 2) NOT NULL;--> statement-breakpoint
ALTER TABLE "RebalanceEvent" ADD COLUMN "segmentPnlPercentage" numeric(10, 4) NOT NULL;--> statement-breakpoint
ALTER TABLE "RebalanceEvent" ADD COLUMN "newSegmentId" uuid;--> statement-breakpoint
ALTER TABLE "RebalanceEvent" ADD COLUMN "newSegmentInitialUSD" numeric(18, 2) NOT NULL;--> statement-breakpoint
ALTER TABLE "RebalanceEvent" ADD COLUMN "createTransactionSignature" text;--> statement-breakpoint
ALTER TABLE "RebalanceEvent" ADD COLUMN "totalGasCostSOL" numeric(18, 9);--> statement-breakpoint
ALTER TABLE "RebalanceEvent" ADD COLUMN "slippageCostUSD" numeric(18, 2);--> statement-breakpoint
ALTER TABLE "PositionSegment" ADD CONSTRAINT "PositionSegment_positionId_Position_id_fk" FOREIGN KEY ("positionId") REFERENCES "public"."Position"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ClaimHistory" ADD CONSTRAINT "ClaimHistory_segmentId_PositionSegment_id_fk" FOREIGN KEY ("segmentId") REFERENCES "public"."PositionSegment"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "PositionSnapshot" ADD CONSTRAINT "PositionSnapshot_segmentId_PositionSegment_id_fk" FOREIGN KEY ("segmentId") REFERENCES "public"."PositionSegment"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "RebalanceEvent" ADD CONSTRAINT "RebalanceEvent_closedSegmentId_PositionSegment_id_fk" FOREIGN KEY ("closedSegmentId") REFERENCES "public"."PositionSegment"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "RebalanceEvent" ADD CONSTRAINT "RebalanceEvent_newSegmentId_PositionSegment_id_fk" FOREIGN KEY ("newSegmentId") REFERENCES "public"."PositionSegment"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ClaimHistory" DROP COLUMN "txHash";--> statement-breakpoint
ALTER TABLE "Position" DROP COLUMN "lastRebalanceAt";--> statement-breakpoint
ALTER TABLE "Position" DROP COLUMN "trailingStopPercentage";--> statement-breakpoint
ALTER TABLE "Position" DROP COLUMN "timeBasedSLPercentage";--> statement-breakpoint
ALTER TABLE "Position" DROP COLUMN "volatilityAdjusted";--> statement-breakpoint
ALTER TABLE "Position" DROP COLUMN "cumulativeAbsolutePnlUSD";--> statement-breakpoint
ALTER TABLE "Position" DROP COLUMN "feeTokenXAmount";--> statement-breakpoint
ALTER TABLE "Position" DROP COLUMN "feeTokenYAmount";--> statement-breakpoint
ALTER TABLE "Position" DROP COLUMN "finalValueSol";--> statement-breakpoint
ALTER TABLE "Position" DROP COLUMN "feesEarnedInSol";--> statement-breakpoint
ALTER TABLE "Position" DROP COLUMN "pnlInSol";--> statement-breakpoint
ALTER TABLE "Position" DROP COLUMN "pnlInUsd";--> statement-breakpoint
ALTER TABLE "Position" DROP COLUMN "pnlPercentage";--> statement-breakpoint
ALTER TABLE "RebalanceEvent" DROP COLUMN "segmentPnlPct";--> statement-breakpoint
ALTER TABLE "RebalanceEvent" DROP COLUMN "oldValue";--> statement-breakpoint
ALTER TABLE "RebalanceEvent" DROP COLUMN "newValue";--> statement-breakpoint
ALTER TABLE "Position" ADD CONSTRAINT "Position_positionAddress_unique" UNIQUE("positionAddress");