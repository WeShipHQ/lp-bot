import {
  pgTable,
  text,
  timestamp,
  boolean,
  decimal,
  pgEnum,
  uuid,
  integer,
  jsonb,
} from "drizzle-orm/pg-core";
import { relations } from "drizzle-orm";

// ============================================================================
// ENUMS
// ============================================================================

export const strategyTypeEnum = pgEnum("StrategyType", [
  "SPOT",
  "CURVE",
  "BID_ASK",
]);

export const positionStatusEnum = pgEnum("PositionStatus", [
  "ACTIVE", // Position is open and earning
  "CLOSED", // User explicitly closed the position
  "LIQUIDATED", // Position was force-closed (future use)
]);

export const claimTypeEnum = pgEnum("ClaimType", [
  "MANUAL", // User manually claimed fees
  "REBALANCE", // Fees claimed during auto-rebalance
  "CLOSURE", // Fees claimed when closing position
]);

export const snapshotTypeEnum = pgEnum("SnapshotType", [
  "CREATION", // Snapshot at position creation
  "REBALANCE", // Snapshot when rebalancing
  "CLAIM", // Snapshot when claiming fees
  "CLOSURE", // Snapshot at position closure
  "PERIODIC", // Regular scheduled snapshot (hourly/daily)
]);

// ============================================================================
// CORE TABLES
// ============================================================================

/**
 * Users table - stores user profiles and preferences
 */
export const users = pgTable("User", {
  id: uuid("id").primaryKey().defaultRandom(),
  telegramId: text("telegramId").notNull().unique(),
  username: text("username"),

  // Wallet
  walletAddress: text("walletAddress").notNull().unique(),
  walletId: text("walletId").notNull().unique(), // Privy wallet ID

  // Default rebalancing settings (can be overridden per position)
  autoRebalanceEnabled: boolean("autoRebalanceEnabled").default(true),
  rebalanceThreshold: decimal("rebalanceThreshold", {
    precision: 5,
    scale: 2,
  }).default("20.00"), // 20%

  // Timestamps
  createdAt: timestamp("createdAt").notNull().defaultNow(),
  updatedAt: timestamp("updatedAt").notNull().defaultNow(),
});

/**
 * Positions table - represents the user's logical position
 *
 * This table tracks the ENTIRE lifecycle of a position from creation to closure,
 * even if it's rebalanced multiple times. Think of this as the "user's view" of their position.
 */
export const positions = pgTable("Position", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("userId")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),

  // ===== Position Identity =====
  positionAddress: text("positionAddress").notNull().unique(), // Current on-chain position address
  poolAddress: text("poolAddress").notNull(),
  dex: text("dex").notNull().default("meteora"),
  strategyType: strategyTypeEnum("strategyType").notNull(),

  // ===== Token Information =====
  tokenX: jsonb("tokenX")
    .$type<{
      symbol: string;
      mint: string;
      decimals: number;
      logoUri?: string;
    }>()
    .notNull(),
  tokenY: jsonb("tokenY")
    .$type<{
      symbol: string;
      mint: string;
      decimals: number;
      logoUri?: string;
    }>()
    .notNull(),

  // ===== Lifecycle Status =====
  status: positionStatusEnum("status").notNull().default("ACTIVE"),
  createdAt: timestamp("createdAt").notNull().defaultNow(),
  closedAt: timestamp("closedAt"),

  // ===== Initial Investment (NEVER CHANGES) =====
  // This is what the user originally put in - the baseline for PnL calculation
  initialValueUSD: decimal("initialValueUSD", {
    precision: 18,
    scale: 2,
  }).notNull(),
  initialValueSOL: decimal("initialValueSOL", {
    precision: 18,
    scale: 9,
  }).notNull(),
  initialTokenXAmount: decimal("initialTokenXAmount", {
    precision: 28,
    scale: 9,
  }).notNull(),
  initialTokenYAmount: decimal("initialTokenYAmount", {
    precision: 28,
    scale: 9,
  }).notNull(),
  initialTokenXPriceUSD: decimal("initialTokenXPriceUSD", {
    precision: 18,
    scale: 9,
  }).notNull(),
  initialTokenYPriceUSD: decimal("initialTokenYPriceUSD", {
    precision: 18,
    scale: 9,
  }).notNull(),

  // ===== Current Segment Tracking =====
  // When we rebalance, we increment this and start a new segment
  currentSegmentNumber: integer("currentSegmentNumber").notNull().default(1),
  currentSegmentInitialUSD: decimal("currentSegmentInitialUSD", {
    precision: 18,
    scale: 2,
  }).notNull(),
  currentSegmentStartAt: timestamp("currentSegmentStartAt")
    .notNull()
    .defaultNow(),

  // ===== Cumulative Performance Tracking =====
  // These accumulate across ALL segments (past + current)
  totalRealizedPnlUSD: decimal("totalRealizedPnlUSD", {
    precision: 18,
    scale: 2,
  })
    .notNull()
    .default("0"),
  totalFeesClaimedUSD: decimal("totalFeesClaimedUSD", {
    precision: 18,
    scale: 2,
  })
    .notNull()
    .default("0"),

  // ===== Final Values (Populated when position is CLOSED) =====
  finalValueUSD: decimal("finalValueUSD", { precision: 18, scale: 2 }),
  finalValueSOL: decimal("finalValueSOL", { precision: 18, scale: 9 }),
  finalTokenXAmount: decimal("finalTokenXAmount", { precision: 28, scale: 9 }),
  finalTokenYAmount: decimal("finalTokenYAmount", { precision: 28, scale: 9 }),
  finalTokenXPriceUSD: decimal("finalTokenXPriceUSD", {
    precision: 18,
    scale: 9,
  }),
  finalTokenYPriceUSD: decimal("finalTokenYPriceUSD", {
    precision: 18,
    scale: 9,
  }),

  // ===== Risk Management =====
  isRebalancingEnabled: boolean("isRebalancingEnabled").default(false),
  rebalanceThreshold: decimal("rebalanceThreshold", {
    precision: 5,
    scale: 2,
  }).default("20.0"), // % price deviation
  slPercentage: decimal("slPercentage", { precision: 5, scale: 2 }), // Stop-loss %
  tpPercentage: decimal("tpPercentage", { precision: 5, scale: 2 }), // Take-profit %

  // ===== Transaction References =====
  creationSignature: text("creationSignature").notNull(),
  closureSignature: text("closureSignature"),

  updatedAt: timestamp("updatedAt").notNull().defaultNow(),
});

/**
 * Position Segments table - tracks each physical on-chain position
 *
 * When auto-rebalancing happens, we:
 * 1. Close the current segment (set endTimestamp, finalValueUSD, realizedPnlUSD)
 * 2. Create a new segment with the new position address
 *
 * This allows us to track performance of each individual position separately,
 * then aggregate them for the total position PnL.
 */
export const positionSegments = pgTable("PositionSegment", {
  id: uuid("id").primaryKey().defaultRandom(),
  positionId: uuid("positionId")
    .notNull()
    .references(() => positions.id, { onDelete: "cascade" }),

  // ===== Segment Identity =====
  segmentNumber: integer("segmentNumber").notNull(), // 1, 2, 3, ... (increments with each rebalance)
  startTimestamp: timestamp("startTimestamp").notNull(),
  endTimestamp: timestamp("endTimestamp"), // NULL if this is the current active segment

  // ===== Segment Values =====
  initialValueUSD: decimal("initialValueUSD", {
    precision: 18,
    scale: 2,
  }).notNull(),
  finalValueUSD: decimal("finalValueUSD", { precision: 18, scale: 2 }), // Set when segment closes

  // ===== Segment PnL (Calculated when segment closes) =====
  realizedPnlUSD: decimal("realizedPnlUSD", { precision: 18, scale: 2 }),
  realizedPnlPercentage: decimal("realizedPnlPercentage", {
    precision: 10,
    scale: 4,
  }),

  // ===== Fees Claimed During This Segment =====
  feesClaimedUSD: decimal("feesClaimedUSD", {
    precision: 18,
    scale: 2,
  }).default("0"),

  // ===== Closure Information =====
  closureReason: text("closureReason"), // "rebalance", "user_close", "stop_loss", "take_profit"
  closureSignature: text("closureSignature"),

  // ===== Position Addresses =====
  startPositionAddress: text("startPositionAddress").notNull(), // The on-chain position address for this segment
  endPositionAddress: text("endPositionAddress"), // If rebalanced to a new position

  createdAt: timestamp("createdAt").notNull().defaultNow(),
});

/**
 * Claim History table - tracks all fee claims
 *
 * Fees can be claimed:
 * 1. Manually by the user (MANUAL)
 * 2. Automatically during rebalancing (REBALANCE)
 * 3. When closing the position (CLOSURE)
 */
export const claimHistory = pgTable("ClaimHistory", {
  id: uuid("id").primaryKey().defaultRandom(),
  positionId: uuid("positionId")
    .notNull()
    .references(() => positions.id, { onDelete: "cascade" }),
  segmentId: uuid("segmentId").references(() => positionSegments.id), // Which segment this claim belongs to

  // ===== Claim Details =====
  timestamp: timestamp("timestamp").notNull().defaultNow(),
  claimType: claimTypeEnum("claimType").notNull().default("MANUAL"),

  // ===== Claimed Amounts (Raw token amounts) =====
  claimedTokenXAmount: decimal("claimedTokenXAmount", {
    precision: 28,
    scale: 9,
  }).notNull(),
  claimedTokenYAmount: decimal("claimedTokenYAmount", {
    precision: 28,
    scale: 9,
  }).notNull(),
  claimedRewardsOther: jsonb("claimedRewardsOther"), // For other reward tokens (future)

  // ===== USD Values at Claim Time =====
  claimedUSDValue: decimal("claimedUSDValue", {
    precision: 18,
    scale: 2,
  }).notNull(),
  tokenXPriceUSD: decimal("tokenXPriceUSD", {
    precision: 18,
    scale: 9,
  }).notNull(),
  tokenYPriceUSD: decimal("tokenYPriceUSD", {
    precision: 18,
    scale: 9,
  }).notNull(),

  // ===== Post-Swap Values (if user chose to swap fees to SOL) =====
  solReceived: decimal("solReceived", { precision: 18, scale: 9 }),
  solPriceUSD: decimal("solPriceUSD", { precision: 18, scale: 9 }),

  // ===== Transaction Reference =====
  transactionSignature: text("transactionSignature").notNull(),

  // ===== Context =====
  isDuringRebalance: boolean("isDuringRebalance").default(false),
  notes: text("notes"),

  createdAt: timestamp("createdAt").notNull().defaultNow(),
});

/**
 * Rebalance Events table - tracks when and why rebalancing occurred
 *
 * A rebalance event represents:
 * 1. Closing the old segment
 * 2. Claiming fees
 * 3. Opening a new segment with a new on-chain position
 */
export const rebalanceEvents = pgTable("RebalanceEvent", {
  id: uuid("id").primaryKey().defaultRandom(),
  positionId: uuid("positionId")
    .notNull()
    .references(() => positions.id, { onDelete: "cascade" }),

  // ===== Timing =====
  timestamp: timestamp("timestamp").notNull().defaultNow(),
  triggerReason: text("triggerReason").notNull(), // "out_of_range", "stop_loss", "take_profit"

  // ===== Position Addresses =====
  oldPositionAddress: text("oldPositionAddress").notNull(),
  newPositionAddress: text("newPositionAddress").notNull(),

  // ===== Segment Closure Data =====
  closedSegmentId: uuid("closedSegmentId").references(
    () => positionSegments.id
  ),
  segmentInitialUSD: decimal("segmentInitialUSD", {
    precision: 18,
    scale: 2,
  }).notNull(),
  segmentFinalUSD: decimal("segmentFinalUSD", {
    precision: 18,
    scale: 2,
  }).notNull(),
  segmentPnlUSD: decimal("segmentPnlUSD", {
    precision: 18,
    scale: 2,
  }).notNull(),
  segmentPnlPercentage: decimal("segmentPnlPercentage", {
    precision: 10,
    scale: 4,
  }).notNull(),

  // ===== Fees Collected During Rebalance =====
  feesCollectedUSD: decimal("feesCollectedUSD", {
    precision: 18,
    scale: 2,
  }).default("0"),

  // ===== New Segment Data =====
  newSegmentId: uuid("newSegmentId").references(() => positionSegments.id),
  newSegmentInitialUSD: decimal("newSegmentInitialUSD", {
    precision: 18,
    scale: 2,
  }).notNull(),

  // ===== Transaction References =====
  closeTransactionSignature: text("closeTransactionSignature"),
  createTransactionSignature: text("createTransactionSignature"),

  // ===== Gas and Slippage Costs =====
  totalGasCostSOL: decimal("totalGasCostSOL", { precision: 18, scale: 9 }),
  slippageCostUSD: decimal("slippageCostUSD", { precision: 18, scale: 2 }),

  notes: text("notes"),
  createdAt: timestamp("createdAt").notNull().defaultNow(),
});

/**
 * Position Snapshots table - regular snapshots of position state
 *
 * This is for historical tracking and analytics.
 * Take snapshots:
 * 1. On position creation
 * 2. When fees are claimed
 * 3. When rebalancing occurs
 * 4. Periodically (e.g., every hour or day)
 * 5. On position closure
 */
export const positionSnapshots = pgTable("PositionSnapshot", {
  id: uuid("id").primaryKey().defaultRandom(),
  positionId: uuid("positionId")
    .notNull()
    .references(() => positions.id, { onDelete: "cascade" }),
  segmentId: uuid("segmentId").references(() => positionSegments.id),

  // ===== Snapshot Timing =====
  snapshotTimestamp: timestamp("snapshotTimestamp").notNull().defaultNow(),
  snapshotType: snapshotTypeEnum("snapshotType").notNull(),

  // ===== Current Position Value =====
  currentValueUSD: decimal("currentValueUSD", {
    precision: 18,
    scale: 2,
  }).notNull(),
  tokenXAmount: decimal("tokenXAmount", { precision: 28, scale: 9 }).notNull(),
  tokenYAmount: decimal("tokenYAmount", { precision: 28, scale: 9 }).notNull(),

  // ===== Unclaimed Fees (At Snapshot Time) =====
  unclaimedFeesX: decimal("unclaimedFeesX", {
    precision: 28,
    scale: 9,
  }).notNull(),
  unclaimedFeesY: decimal("unclaimedFeesY", {
    precision: 28,
    scale: 9,
  }).notNull(),
  unclaimedFeesUSD: decimal("unclaimedFeesUSD", {
    precision: 18,
    scale: 2,
  }).notNull(),

  // ===== PnL at Snapshot Time =====
  unrealizedPnlUSD: decimal("unrealizedPnlUSD", {
    precision: 18,
    scale: 2,
  }).notNull(),
  unrealizedPnlPercentage: decimal("unrealizedPnlPercentage", {
    precision: 10,
    scale: 4,
  }).notNull(),
  totalPnlUSD: decimal("totalPnlUSD", { precision: 18, scale: 2 }).notNull(), // Unrealized + Realized + Fees
  totalPnlPercentage: decimal("totalPnlPercentage", {
    precision: 10,
    scale: 4,
  }).notNull(),

  // ===== Token Prices at Snapshot =====
  tokenXPriceUSD: decimal("tokenXPriceUSD", {
    precision: 18,
    scale: 9,
  }).notNull(),
  tokenYPriceUSD: decimal("tokenYPriceUSD", {
    precision: 18,
    scale: 9,
  }).notNull(),
  solPriceUSD: decimal("solPriceUSD", { precision: 18, scale: 9 }).notNull(),

  createdAt: timestamp("createdAt").notNull().defaultNow(),
});

// ============================================================================
// RELATIONS
// ============================================================================

export const usersRelations = relations(users, ({ many }) => ({
  positions: many(positions),
}));

export const positionsRelations = relations(positions, ({ one, many }) => ({
  user: one(users, {
    fields: [positions.userId],
    references: [users.id],
  }),
  segments: many(positionSegments),
  claims: many(claimHistory),
  rebalanceEvents: many(rebalanceEvents),
  snapshots: many(positionSnapshots),
}));

export const positionSegmentsRelations = relations(
  positionSegments,
  ({ one, many }) => ({
    position: one(positions, {
      fields: [positionSegments.positionId],
      references: [positions.id],
    }),
    claims: many(claimHistory),
    snapshots: many(positionSnapshots),
  })
);

export const claimHistoryRelations = relations(claimHistory, ({ one }) => ({
  position: one(positions, {
    fields: [claimHistory.positionId],
    references: [positions.id],
  }),
  segment: one(positionSegments, {
    fields: [claimHistory.segmentId],
    references: [positionSegments.id],
  }),
}));

export const rebalanceEventsRelations = relations(
  rebalanceEvents,
  ({ one }) => ({
    position: one(positions, {
      fields: [rebalanceEvents.positionId],
      references: [positions.id],
    }),
    closedSegment: one(positionSegments, {
      fields: [rebalanceEvents.closedSegmentId],
      references: [positionSegments.id],
    }),
    newSegment: one(positionSegments, {
      fields: [rebalanceEvents.newSegmentId],
      references: [positionSegments.id],
    }),
  })
);

export const positionSnapshotsRelations = relations(
  positionSnapshots,
  ({ one }) => ({
    position: one(positions, {
      fields: [positionSnapshots.positionId],
      references: [positions.id],
    }),
    segment: one(positionSegments, {
      fields: [positionSnapshots.segmentId],
      references: [positionSegments.id],
    }),
  })
);

// ============================================================================
// TYPE EXPORTS
// ============================================================================

export type User = typeof users.$inferSelect;
export type NewUser = typeof users.$inferInsert;
export type Position = typeof positions.$inferSelect;
export type NewPosition = typeof positions.$inferInsert;
export type PositionSegment = typeof positionSegments.$inferSelect;
export type NewPositionSegment = typeof positionSegments.$inferInsert;
export type ClaimHistory = typeof claimHistory.$inferSelect;
export type NewClaimHistory = typeof claimHistory.$inferInsert;
export type RebalanceEvent = typeof rebalanceEvents.$inferSelect;
export type NewRebalanceEvent = typeof rebalanceEvents.$inferInsert;
export type PositionSnapshot = typeof positionSnapshots.$inferSelect;
export type NewPositionSnapshot = typeof positionSnapshots.$inferInsert;

export type StrategyType = (typeof strategyTypeEnum.enumValues)[number];
export type PositionStatus = (typeof positionStatusEnum.enumValues)[number];
export type ClaimType = (typeof claimTypeEnum.enumValues)[number];
export type SnapshotType = (typeof snapshotTypeEnum.enumValues)[number];
