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

export const positions = pgTable("Position", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("userId")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  positionAddress: text("positionAddress").notNull(),
  poolAddress: text("poolAddress").notNull(),
  tokenX: jsonb("tokenX").$type<Token>(),
  tokenY: jsonb("tokenY").$type<Token>(),
  strategyType: strategyTypeEnum("strategyType").notNull(),

  status: positionStatusEnum("status").notNull().default("ACTIVE"),
  lastRebalanceAt: timestamp("lastRebalanceAt"),
  creationSignature: text("creationSignature"),
  closureSignature: text("closureSignature"),

  // for pnl
  depositTokenXAmount: decimal("depositTokenXAmount", {
    precision: 20,
    scale: 8,
  }).notNull(),
  depositTokenYAmount: decimal("depositTokenYAmount", {
    precision: 20,
    scale: 8,
  }).notNull(),
  tokenXPriceAtCreation: decimal("tokenXPriceAtCreation", {
    precision: 20,
    scale: 8,
  }).notNull(), // Price in SOL/USD when position created
  tokenYPriceAtCreation: decimal("tokenYPriceAtCreation", {
    precision: 20,
    scale: 8,
  }).notNull(),
  // withdraw
  withdrawTokenXAmount: decimal("withdrawTokenXAmount", {
    precision: 20,
    scale: 8,
  }).notNull(),
  withdrawTokenYAmount: decimal("withdrawTokenYAmount", {
    precision: 20,
    scale: 8,
  }).notNull(),
  tokenXPriceAtClosure: decimal("tokenXPriceAtClosure", {
    precision: 20,
    scale: 8,
  }),
  tokenYPriceAtClosure: decimal("tokenYPriceAtClosure", {
    precision: 20,
    scale: 8,
  }),
  // fee
  feeTokenXAmount: decimal("feeTokenXAmount", {
    precision: 20,
    scale: 8,
  }).notNull(),
  feeTokenYAmount: decimal("feeTokenYAmount", {
    precision: 20,
    scale: 8,
  }).notNull(),
  initialValueInSol: decimal("initialValueInSol", {
    precision: 20,
    scale: 8,
  }).notNull(),
  finalValueInSol: decimal("finalValueInSol", {
    precision: 20,
    scale: 8,
  }),
  feesEarnedInSol: decimal("feesEarnedInSol", {
    precision: 20,
    scale: 8,
  }).default("0"), // Total fees earned in SOL
  pnlInSol: decimal("pnlInSol", {
    precision: 20,
    scale: 8,
  }),
  pnlInUsd: decimal("pnlInUsd", {
    precision: 20,
    scale: 8,
  }),
  pnlPercentage: decimal("pnlPercentage", {
    precision: 10,
    scale: 4,
  }),

  createdAt: timestamp("createdAt").notNull().defaultNow(),
  updatedAt: timestamp("updatedAt").notNull().defaultNow(),
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

export const rebalanceEvents = pgTable("RebalanceEvent", {
  id: uuid("id").primaryKey().defaultRandom(),
  positionId: uuid("positionId")
    .notNull()
    .references(() => positions.id, { onDelete: "cascade" }),
  oldValue: decimal("oldValue", { precision: 20, scale: 8 }).notNull(),
  newValue: decimal("newValue", { precision: 20, scale: 8 }).notNull(),
  feesCollected: decimal("feesCollected", { precision: 20, scale: 8 })
    .notNull()
    .default("0"),
  reason: text("reason").notNull(),
  txHash: text("txHash"),
  createdAt: timestamp("createdAt").notNull().defaultNow(),
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
  metadata: text("metadata"),
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
  transactions: many(transactions),
  rebalanceEvents: many(rebalanceEvents),
}));

export const transactionsRelations = relations(transactions, ({ one }) => ({
  position: one(positions, {
    fields: [transactions.positionId],
    references: [positions.id],
  }),
}));

export const rebalanceEventsRelations = relations(
  rebalanceEvents,
  ({ one }) => ({
    position: one(positions, {
      fields: [rebalanceEvents.positionId],
      references: [positions.id],
    }),
  })
);

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
export type Transaction = typeof transactions.$inferSelect;
export type NewTransaction = typeof transactions.$inferInsert;
export type RebalanceEvent = typeof rebalanceEvents.$inferSelect;
export type NewRebalanceEvent = typeof rebalanceEvents.$inferInsert;
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
