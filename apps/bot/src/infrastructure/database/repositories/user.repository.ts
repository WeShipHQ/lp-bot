import { eq, sql } from 'drizzle-orm';
import type { PostgresJsDatabase } from 'drizzle-orm/postgres-js';
import * as schema from '../../../db/schema';
import { User, UserPreferences, RebalanceStrategy } from '../../../domain/user/user.entity';
import { IUserRepository } from '../../../domain/user/user.repository';

export class UserRepository implements IUserRepository {
  constructor(private readonly db: PostgresJsDatabase<typeof schema>) {}

  async findById(id: string): Promise<User | null> {
    const result = await this.db
      .select()
      .from(schema.users)
      .where(eq(schema.users.id, id))
      .limit(1);

    if (result.length === 0) {
      return null;
    }

    return this.toDomain(result[0]);
  }

  async findByTelegramId(telegramId: string): Promise<User | null> {
    const result = await this.db
      .select()
      .from(schema.users)
      .where(eq(schema.users.telegramId, telegramId))
      .limit(1);

    if (result.length === 0) {
      return null;
    }

    return this.toDomain(result[0]);
  }

  async findByWalletAddress(address: string): Promise<User | null> {
    const result = await this.db
      .select()
      .from(schema.users)
      .where(eq(schema.users.walletAddress, address))
      .limit(1);

    if (result.length === 0) {
      return null;
    }

    return this.toDomain(result[0]);
  }

  async findByWalletId(walletId: string): Promise<User | null> {
    const result = await this.db
      .select()
      .from(schema.users)
      .where(eq(schema.users.walletId, walletId))
      .limit(1);

    if (result.length === 0) {
      return null;
    }

    return this.toDomain(result[0]);
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
        autoRebalanceEnabled: persistenceData.autoRebalanceEnabled,
        rebalanceThreshold: persistenceData.rebalanceThreshold,
        rebalanceStrategy: persistenceData.rebalanceStrategy,
        balancedPositionBinRange: persistenceData.balancedPositionBinRange,
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
    // Build user preferences from database columns
    const preferences: UserPreferences = {
      autoRebalanceEnabled: row.autoRebalanceEnabled,
      rebalanceThreshold: Number(row.rebalanceThreshold),
      rebalanceStrategy: row.rebalanceStrategy as RebalanceStrategy,
      balancedPositionBinRange: row.balancedPositionBinRange,
      // Note: The schema doesn't have these fields, so we use defaults
      // In production, you might want to add these columns to the database
      notificationsEnabled: true,
      priceAlertsEnabled: true,
      rebalanceAlertsEnabled: true,
    };

    return User.reconstitute({
      id: row.id,
      telegramId: row.telegramId,
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
      walletId: user.walletId,
      walletAddress: user.walletAddress,
      username: user.getUsername() ?? undefined,
      autoRebalanceEnabled: preferences.autoRebalanceEnabled,
      rebalanceThreshold: preferences.rebalanceThreshold.toString(),
      rebalanceStrategy: preferences.rebalanceStrategy,
      balancedPositionBinRange: preferences.balancedPositionBinRange,
      createdAt: user.createdAt.toISOString(),
      updatedAt: user.getUpdatedAt().toISOString(),
    };
  }
}
