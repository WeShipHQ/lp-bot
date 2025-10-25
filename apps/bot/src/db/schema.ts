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
import { Token } from "@/types/token.types";

// Enums
export const strategyTypeEnum = pgEnum("StrategyType", [
  "DLMM",
  "DAMM",
  "CONCENTRATED",
]);
export const positionStatusEnum = pgEnum("PositionStatus", [
  "ACTIVE",
  "CLOSED",
  "REBALANCING",
]);
export const transactionTypeEnum = pgEnum("TransactionType", [
  "DEPOSIT",
  "WITHDRAW",
  "REBALANCE",
  "FEE_COLLECTION",
]);
export const transactionStatusEnum = pgEnum("TransactionStatus", [
  "PENDING",
  "CONFIRMED",
  "FAILED",
]);
export const rebalanceStrategyEnum = pgEnum("RebalanceStrategy", [
  "STANDARD",
  "DIP_PROTECTION",
]);
export const pointTypeEnum = pgEnum("PointType", [
  "REFERRAL_BONUS",
  "FEE_EARNING",
  "ACTIVITY_REWARD",
]);

export const operationTypeEnum = pgEnum("OperationType", [
  "CREATE_POSITION",
  "CLOSE_POSITION",
  "ADD_LIQUIDITY",
  "REMOVE_LIQUIDITY",
  "CLAIM_FEES",
  "REBALANCE",
]);

export const pendingTransactionStatusEnum = pgEnum("PendingTransactionStatus", [
  "PENDING",
  "PROCESSING",
  "COMPLETED",
  "FAILED",
  "RETRY",
]);

export const claimTypeEnum = pgEnum("ClaimType", [
  "manual",
  "rebalance",
  "closure",
]);

export const snapshotTypeEnum = pgEnum("SnapshotType", [
  "creation",
  "claim",
  "rebalance",
  "closure",
  "periodic",
]);

// Tables
export const users = pgTable("User", { 
  id: uuid("id").primaryKey().defaultRandom(),
  telegramId: text("telegramId").notNull().unique(),
  walletId: text("walletId").unique().notNull(),
  username: text("username"),
  walletAddress: text("walletAddress").notNull().unique(),
  autoRebalanceEnabled: boolean("autoRebalanceEnabled").notNull().default(true),
  rebalanceThreshold: decimal("rebalanceThreshold", { precision: 5, scale: 2 })
    .notNull()
    .default("5.00"),
  rebalanceStrategy: rebalanceStrategyEnum("rebalanceStrategy")
    .notNull()
    .default("STANDARD"),
  balancedPositionBinRange: integer("balancedPositionBinRange")
    .notNull()
    .default(10),
  createdAt: timestamp("createdAt").notNull().defaultNow(),
  updatedAt: timestamp("updatedAt").notNull().defaultNow(),
});

export const wallets = pgTable("Wallet", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("userId")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  address: text("address").notNull(),
  privateKeyEncrypted: text("privateKeyEncrypted").notNull(),
  isActive: boolean("isActive").notNull().default(false),
  createdAt: timestamp("createdAt").notNull().defaultNow(),
  updatedAt: timestamp("updatedAt").notNull().defaultNow(),
});

// Enhanced positions table
export const positions = pgTable("Position", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("userId")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),

  // Position identification
  positionAddress: text("positionAddress").notNull().unique(),
  poolAddress: text("poolAddress").notNull(),
  dex: text("dex").notNull().default("meteora"),
  strategyType: strategyTypeEnum("strategyType").notNull(),

  // Token information
  tokenX: jsonb("tokenX").$type<Token>().notNull(),
  tokenY: jsonb("tokenY").$type<Token>().notNull(),

  // Position lifecycle
  status: positionStatusEnum("status").notNull().default("ACTIVE"),
  createdAt: timestamp("createdAt").notNull().defaultNow(),
  closedAt: timestamp("closedAt"),

  // Initial investment tracking
  initialValueUSD: decimal("initialValueUSD", {
    precision: 18,
    scale: 6,
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

  // Current segment tracking (for rebalancing)
  currentSegmentNumber: integer("currentSegmentNumber").notNull().default(1),
  currentSegmentInitialUSD: decimal("currentSegmentInitialUSD", {
    precision: 18,
    scale: 2,
  }).notNull(),
  currentSegmentStartAt: timestamp("currentSegmentStartAt")
    .notNull()
    .defaultNow(),

  // Cumulative PnL tracking
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

  // Final values (populated when closed)
  finalValueUSD: decimal("finalValueUSD", { precision: 18, scale: 6 }),
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

  // Risk management
  isRebalancingEnabled: boolean("isRebalancingEnabled").default(false),
  rebalanceThreshold: decimal("rebalanceThreshold", {
    precision: 5,
    scale: 2,
  }).default("20.0"),
  slPercentage: decimal("slPercentage", { precision: 5, scale: 2 }),
  tpPercentage: decimal("tpPercentage", { precision: 5, scale: 2 }),

  // Transaction references
  creationSignature: text("creationSignature").notNull(),
  closureSignature: text("closureSignature"),

  updatedAt: timestamp("updatedAt").notNull().defaultNow(),
});

// Position segments table for rebalancing tracking
export const positionSegments = pgTable("PositionSegment", {
  id: uuid("id").primaryKey().defaultRandom(),
  positionId: uuid("positionId")
    .notNull()
    .references(() => positions.id, { onDelete: "cascade" }),

  // Segment identification
  segmentNumber: integer("segmentNumber").notNull(),
  startTimestamp: timestamp("startTimestamp").notNull(),
  endTimestamp: timestamp("endTimestamp"),

  // Segment values
  initialValueUSD: decimal("initialValueUSD", {
    precision: 18,
    scale: 6,
  }).notNull(),
  finalValueUSD: decimal("finalValueUSD", { precision: 18, scale: 6 }),

  // Segment PnL
  realizedPnlUSD: decimal("realizedPnlUSD", { precision: 18, scale: 6 }),
  realizedPnlPercentage: decimal("realizedPnlPercentage", {
    precision: 10,
    scale: 4,
  }),

  // Fees claimed during this segment
  feesClaimedUSD: decimal("feesClaimedUSD", {
    precision: 18,
    scale: 6,
  }).default("0"),

  // Closure reason
  closureReason: text("closureReason"),
  closureSignature: text("closureSignature"),

  // Position state at segment start/end
  startPositionAddress: text("startPositionAddress").notNull(),
  endPositionAddress: text("endPositionAddress"),

  createdAt: timestamp("createdAt").notNull().defaultNow(),
});

// Enhanced claim history table
export const claimHistory = pgTable("ClaimHistory", {
  id: uuid("id").primaryKey().defaultRandom(),
  positionId: uuid("positionId")
    .notNull()
    .references(() => positions.id, { onDelete: "cascade" }),
  segmentId: uuid("segmentId").references(() => positionSegments.id),

  // Claim details
  timestamp: timestamp("timestamp").notNull().defaultNow(),
  claimType: claimTypeEnum("claimType").notNull().default("manual"),

  // Claimed amounts (raw token amounts)
  claimedTokenXAmount: decimal("claimedTokenXAmount", {
    precision: 28,
    scale: 9,
  }).notNull(),
  claimedTokenYAmount: decimal("claimedTokenYAmount", {
    precision: 28,
    scale: 9,
  }).notNull(),
  claimedRewardsOther: jsonb("claimedRewardsOther"),

  // USD values at claim time
  claimedUSDValue: decimal("claimedUSDValue", {
    precision: 18,
    scale: 6,
  }).notNull(),
  tokenXPriceUSD: decimal("tokenXPriceUSD", {
    precision: 18,
    scale: 9,
  }).notNull(),
  tokenYPriceUSD: decimal("tokenYPriceUSD", {
    precision: 18,
    scale: 9,
  }).notNull(),

  // Post-swap values (if swapped to SOL)
  solReceived: decimal("solReceived", { precision: 18, scale: 9 }),
  solPriceUSD: decimal("solPriceUSD", { precision: 18, scale: 9 }),

  // Transaction reference
  transactionSignature: text("transactionSignature").notNull(),

  // Context
  isDuringRebalance: boolean("isDuringRebalance").default(false),
  notes: text("notes"),

  createdAt: timestamp("createdAt").notNull().defaultNow(),
});

// Enhanced rebalance events table
export const rebalanceEvents = pgTable("RebalanceEvent", {
  id: uuid("id").primaryKey().defaultRandom(),
  positionId: uuid("positionId")
    .notNull()
    .references(() => positions.id, { onDelete: "cascade" }),

  // Rebalance timing
  timestamp: timestamp("timestamp").notNull().defaultNow(),
  triggerReason: text("triggerReason").notNull(),

  // Position addresses
  oldPositionAddress: text("oldPositionAddress").notNull(),
  newPositionAddress: text("newPositionAddress").notNull(),

  // Segment closure data
  closedSegmentId: uuid("closedSegmentId").references(
    () => positionSegments.id
  ),
  segmentInitialUSD: decimal("segmentInitialUSD", {
    precision: 18,
    scale: 6,
  }).notNull(),
  segmentFinalUSD: decimal("segmentFinalUSD", {
    precision: 18,
    scale: 6,
  }).notNull(),
  segmentPnlUSD: decimal("segmentPnlUSD", {
    precision: 18,
    scale: 6,
  }).notNull(),
  segmentPnlPercentage: decimal("segmentPnlPercentage", {
    precision: 10,
    scale: 4,
  }).notNull(),

  // Fees collected during rebalance
  feesCollectedUSD: decimal("feesCollectedUSD", {
    precision: 18,
    scale: 6,
  }).default("0"),

  // New segment data
  newSegmentId: uuid("newSegmentId").references(() => positionSegments.id),
  newSegmentInitialUSD: decimal("newSegmentInitialUSD", {
    precision: 18,
    scale: 6,
  }).notNull(),

  // Transaction references
  closeTransactionSignature: text("closeTransactionSignature"),
  createTransactionSignature: text("createTransactionSignature"),

  // Gas and slippage costs
  totalGasCostSOL: decimal("totalGasCostSOL", { precision: 18, scale: 9 }),
  slippageCostUSD: decimal("slippageCostUSD", { precision: 18, scale: 6 }),

  notes: text("notes"),
  createdAt: timestamp("createdAt").notNull().defaultNow(),
});

// Enhanced position snapshots table
export const positionSnapshots = pgTable("PositionSnapshot", {
  id: uuid("id").primaryKey().defaultRandom(),
  positionId: uuid("positionId")
    .notNull()
    .references(() => positions.id, { onDelete: "cascade" }),
  segmentId: uuid("segmentId").references(() => positionSegments.id),

  // Snapshot timing
  snapshotTimestamp: timestamp("snapshotTimestamp").notNull().defaultNow(),
  snapshotType: snapshotTypeEnum("snapshotType").notNull(),

  // Current position value
  currentValueUSD: decimal("currentValueUSD", {
    precision: 18,
    scale: 6,
  }).notNull(),
  tokenXAmount: decimal("tokenXAmount", { precision: 28, scale: 9 }).notNull(),
  tokenYAmount: decimal("tokenYAmount", { precision: 28, scale: 9 }).notNull(),

  // Unclaimed fees at snapshot time
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
    scale: 6,
  }).notNull(),

  // PnL at snapshot time
  unrealizedPnlUSD: decimal("unrealizedPnlUSD", {
    precision: 18,
    scale: 6,
  }).notNull(),
  unrealizedPnlPercentage: decimal("unrealizedPnlPercentage", {
    precision: 10,
    scale: 4,
  }).notNull(),
  totalPnlUSD: decimal("totalPnlUSD", { precision: 18, scale: 6 }).notNull(),
  totalPnlPercentage: decimal("totalPnlPercentage", {
    precision: 10,
    scale: 4,
  }).notNull(),

  // Token prices at snapshot
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

export const transactions = pgTable("Transaction", {
  id: uuid("id").primaryKey().defaultRandom(),
  positionId: uuid("positionId")
    .notNull()
    .references(() => positions.id, { onDelete: "cascade" }),
  type: transactionTypeEnum("type").notNull(),
  amount: decimal("amount", { precision: 20, scale: 8 }).notNull(),
  tokenAddress: text("tokenAddress").notNull(),
  txHash: text("txHash"),
  status: transactionStatusEnum("status").notNull().default("PENDING"),
  errorMessage: text("errorMessage"),
  createdAt: timestamp("createdAt").notNull().defaultNow(),
  updatedAt: timestamp("updatedAt").notNull().defaultNow(),
});

export const referrals = pgTable("Referral", {
  id: uuid("id").primaryKey().defaultRandom(),
  referrerId: text("referrerId").notNull(),
  referredId: text("referredId").notNull(),
  referralCode: text("referralCode").notNull(),
  status: text("status").notNull().default("ACTIVE"),
  feesEarned: decimal("feesEarned", { precision: 20, scale: 8 })
    .notNull()
    .default("0"),
  pointsEarned: integer("pointsEarned").notNull().default(0),
  createdAt: timestamp("createdAt").notNull().defaultNow(),
  updatedAt: timestamp("updatedAt").notNull().defaultNow(),
});

export const points = pgTable("Points", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: text("userId").notNull(),
  amount: integer("amount").notNull(),
  type: pointTypeEnum("type").notNull(),
  description: text("description"),
  referralId: uuid("referralId").references(() => referrals.id),
  createdAt: timestamp("createdAt").notNull().defaultNow(),
});

export const pendingTransactions = pgTable("PendingTransaction", {
  id: uuid("id").primaryKey().defaultRandom(),
  signature: text("signature").notNull().unique(),
  operationType: operationTypeEnum("operationType").notNull(),
  userId: uuid("userId")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  status: pendingTransactionStatusEnum("status").notNull().default("PENDING"),
  metadata: jsonb("metadata"),
  retryCount: integer("retryCount").notNull().default(0),
  maxRetries: integer("maxRetries").notNull().default(3),
  lastProcessedAt: timestamp("lastProcessedAt"),
  errorMessage: text("errorMessage"),
  createdAt: timestamp("createdAt").notNull().defaultNow(),
  updatedAt: timestamp("updatedAt").notNull().defaultNow(),
});

// Relations
export const usersRelations = relations(users, ({ many }) => ({
  wallets: many(wallets),
  positions: many(positions),
  referrals: many(referrals, { relationName: "referrer" }),
  referredBy: many(referrals, { relationName: "referred" }),
  points: many(points),
}));

export const walletsRelations = relations(wallets, ({ one }) => ({
  user: one(users, {
    fields: [wallets.userId],
    references: [users.id],
  }),
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
  transactions: many(transactions),
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

export const transactionsRelations = relations(transactions, ({ one }) => ({
  position: one(positions, {
    fields: [transactions.positionId],
    references: [positions.id],
  }),
}));

export const referralsRelations = relations(referrals, ({ one, many }) => ({
  referrer: one(users, {
    fields: [referrals.referrerId],
    references: [users.telegramId],
    relationName: "referrer",
  }),
  referred: one(users, {
    fields: [referrals.referredId],
    references: [users.telegramId],
    relationName: "referred",
  }),
  points: many(points),
}));

export const pointsRelations = relations(points, ({ one }) => ({
  user: one(users, {
    fields: [points.userId],
    references: [users.telegramId],
  }),
  referral: one(referrals, {
    fields: [points.referralId],
    references: [referrals.id],
  }),
}));

export const pendingTransactionsRelations = relations(
  pendingTransactions,
  ({ one }) => ({
    user: one(users, {
      fields: [pendingTransactions.userId],
      references: [users.id],
    }),
  })
);

// Export types
export type User = typeof users.$inferSelect;
export type NewUser = typeof users.$inferInsert;
export type Wallet = typeof wallets.$inferSelect;
export type NewWallet = typeof wallets.$inferInsert;
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
export type Transaction = typeof transactions.$inferSelect;
export type NewTransaction = typeof transactions.$inferInsert;
export type Referral = typeof referrals.$inferSelect;
export type NewReferral = typeof referrals.$inferInsert;
export type Points = typeof points.$inferSelect;
export type NewPoints = typeof points.$inferInsert;
export type PendingTransaction = typeof pendingTransactions.$inferSelect;
export type NewPendingTransaction = typeof pendingTransactions.$inferInsert;

// Export enum types
export type StrategyType = (typeof strategyTypeEnum.enumValues)[number];
export type PositionStatus = (typeof positionStatusEnum.enumValues)[number];
export type TransactionType = (typeof transactionTypeEnum.enumValues)[number];
export type TransactionStatus =
  (typeof transactionStatusEnum.enumValues)[number];
export type RebalanceStrategy =
  (typeof rebalanceStrategyEnum.enumValues)[number];
export type PointType = (typeof pointTypeEnum.enumValues)[number];
export type OperationType = (typeof operationTypeEnum.enumValues)[number];
export type PendingTransactionStatus =
  (typeof pendingTransactionStatusEnum.enumValues)[number];
export type ClaimType = (typeof claimTypeEnum.enumValues)[number];
export type SnapshotType = (typeof snapshotTypeEnum.enumValues)[number];
