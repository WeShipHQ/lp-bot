import { eq, and, sql } from "drizzle-orm";
import type { PostgresJsDatabase } from "drizzle-orm/postgres-js";
import * as schema from "../../../db/schema";
import {
  Position,
  PositionStatus,
  DexType,
  StrategyType,
  PositionToken,
} from "../../../domain/position/position.entity";
import { IPositionRepository } from "../../../domain/position/position.repository";

export class PositionRepository implements IPositionRepository {
  constructor(private readonly db: PostgresJsDatabase<typeof schema>) {}

  async findById(id: string): Promise<Position | null> {
    const result = await this.db
      .select()
      .from(schema.positions)
      .where(eq(schema.positions.id, id))
      .limit(1);

    if (result.length === 0) {
      return null;
    }

    return this.toDomain(result[0]);
  }

  async findByPositionAddress(
    positionAddress: string
  ): Promise<Position | null> {
    const result = await this.db
      .select()
      .from(schema.positions)
      .where(eq(schema.positions.positionAddress, positionAddress))
      .limit(1);

    if (result.length === 0) {
      return null;
    }

    return this.toDomain(result[0]);
  }

  async findByUser(userId: string): Promise<Position[]> {
    const results = await this.db
      .select()
      .from(schema.positions)
      .where(eq(schema.positions.userId, userId))
      .orderBy(sql`${schema.positions.createdAt} DESC`);

    return results.map((row) => this.toDomain(row));
  }

  async findActiveByUser(userId: string): Promise<Position[]> {
    const results = await this.db
      .select()
      .from(schema.positions)
      .where(
        and(
          eq(schema.positions.userId, userId),
          eq(schema.positions.status, "ACTIVE")
        )
      )
      .orderBy(sql`${schema.positions.createdAt} DESC`);

    return results.map((row) => this.toDomain(row));
  }

  async findByUserAndStatus(
    userId: string,
    status: PositionStatus
  ): Promise<Position[]> {
    const results = await this.db
      .select()
      .from(schema.positions)
      .where(
        and(
          eq(schema.positions.userId, userId),
          eq(schema.positions.status, status)
        )
      )
      .orderBy(sql`${schema.positions.createdAt} DESC`);

    return results.map((row) => this.toDomain(row));
  }

  async findByPoolAddress(poolAddress: string): Promise<Position[]> {
    const results = await this.db
      .select()
      .from(schema.positions)
      .where(eq(schema.positions.poolAddress, poolAddress))
      .orderBy(sql`${schema.positions.createdAt} DESC`);

    return results.map((row) => this.toDomain(row));
  }

  async save(position: Position): Promise<void> {
    const persistenceData = this.toPersistence(position);

    await this.db.insert(schema.positions).values(persistenceData);
  }

  async update(position: Position): Promise<void> {
    const persistenceData = this.toPersistence(position);

    await this.db
      .update(schema.positions)
      .set(persistenceData)
      .where(eq(schema.positions.id, position.id));
  }

  async delete(id: string): Promise<void> {
    await this.db.delete(schema.positions).where(eq(schema.positions.id, id));
  }

  async count(userId?: string): Promise<number> {
    const result = await this.db
      .select({ count: sql<number>`count(*)` })
      .from(schema.positions)
      .where(userId ? eq(schema.positions.userId, userId) : undefined);

    return Number(result[0]?.count ?? 0);
  }

  async countActive(userId?: string): Promise<number> {
    const conditions = userId
      ? and(
          eq(schema.positions.userId, userId),
          eq(schema.positions.status, "ACTIVE")
        )
      : eq(schema.positions.status, "ACTIVE");

    const result = await this.db
      .select({ count: sql<number>`count(*)` })
      .from(schema.positions)
      .where(conditions);

    return Number(result[0]?.count ?? 0);
  }

  /**
   * Maps database row to domain entity
   */
  private toDomain(row: typeof schema.positions.$inferSelect): Position {
    // Calculate current value from snapshot or use initial value
    // This is a simplified version - in production you might want to join with latest snapshot
    const currentValueUsd = Number(row.initialValueUSD); // Will be updated by use cases

    // Parse token data
    const tokenX = row.tokenX as PositionToken;
    const tokenY = row.tokenY as PositionToken;

    // Build price range if available
    // Note: The schema doesn't have explicit range fields, so we'll need to derive or store them
    // For now, we'll pass null and let the domain entity handle it
    const priceRange = null; // TODO: Add range tracking if needed

    return Position.reconstitute({
      id: row.id,
      userId: row.userId,
      positionAddress: row.positionAddress,
      poolAddress: row.poolAddress,
      dex: row.dex as DexType,
      strategyType: row.strategyType as StrategyType,
      tokenX,
      tokenY,
      status: row.status as PositionStatus,
      initialValueUsd: Number(row.initialValueUSD),
      currentValueUsd,
      initialTokenXAmount: row.initialTokenXAmount,
      initialTokenYAmount: row.initialTokenYAmount,
      currentTokenXAmount: row.initialTokenXAmount, // Will be updated by use cases
      currentTokenYAmount: row.initialTokenYAmount, // Will be updated by use cases
      claimedFeesUsd: Number(row.totalFeesClaimedUSD ?? "0"),
      priceRange,
      isRebalancingEnabled: row.isRebalancingEnabled ?? false,
      rebalanceThreshold: Number(row.rebalanceThreshold ?? "20"),
      createdAt: new Date(row.createdAt),
      updatedAt: new Date(row.updatedAt),
      closedAt: row.closedAt ? new Date(row.closedAt) : undefined,
      transactionSignature: row.creationSignature,
    });
  }

  /**
   * Maps domain entity to database row
   */
  private toPersistence(
    position: Position
  ): typeof schema.positions.$inferInsert {
    const currentValue = position.getCurrentValue();
    const initialValue = position.getInitialValue();
    const claimedFees = position.getClaimedFees();
    const currentTokenX = position.getCurrentTokenXAmount();
    const currentTokenY = position.getCurrentTokenYAmount();
    const initialTokenX = position.getInitialTokenXAmount();
    const initialTokenY = position.getInitialTokenYAmount();

    // Convert TokenAmount to UI amount string for database storage
    // The database stores decimal values (UI amounts), not raw amounts
    const initialTokenXUiAmount = initialTokenX.toUi().toString();
    const initialTokenYUiAmount = initialTokenY.toUi().toString();

    // Build base persistence object
    const persistence: typeof schema.positions.$inferInsert = {
      id: position.id,
      userId: position.userId,
      positionAddress: position.positionAddress,
      poolAddress: position.poolAddress,
      dex: position.dex,
      strategyType: position.strategyType,
      tokenX: position.tokenX as any,
      tokenY: position.tokenY as any,
      status: position.getStatus(),
      initialValueUSD: initialValue.toNumber().toString(),
      initialValueSOL: "0", // TODO: Add SOL value tracking if needed
      initialTokenXAmount: initialTokenXUiAmount,
      initialTokenYAmount: initialTokenYUiAmount,
      initialTokenXPriceUSD: "0", // TODO: Add price tracking
      initialTokenYPriceUSD: "0", // TODO: Add price tracking
      currentSegmentNumber: 1,
      currentSegmentInitialUSD: initialValue.toNumber().toString(),
      currentSegmentStartAt: position.createdAt,
      totalRealizedPnlUSD: "0", // Calculated from snapshots
      totalFeesClaimedUSD: claimedFees.toNumber().toString(),
      isRebalancingEnabled: position["isRebalancingEnabled"],
      rebalanceThreshold: position["rebalanceThreshold"].toString(),
      creationSignature: position.getTransactionSignature() ?? "",
      createdAt: position.createdAt.toISOString(),
      updatedAt: position.getUpdatedAt().toISOString(),
    };

    // Add closed-specific fields if position is closed
    if (position.isClosed()) {
      const currentTokenXUiAmount = currentTokenX.toUi().toString();
      const currentTokenYUiAmount = currentTokenY.toUi().toString();

      persistence.closedAt = position.getClosedAt();
      persistence.finalValueUSD = currentValue.toNumber().toString();
      persistence.finalTokenXAmount = currentTokenXUiAmount;
      persistence.finalTokenYAmount = currentTokenYUiAmount;
    }

    return persistence;
  }
}
