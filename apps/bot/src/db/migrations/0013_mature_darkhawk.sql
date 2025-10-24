ALTER TABLE "ClaimHistory" ALTER COLUMN "claimedUSDValue" SET DATA TYPE numeric(18, 6);--> statement-breakpoint
ALTER TABLE "PositionSegment" ALTER COLUMN "initialValueUSD" SET DATA TYPE numeric(18, 6);--> statement-breakpoint
ALTER TABLE "PositionSegment" ALTER COLUMN "finalValueUSD" SET DATA TYPE numeric(18, 6);--> statement-breakpoint
ALTER TABLE "PositionSegment" ALTER COLUMN "realizedPnlUSD" SET DATA TYPE numeric(18, 6);--> statement-breakpoint
ALTER TABLE "PositionSegment" ALTER COLUMN "feesClaimedUSD" SET DATA TYPE numeric(18, 6);--> statement-breakpoint
ALTER TABLE "PositionSegment" ALTER COLUMN "feesClaimedUSD" SET DEFAULT '0';--> statement-breakpoint
ALTER TABLE "PositionSnapshot" ALTER COLUMN "currentValueUSD" SET DATA TYPE numeric(18, 6);--> statement-breakpoint
ALTER TABLE "PositionSnapshot" ALTER COLUMN "unclaimedFeesUSD" SET DATA TYPE numeric(18, 6);--> statement-breakpoint
ALTER TABLE "PositionSnapshot" ALTER COLUMN "unrealizedPnlUSD" SET DATA TYPE numeric(18, 6);--> statement-breakpoint
ALTER TABLE "PositionSnapshot" ALTER COLUMN "totalPnlUSD" SET DATA TYPE numeric(18, 6);--> statement-breakpoint
ALTER TABLE "Position" ALTER COLUMN "initialValueUSD" SET DATA TYPE numeric(18, 6);--> statement-breakpoint
ALTER TABLE "Position" ALTER COLUMN "finalValueUSD" SET DATA TYPE numeric(18, 6);--> statement-breakpoint
ALTER TABLE "RebalanceEvent" ALTER COLUMN "segmentInitialUSD" SET DATA TYPE numeric(18, 6);--> statement-breakpoint
ALTER TABLE "RebalanceEvent" ALTER COLUMN "segmentFinalUSD" SET DATA TYPE numeric(18, 6);--> statement-breakpoint
ALTER TABLE "RebalanceEvent" ALTER COLUMN "segmentPnlUSD" SET DATA TYPE numeric(18, 6);--> statement-breakpoint
ALTER TABLE "RebalanceEvent" ALTER COLUMN "feesCollectedUSD" SET DATA TYPE numeric(18, 6);--> statement-breakpoint
ALTER TABLE "RebalanceEvent" ALTER COLUMN "feesCollectedUSD" SET DEFAULT '0';--> statement-breakpoint
ALTER TABLE "RebalanceEvent" ALTER COLUMN "newSegmentInitialUSD" SET DATA TYPE numeric(18, 6);--> statement-breakpoint
ALTER TABLE "RebalanceEvent" ALTER COLUMN "slippageCostUSD" SET DATA TYPE numeric(18, 6);--> statement-breakpoint
ALTER TABLE "PendingTransaction" DROP COLUMN "metadata";