import { eq, sql } from "drizzle-orm";
import type { PostgresJsDatabase } from "drizzle-orm/postgres-js";
import * as schema from "../../../db/schema";
import {
  User,
  UserPreferences,
  RebalanceStrategy,
} from "../../../domain/user/user.entity";
import { IUserRepository } from "../../../domain/user/user.repository";
import { DEFAULT_BIN_RANGE } from "@/config/constants";

export class UserRepository implements IUserRepository {
  constructor(private readonly db: PostgresJsDatabase<typeof schema>) {}

  async findById(id: string): Promise<User | null> {
    const user = await this.db.query.users.findFirst({
      where: eq(schema.users.id, id),
    });

    if (!user) {
      return null;
    }

    return this.toDomain(user);
  }

  async findByTelegramId(telegramId: string): Promise<User | null> {
    const user = await this.db.query.users.findFirst({
      where: eq(schema.users.telegramId, telegramId),
    });

    if (!user) {
      return null;
    }

    return this.toDomain(user);
  }

  async findByWalletAddress(address: string): Promise<User | null> {
    const user = await this.db.query.users.findFirst({
      where: eq(schema.users.walletAddress, address),
    });

    if (!user) {
      return null;
    }

    return this.toDomain(user);
  }

  async findByWalletId(walletId: string): Promise<User | null> {
    const user = await this.db.query.users.findFirst({
      where: eq(schema.users.walletId, walletId),
    });

    if (!user) {
      return null;
    }

    return this.toDomain(user);
  }

  async save(user: User): Promise<void> {
    const persistenceData = this.toPersistence(user);

    await this.db.insert(schema.users).values(persistenceData);
  }

  async update(user: User): Promise<void> {
    const persistenceData = this.toPersistence(user);

    await this.db
      .update(schema.users)
      .set({
        username: persistenceData.username,
        walletId: persistenceData.walletId,
        walletAddress: persistenceData.walletAddress,

        // Rebalancing settings
        autoRebalanceEnabled: persistenceData.autoRebalanceEnabled,
        rebalanceThreshold: persistenceData.rebalanceThreshold,
        rebalanceStrategy: persistenceData.rebalanceStrategy,
        rebalanceSchedule: persistenceData.rebalanceSchedule,

        // Position configuration
        defaultBinRange: persistenceData.defaultBinRange,
        balancedPositionBinRange: persistenceData.balancedPositionBinRange,

        // Risk management
        stopLossPercentage: persistenceData.stopLossPercentage,
        takeProfitPercentage: persistenceData.takeProfitPercentage,

        // Trading settings
        autoConvertToSol: persistenceData.autoConvertToSol,
        slippagePercentage: persistenceData.slippagePercentage,
      })
      .where(eq(schema.users.id, user.id));
  }

  async delete(id: string): Promise<void> {
    await this.db.delete(schema.users).where(eq(schema.users.id, id));
  }

  async exists(telegramId: string): Promise<boolean> {
    const result = await this.db
      .select({ count: sql<number>`count(*)` })
      .from(schema.users)
      .where(eq(schema.users.telegramId, telegramId));

    return Number(result[0]?.count ?? 0) > 0;
  }

  /**
   * Maps database row to domain entity
   */
  private toDomain(row: typeof schema.users.$inferSelect): User {
    const preferences: UserPreferences = {
      // Rebalancing settings
      autoRebalanceEnabled: row.autoRebalanceEnabled,
      rebalanceThreshold: Number(row.rebalanceThreshold),
      rebalanceStrategy: row.rebalanceStrategy as RebalanceStrategy,
      rebalanceSchedule: row.rebalanceSchedule || "15m",

      // Position configuration
      defaultBinRange: row.defaultBinRange || DEFAULT_BIN_RANGE,
      balancedPositionBinRange: row.balancedPositionBinRange,

      // Risk management
      stopLossPercentage: row.stopLossPercentage
        ? Number(row.stopLossPercentage)
        : null,
      takeProfitPercentage: row.takeProfitPercentage
        ? Number(row.takeProfitPercentage)
        : null,

      // Trading settings
      autoConvertToSol: row.autoConvertToSol ?? true,
      slippagePercentage: row.slippagePercentage?.toString() || "3.00",

      // Notification settings (defaults for backwards compatibility)
      notificationsEnabled: true,
      priceAlertsEnabled: true,
      rebalanceAlertsEnabled: true,
    };

    return User.reconstitute({
      id: row.id,
      telegramId: row.telegramId,
      privyUserId: row.privyUserId!,
      walletId: row.walletId,
      walletAddress: row.walletAddress,
      username: row.username ?? undefined,
      preferences,
      createdAt: new Date(row.createdAt),
      updatedAt: new Date(row.updatedAt),
    });
  }

  /**
   * Maps domain entity to database row
   */
  private toPersistence(user: User): typeof schema.users.$inferInsert {
    const preferences = user.getPreferences();

    return {
      id: user.id,
      telegramId: user.telegramId,
      privyUserId: user.privyUserId,
      walletId: user.walletId,
      walletAddress: user.walletAddress,
      username: user.getUsername() ?? undefined,

      // Rebalancing settings
      autoRebalanceEnabled: preferences.autoRebalanceEnabled,
      rebalanceThreshold: preferences.rebalanceThreshold.toString(),
      rebalanceStrategy: preferences.rebalanceStrategy,
      rebalanceSchedule: preferences.rebalanceSchedule,

      // Position configuration
      defaultBinRange: preferences.defaultBinRange,
      balancedPositionBinRange: preferences.balancedPositionBinRange,

      // Risk management
      stopLossPercentage: preferences.stopLossPercentage?.toString(),
      takeProfitPercentage: preferences.takeProfitPercentage?.toString(),

      // Trading settings
      autoConvertToSol: preferences.autoConvertToSol,
      slippagePercentage: preferences.slippagePercentage,

      createdAt: user.createdAt.toISOString(),
      updatedAt: user.getUpdatedAt().toISOString(),
    };
  }
}
