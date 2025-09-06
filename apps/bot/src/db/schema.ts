import {
  pgTable,
  text,
  timestamp,
  boolean,
  decimal,
  pgEnum,
  uuid,
  integer,
} from "drizzle-orm/pg-core";
import { relations } from "drizzle-orm";

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
  strategyType: strategyTypeEnum("strategyType").notNull(),
  tokenXAmount: decimal("tokenXAmount", {
    precision: 20,
    scale: 8,
  }).notNull(),
  tokenYAmount: decimal("tokenYAmount", {
    precision: 20,
    scale: 8,
  }).notNull(),
  currentValue: decimal("currentValue", { precision: 20, scale: 8 }).notNull(),
  feesEarned: decimal("feesEarned", { precision: 20, scale: 8 })
    .notNull()
    .default("0"),
  status: positionStatusEnum("status").notNull().default("ACTIVE"),
  lastRebalanceAt: timestamp("lastRebalanceAt"),
  priceRangeMin: decimal("priceRangeMin", { precision: 20, scale: 8 }),
  priceRangeMax: decimal("priceRangeMax", { precision: 20, scale: 8 }),
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

// Export enum types
export type StrategyType = (typeof strategyTypeEnum.enumValues)[number];
export type PositionStatus = (typeof positionStatusEnum.enumValues)[number];
export type TransactionType = (typeof transactionTypeEnum.enumValues)[number];
export type TransactionStatus =
  (typeof transactionStatusEnum.enumValues)[number];
export type RebalanceStrategy =
  (typeof rebalanceStrategyEnum.enumValues)[number];
export type PointType = (typeof pointTypeEnum.enumValues)[number];
