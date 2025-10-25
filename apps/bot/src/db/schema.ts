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
import { relations, sql } from "drizzle-orm";
import { Token } from "@/types/token.types";

// Enums
export const strategyTypeEnum = pgEnum("strategy_type", [
  "DLMM",
  "DAMM",
  "CONCENTRATED",
]);
export const positionStatusEnum = pgEnum("position_status", [
  "ACTIVE",
  "CLOSED",
  "REBALANCING",
]);
export const transactionTypeEnum = pgEnum("transaction_type", [
  "DEPOSIT",
  "WITHDRAW",
  "REBALANCE",
  "FEE_COLLECTION",
]);
export const transactionStatusEnum = pgEnum("transaction_status", [
  "PENDING",
  "CONFIRMED",
  "FAILED",
]);
export const rebalanceStrategyEnum = pgEnum("rebalance_strategy", [
  "STANDARD",
  "DIP_PROTECTION",
]);
export const pointTypeEnum = pgEnum("point_type", [
  "REFERRAL_BONUS",
  "FEE_EARNING",
  "ACTIVITY_REWARD",
]);

export const operationTypeEnum = pgEnum("operation_type", [
  "CREATE_POSITION",
  "CLOSE_POSITION",
  "ADD_LIQUIDITY",
  "REMOVE_LIQUIDITY",
  "CLAIM_FEES",
  "REBALANCE",
]);

export const pendingTransactionStatusEnum = pgEnum(
  "pending_transaction_status",
  ["PENDING", "PROCESSING", "COMPLETED", "FAILED", "RETRY"]
);

export const claimTypeEnum = pgEnum("claim_type", [
  "manual",
  "rebalance",
  "closure",
]);

export const snapshotTypeEnum = pgEnum("snapshot_type", [
  "creation",
  "claim",
  "rebalance",
  "closure",
  "periodic",
]);

const timestamps = {
  createdAt: timestamp("created_at", { withTimezone: true, mode: "string" })
    .default(sql`(now() AT TIME ZONE 'utc'::text)`)
    .notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true, mode: "string" })
    .default(sql`(now() AT TIME ZONE 'utc'::text)`)
    .notNull()
    .$onUpdate(() => sql`(now() AT TIME ZONE 'utc'::text)`),
};

// Tables
export const users = pgTable("users", {
  id: uuid("id").primaryKey().defaultRandom(),
  telegramId: text("telegram_id").notNull().unique(),
  walletId: text("wallet_id").unique().notNull(),
  // privyUserId: text("privy_user_id").notNull().unique(),
  username: text("username"),
  walletAddress: text("wallet_address").notNull().unique(),
  autoRebalanceEnabled: boolean("auto_rebalance_enabled")
    .notNull()
    .default(true),
  rebalanceThreshold: decimal("rebalance_threshold", { precision: 5, scale: 2 })
    .notNull()
    .default("5.00"),
  rebalanceStrategy: rebalanceStrategyEnum("rebalance_strategy")
    .notNull()
    .default("STANDARD"),
  balancedPositionBinRange: integer("balanced_position_bin_range")
    .notNull()
    .default(10),
  ...timestamps,
});

export const wallets = pgTable("wallets", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  address: text("address").notNull(),
  privateKeyEncrypted: text("private_key_encrypted").notNull(),
  isActive: boolean("is_active").notNull().default(false),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const positions = pgTable("positions", {
  // id: uuid("id").primaryKey().defaultRandom(),
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),

  // Position identification
  positionAddress: text("position_address").notNull().unique(),
  poolAddress: text("pool_address").notNull(),
  dex: text("dex").notNull().default("meteora"),
  strategyType: strategyTypeEnum("strategy_type").notNull(),

  // Token information
  tokenX: jsonb("token_x").$type<Token>().notNull(),
  tokenY: jsonb("token_y").$type<Token>().notNull(),

  // Position lifecycle
  status: positionStatusEnum("status").notNull().default("ACTIVE"),
  closedAt: timestamp("closed_at", { withTimezone: true }),

  // Initial investment tracking
  initialValueUSD: decimal("initial_value_usd", {
    precision: 18,
    scale: 6,
  }).notNull(),
  initialValueSOL: decimal("initial_value_sol", {
    precision: 18,
    scale: 9,
  }).notNull(),
  initialTokenXAmount: decimal("initial_token_x_amount", {
    precision: 28,
    scale: 9,
  }).notNull(),
  initialTokenYAmount: decimal("initial_token_y_amount", {
    precision: 28,
    scale: 9,
  }).notNull(),
  initialTokenXPriceUSD: decimal("initial_token_x_price_usd", {
    precision: 18,
    scale: 9,
  }).notNull(),
  initialTokenYPriceUSD: decimal("initial_token_y_price_usd", {
    precision: 18,
    scale: 9,
  }).notNull(),

  // Current segment tracking (for rebalancing)
  currentSegmentNumber: integer("current_segment_number").notNull().default(1),
  currentSegmentInitialUSD: decimal("current_segment_initial_usd", {
    precision: 18,
    scale: 6,
  }).notNull(),
  currentSegmentStartAt: timestamp("current_segment_start_at", {
    withTimezone: true,
  })
    .notNull()
    .defaultNow(),

  // Cumulative PnL tracking
  totalRealizedPnlUSD: decimal("total_realized_pnl_usd", {
    precision: 18,
    scale: 6,
  })
    .notNull()
    .default("0"),
  totalFeesClaimedUSD: decimal("total_fees_claimed_usd", {
    precision: 18,
    scale: 6,
  })
    .notNull()
    .default("0"),

  // Final values (populated when closed)
  finalValueUSD: decimal("final_value_usd", { precision: 18, scale: 6 }),
  finalValueSOL: decimal("final_value_sol", { precision: 18, scale: 9 }),
  finalTokenXAmount: decimal("final_token_x_amount", {
    precision: 28,
    scale: 9,
  }),
  finalTokenYAmount: decimal("final_token_y_amount", {
    precision: 28,
    scale: 9,
  }),
  finalTokenXPriceUSD: decimal("final_token_x_price_usd", {
    precision: 18,
    scale: 9,
  }),
  finalTokenYPriceUSD: decimal("final_token_y_price_usd", {
    precision: 18,
    scale: 9,
  }),

  // Risk management
  isRebalancingEnabled: boolean("is_rebalancing_enabled").default(false),
  rebalanceThreshold: decimal("rebalance_threshold", {
    precision: 5,
    scale: 2,
  }).default("20.0"),
  slPercentage: decimal("sl_percentage", { precision: 5, scale: 2 }),
  tpPercentage: decimal("tp_percentage", { precision: 5, scale: 2 }),

  // Transaction references
  creationSignature: text("creation_signature").notNull(),
  closureSignature: text("closure_signature"),

  ...timestamps,
});

// Position segments table for rebalancing tracking
export const positionSegments = pgTable("PositionSegment", {
  id: uuid("id").primaryKey().defaultRandom(),
  positionId: uuid("position_id")
    .notNull()
    .references(() => positions.id, { onDelete: "cascade" }),

  // Segment identification
  segmentNumber: integer("segment_number").notNull(),
  startTimestamp: timestamp("start_timestamp", {
    withTimezone: true,
  }).notNull(),
  endTimestamp: timestamp("end_timestamp", { withTimezone: true }),

  // Segment values
  initialValueUSD: decimal("initial_value_usd", {
    precision: 18,
    scale: 6,
  }).notNull(),
  finalValueUSD: decimal("final_value_usd", { precision: 18, scale: 6 }),

  // Segment PnL
  realizedPnlUSD: decimal("realized_pnl_usd", { precision: 18, scale: 6 }),
  realizedPnlPercentage: decimal("realized_pnl_percentage", {
    precision: 10,
    scale: 4,
  }),

  // Fees claimed during this segment
  feesClaimedUSD: decimal("fees_claimed_usd", {
    precision: 18,
    scale: 6,
  }).default("0"),

  // Closure reason
  closureReason: text("closure_reason"),
  closureSignature: text("closure_signature"),

  // Position state at segment start/end
  startPositionAddress: text("start_position_address").notNull(),
  endPositionAddress: text("end_position_address"),

  // createdAt: timestamp("created_at").notNull().defaultNow(),
  ...timestamps,
});

// Enhanced claim history table
export const claimHistory = pgTable("claim_history", {
  id: uuid("id").primaryKey().defaultRandom(),
  positionId: uuid("position_id")
    .notNull()
    .references(() => positions.id, { onDelete: "cascade" }),
  segmentId: uuid("segment_id").references(() => positionSegments.id),

  // Claim details
  // timestamp: timestamp("timestamp").notNull().defaultNow(),
  claimType: claimTypeEnum("claim_type").notNull().default("manual"),

  // Claimed amounts (raw token amounts)
  claimedTokenXAmount: decimal("claimed_token_x_amount", {
    precision: 28,
    scale: 9,
  }).notNull(),
  claimedTokenYAmount: decimal("claimed_token_y_amount", {
    precision: 28,
    scale: 9,
  }).notNull(),
  claimedRewardsOther: jsonb("claimed_rewards_other"),

  // USD values at claim time
  claimedUSDValue: decimal("claimed_usd_value", {
    precision: 18,
    scale: 6,
  }).notNull(),
  tokenXPriceUSD: decimal("token_x_price_usd", {
    precision: 18,
    scale: 9,
  }).notNull(),
  tokenYPriceUSD: decimal("token_y_price_usd", {
    precision: 18,
    scale: 9,
  }).notNull(),

  // Post-swap values (if swapped to SOL)
  solReceived: decimal("sol_received", { precision: 18, scale: 9 }),
  solPriceUSD: decimal("sol_price_usd", { precision: 18, scale: 9 }),

  // Transaction reference
  transactionSignature: text("transaction_signature").notNull(),

  // Context
  isDuringRebalance: boolean("is_during_rebalance").default(false),
  notes: text("notes"),

  // createdAt: timestamp("created_at").notNull().defaultNow(),
  ...timestamps,
});

// Enhanced rebalance events table
export const rebalanceEvents = pgTable("RebalanceEvent", {
  id: uuid("id").primaryKey().defaultRandom(),
  positionId: uuid("position_id")
    .notNull()
    .references(() => positions.id, { onDelete: "cascade" }),

  // Rebalance timing
  // timestamp: timestamp("timestamp").notNull().defaultNow(),
  triggerReason: text("trigger_reason").notNull(),

  // Position addresses
  oldPositionAddress: text("old_position_address").notNull(),
  newPositionAddress: text("new_position_address").notNull(),

  // Segment closure data
  closedSegmentId: uuid("closed_segment_id").references(
    () => positionSegments.id
  ),
  segmentInitialUSD: decimal("segment_initial_usd", {
    precision: 18,
    scale: 6,
  }).notNull(),
  segmentFinalUSD: decimal("segment_final_usd", {
    precision: 18,
    scale: 6,
  }).notNull(),
  segmentPnlUSD: decimal("segment_pnl_usd", {
    precision: 18,
    scale: 6,
  }).notNull(),
  segmentPnlPercentage: decimal("segment_pnl_percentage", {
    precision: 10,
    scale: 4,
  }).notNull(),

  // Fees collected during rebalance
  feesCollectedUSD: decimal("fees_collected_usd", {
    precision: 18,
    scale: 6,
  }).default("0"),

  // New segment data
  newSegmentId: uuid("new_segment_id").references(() => positionSegments.id),
  newSegmentInitialUSD: decimal("new_segment_initial_usd", {
    precision: 18,
    scale: 6,
  }).notNull(),

  // Transaction references
  closeTransactionSignature: text("close_transaction_signature"),
  createTransactionSignature: text("create_transaction_signature"),

  // Gas and slippage costs
  totalGasCostSOL: decimal("total_gas_cost_sol", { precision: 18, scale: 9 }),
  slippageCostUSD: decimal("slippage_cost_usd", { precision: 18, scale: 6 }),

  notes: text("notes"),
  // createdAt: timestamp("created_at").notNull().defaultNow(),
  ...timestamps,
});

// Enhanced position snapshots table
export const positionSnapshots = pgTable("PositionSnapshot", {
  id: uuid("id").primaryKey().defaultRandom(),
  positionId: uuid("position_id")
    .notNull()
    .references(() => positions.id, { onDelete: "cascade" }),
  segmentId: uuid("segment_id").references(() => positionSegments.id),

  // Snapshot timing
  // snapshotTimestamp: timestamp("snapshot_timestamp").notNull().defaultNow(),
  snapshotType: snapshotTypeEnum("snapshot_type").notNull(),

  // Current position value
  currentValueUSD: decimal("current_value_usd", {
    precision: 18,
    scale: 6,
  }).notNull(),
  tokenXAmount: decimal("token_x_amount", {
    precision: 28,
    scale: 9,
  }).notNull(),
  tokenYAmount: decimal("token_y_amount", {
    precision: 28,
    scale: 9,
  }).notNull(),

  // Unclaimed fees at snapshot time
  unclaimedFeesX: decimal("unclaimed_fees_x", {
    precision: 28,
    scale: 9,
  }).notNull(),
  unclaimedFeesY: decimal("unclaimed_fees_y", {
    precision: 28,
    scale: 9,
  }).notNull(),
  unclaimedFeesUSD: decimal("unclaimed_fees_usd", {
    precision: 18,
    scale: 6,
  }).notNull(),

  // PnL at snapshot time
  unrealizedPnlUSD: decimal("unrealized_pnl_usd", {
    precision: 18,
    scale: 6,
  }).notNull(),
  unrealizedPnlPercentage: decimal("unrealized_pnl_percentage", {
    precision: 10,
    scale: 4,
  }).notNull(),
  totalPnlUSD: decimal("total_pnl_usd", { precision: 18, scale: 6 }).notNull(),
  totalPnlPercentage: decimal("total_pnl_percentage", {
    precision: 10,
    scale: 4,
  }).notNull(),

  // Token prices at snapshot
  tokenXPriceUSD: decimal("token_x_price_usd", {
    precision: 18,
    scale: 9,
  }).notNull(),
  tokenYPriceUSD: decimal("token_y_price_usd", {
    precision: 18,
    scale: 9,
  }).notNull(),
  solPriceUSD: decimal("sol_price_usd", { precision: 18, scale: 9 }).notNull(),

  // createdAt: timestamp("created_at").notNull().defaultNow(),
  ...timestamps,
});

export const transactions = pgTable("transactions", {
  id: uuid("id").primaryKey().defaultRandom(),
  positionId: uuid("position_id")
    .notNull()
    .references(() => positions.id, { onDelete: "cascade" }),
  type: transactionTypeEnum("type").notNull(),
  amount: decimal("amount", { precision: 20, scale: 8 }).notNull(),
  tokenAddress: text("token_address").notNull(),
  txHash: text("tx_hash"),
  status: transactionStatusEnum("status").notNull().default("PENDING"),
  errorMessage: text("error_message"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const referrals = pgTable("Referral", {
  id: uuid("id").primaryKey().defaultRandom(),
  referrerId: text("referrer_id").notNull(),
  referredId: text("referred_id").notNull(),
  referralCode: text("referral_code").notNull(),
  status: text("status").notNull().default("ACTIVE"),
  feesEarned: decimal("fees_earned", { precision: 20, scale: 8 })
    .notNull()
    .default("0"),
  pointsEarned: integer("points_earned").notNull().default(0),
  // createdAt: timestamp("created_at").notNull().defaultNow(),
  // updatedAt: timestamp("updated_at").notNull().defaultNow(),
  ...timestamps,
});

export const points = pgTable("points", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: text("user_id").notNull(),
  amount: integer("amount").notNull(),
  type: pointTypeEnum("type").notNull(),
  description: text("description"),
  referralId: uuid("referral_id").references(() => referrals.id),
  // createdAt: timestamp("created_at").notNull().defaultNow(),
  ...timestamps,
});

export const pendingTransactions = pgTable("pending_transactions", {
  id: uuid("id").primaryKey().defaultRandom(),
  signature: text("signature").notNull().unique(),
  operationType: operationTypeEnum("operation_type").notNull(),
  userId: uuid("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  status: pendingTransactionStatusEnum("status").notNull().default("PENDING"),
  metadata: jsonb("metadata"),
  retryCount: integer("retry_count").notNull().default(0),
  maxRetries: integer("max_retries").notNull().default(3),
  lastProcessedAt: timestamp("last_processed_at", { withTimezone: true }),
  errorMessage: text("error_message"),
  ...timestamps,
});

// Relations
export const usersRelations = relations(users, ({ many }) => ({
  wallets: many(wallets),
  positions: many(positions),
  referrals: many(referrals, { relationName: "referrer" }),
  referredBy: many(referrals, { relationName: "referred" }),
  points: many(points),
  // pendingTransactions: many(pendingTransactions),
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
    references: [users.id],
    relationName: "referrer",
  }),
  referred: one(users, {
    fields: [referrals.referredId],
    references: [users.id],
    relationName: "referred",
  }),
  points: many(points),
}));

export const pointsRelations = relations(points, ({ one }) => ({
  user: one(users, {
    fields: [points.userId],
    references: [users.id],
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
