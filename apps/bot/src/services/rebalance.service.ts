import { eq, and } from 'drizzle-orm';
import { db } from '../db';
import { positions, users, rebalanceEvents, transactions } from '../db/schema';
import type { Position, User, RebalanceStrategy } from '../db/schema';
import { meteoraPoolService } from './meteora/pool.service';
import { CONFIG } from '../config';

export interface RebalanceResult {
  success: boolean;
  transactionId?: string;
  oldValue: number;
  newValue: number;
  feesCollected: number;
  reason: string;
  error?: string;
}

export interface RebalanceAnalysis {
  shouldRebalance: boolean;
  reason: string;
  currentPrice: number;
  priceChange: number;
  positionHealth: number;
  strategy: RebalanceStrategy;
}

/**
 * Service for handling automatic position rebalancing
 */
export class RebalanceService {
  private readonly maxRetries = 3;
  private readonly retryDelay = 2000;

  /**
   * Analyze if a position needs rebalancing based on user's strategy
   */
  async analyzePosition(positionId: string): Promise<RebalanceAnalysis | null> {
    try {
      // Get position with user data
      const result = await db
        .select({
          position: positions,
          user: users,
        })
        .from(positions)
        .innerJoin(users, eq(positions.userId, users.id))
        .where(eq(positions.id, positionId))
        .limit(1);

      if (!result.length) {
        console.error(`[Rebalance] Position ${positionId} not found`);
        return null;
      }

      const { position, user } = result[0];

      // Skip if auto-rebalance is disabled
      if (!user.autoRebalanceEnabled) {
        return {
          shouldRebalance: false,
          reason: 'Auto-rebalance disabled',
          currentPrice: 0,
          priceChange: 0,
          positionHealth: 100,
          strategy: user.rebalanceStrategy,
        };
      }

      // Get current pool data
      const poolData: any = await meteoraPoolService.getPoolInfo(
        position.poolAddress,
        this.getPoolTypeFromStrategy(position.strategyType)
      );

      if (!poolData) {
        console.error(`[Rebalance] Failed to fetch pool data for ${position.poolAddress}`);
        return null;
      }

      const currentPrice = parseFloat(poolData.price);
      const initialValue = parseFloat(position.initialAmount.toString());
      const currentValue = parseFloat(position.currentValue.toString());
      const priceChange = ((currentPrice - initialValue) / initialValue) * 100;
      const threshold = parseFloat(user.rebalanceThreshold.toString());

      // Calculate position health (0-100, where 100 is optimal)
      const positionHealth = this.calculatePositionHealth(
        position,
        currentPrice,
        poolData
      );

      // Apply strategy-specific logic
      const analysis = this.applyRebalanceStrategy(
        user.rebalanceStrategy,
        {
          position,
          user,
          currentPrice,
          priceChange,
          threshold,
          positionHealth,
          poolData,
        }
      );

      return {
        ...analysis,
        currentPrice,
        priceChange,
        positionHealth,
        strategy: user.rebalanceStrategy,
      };
    } catch (error) {
      console.error(`[Rebalance] Error analyzing position ${positionId}:`, error);
      return null;
    }
  }

  /**
   * Execute rebalancing for a position
   */
  async executeRebalance(positionId: string): Promise<RebalanceResult> {
    try {
      console.log(`[Rebalance] Starting rebalance for position ${positionId}`);

      // Analyze position first
      const analysis = await this.analyzePosition(positionId);
      if (!analysis || !analysis.shouldRebalance) {
        return {
          success: false,
          oldValue: 0,
          newValue: 0,
          feesCollected: 0,
          reason: analysis?.reason || 'Position does not need rebalancing',
          error: 'Rebalancing not required',
        };
      }

      // Get position data
      const position = await db
        .select()
        .from(positions)
        .where(eq(positions.id, positionId))
        .limit(1);

      if (!position.length) {
        throw new Error('Position not found');
      }

      const pos = position[0];
      const oldValue = parseFloat(pos.currentValue.toString());

      // Update position status to REBALANCING
      await db
        .update(positions)
        .set({ 
          status: 'REBALANCING',
          updatedAt: new Date(),
        })
        .where(eq(positions.id, positionId));

      // Execute the actual rebalancing transaction
      const rebalanceResult = await this.performRebalanceTransaction(
        pos,
        analysis
      );

      if (!rebalanceResult.success) {
        // Revert status on failure
        await db
          .update(positions)
          .set({ 
            status: 'ACTIVE',
            updatedAt: new Date(),
          })
          .where(eq(positions.id, positionId));

        return rebalanceResult;
      }

      // Update position with new values
      const newValue = rebalanceResult.newValue;
      const feesCollected = rebalanceResult.feesCollected;

      await db
        .update(positions)
        .set({
          currentValue: newValue.toString(),
          feesEarned: (parseFloat(pos.feesEarned.toString()) + feesCollected).toString(),
          status: 'ACTIVE',
          lastRebalanceAt: new Date(),
          updatedAt: new Date(),
        })
        .where(eq(positions.id, positionId));

      // Record rebalance event
      await db.insert(rebalanceEvents).values({
        positionId,
        oldValue: oldValue.toString(),
        newValue: newValue.toString(),
        feesCollected: feesCollected.toString(),
        reason: analysis.reason,
        txHash: rebalanceResult.transactionId,
      });

      // Record transaction
      await db.insert(transactions).values({
        positionId,
        type: 'REBALANCE',
        amount: Math.abs(newValue - oldValue).toString(),
        tokenAddress: pos.tokenAddress,
        txHash: rebalanceResult.transactionId,
        status: 'CONFIRMED',
      });

      console.log(`[Rebalance] Successfully rebalanced position ${positionId}`);
      return rebalanceResult;
    } catch (error) {
      console.error(`[Rebalance] Error executing rebalance for ${positionId}:`, error);
      
      // Ensure position status is reset on error
      try {
        await db
          .update(positions)
          .set({ 
            status: 'ACTIVE',
            updatedAt: new Date(),
          })
          .where(eq(positions.id, positionId));
      } catch (resetError) {
        console.error(`[Rebalance] Failed to reset position status:`, resetError);
      }

      return {
        success: false,
        oldValue: 0,
        newValue: 0,
        feesCollected: 0,
        reason: 'Rebalance execution failed',
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  /**
   * Apply strategy-specific rebalancing logic
   */
  private applyRebalanceStrategy(
    strategy: RebalanceStrategy,
    context: {
      position: Position;
      user: User;
      currentPrice: number;
      priceChange: number;
      threshold: number;
      positionHealth: number;
      poolData: any;
    }
  ): { shouldRebalance: boolean; reason: string } {
    const { position, priceChange, threshold, positionHealth } = context;

    switch (strategy) {
      case 'STANDARD':
        return this.applyStandardStrategy({
          priceChange,
          threshold,
          positionHealth,
          lastRebalanceAt: position.lastRebalanceAt,
        });

      case 'DIP_PROTECTION':
        return this.applyDipProtectionStrategy({
          priceChange,
          threshold,
          positionHealth,
          lastRebalanceAt: position.lastRebalanceAt,
        });

      default:
        return {
          shouldRebalance: false,
          reason: `Unknown strategy: ${strategy}`,
        };
    }
  }

  /**
   * Standard rebalancing strategy - rebalance when price moves beyond threshold
   */
  private applyStandardStrategy(context: {
    priceChange: number;
    threshold: number;
    positionHealth: number;
    lastRebalanceAt: Date | null;
  }): { shouldRebalance: boolean; reason: string } {
    const { priceChange, threshold, positionHealth, lastRebalanceAt } = context;

    // Check minimum time between rebalances (prevent too frequent rebalancing)
    if (lastRebalanceAt) {
      const timeSinceLastRebalance = Date.now() - lastRebalanceAt.getTime();
      const minInterval = CONFIG.REBALANCING.INTERVAL_MINUTES * 60 * 1000;
      
      if (timeSinceLastRebalance < minInterval) {
        return {
          shouldRebalance: false,
          reason: 'Too soon since last rebalance',
        };
      }
    }

    // Rebalance if price change exceeds threshold
    if (Math.abs(priceChange) >= threshold) {
      return {
        shouldRebalance: true,
        reason: `Price change ${priceChange.toFixed(2)}% exceeds threshold ${threshold}%`,
      };
    }

    // Rebalance if position health is poor
    if (positionHealth < 30) {
      return {
        shouldRebalance: true,
        reason: `Poor position health: ${positionHealth.toFixed(1)}%`,
      };
    }

    return {
      shouldRebalance: false,
      reason: 'Position within acceptable parameters',
    };
  }

  /**
   * Dip Protection strategy - more conservative, focuses on protecting against dips
   */
  private applyDipProtectionStrategy(context: {
    priceChange: number;
    threshold: number;
    positionHealth: number;
    lastRebalanceAt: Date | null;
  }): { shouldRebalance: boolean; reason: string } {
    const { priceChange, threshold, positionHealth, lastRebalanceAt } = context;

    // Check minimum time between rebalances
    if (lastRebalanceAt) {
      const timeSinceLastRebalance = Date.now() - lastRebalanceAt.getTime();
      const minInterval = CONFIG.REBALANCING.INTERVAL_MINUTES * 60 * 1000 * 2; // 2x longer for dip protection
      
      if (timeSinceLastRebalance < minInterval) {
        return {
          shouldRebalance: false,
          reason: 'Too soon since last rebalance (dip protection)',
        };
      }
    }

    // More aggressive on downward movements (dip protection)
    if (priceChange <= -threshold * 0.7) { // Trigger at 70% of threshold for negative moves
      return {
        shouldRebalance: true,
        reason: `Dip protection triggered: ${priceChange.toFixed(2)}% decline`,
      };
    }

    // Less aggressive on upward movements (let profits run)
    if (priceChange >= threshold * 1.5) { // Trigger at 150% of threshold for positive moves
      return {
        shouldRebalance: true,
        reason: `Large gain rebalance: ${priceChange.toFixed(2)}% increase`,
      };
    }

    // Rebalance if position health is very poor
    if (positionHealth < 20) {
      return {
        shouldRebalance: true,
        reason: `Critical position health: ${positionHealth.toFixed(1)}%`,
      };
    }

    return {
      shouldRebalance: false,
      reason: 'Position protected, no rebalancing needed',
    };
  }

  /**
   * Calculate position health score (0-100)
   */
  private calculatePositionHealth(
    position: Position,
    currentPrice: number,
    poolData: any
  ): number {
    try {
      // Basic health calculation based on price range and current price
      const priceRangeMin = position.priceRangeMin ? parseFloat(position.priceRangeMin.toString()) : null;
      const priceRangeMax = position.priceRangeMax ? parseFloat(position.priceRangeMax.toString()) : null;

      if (!priceRangeMin || !priceRangeMax) {
        // If no price range set, use a basic calculation
        return 75; // Assume decent health
      }

      const rangeSize = priceRangeMax - priceRangeMin;
      const optimalPrice = (priceRangeMin + priceRangeMax) / 2;
      const priceDeviation = Math.abs(currentPrice - optimalPrice);
      const deviationRatio = priceDeviation / (rangeSize / 2);

      // Health decreases as price moves away from optimal range
      const health = Math.max(0, 100 - (deviationRatio * 100));
      
      return Math.min(100, health);
    } catch (error) {
      console.error('[Rebalance] Error calculating position health:', error);
      return 50; // Default to moderate health on error
    }
  }

  /**
   * Perform the actual rebalancing transaction
   */
  private async performRebalanceTransaction(
    position: Position,
    analysis: RebalanceAnalysis
  ): Promise<RebalanceResult> {
    try {
      // This is a mock implementation - in production, this would:
      // 1. Close the current position
      // 2. Collect fees
      // 3. Open a new optimized position
      // 4. Return the actual transaction details

      console.log(`[Rebalance] Executing ${analysis.strategy} rebalance transaction`);
      
      // Mock transaction delay
      await new Promise(resolve => setTimeout(resolve, 3000));

      const oldValue = parseFloat(position.currentValue.toString());
      const mockNewValue = oldValue * (1 + (Math.random() * 0.02 - 0.01)); // ±1% variation
      const mockFeesCollected = oldValue * 0.001; // 0.1% fees
      const mockTransactionId = this.generateMockTransactionId();

      return {
        success: true,
        transactionId: mockTransactionId,
        oldValue,
        newValue: mockNewValue,
        feesCollected: mockFeesCollected,
        reason: analysis.reason,
      };
    } catch (error) {
      console.error('[Rebalance] Transaction execution failed:', error);
      return {
        success: false,
        oldValue: parseFloat(position.currentValue.toString()),
        newValue: 0,
        feesCollected: 0,
        reason: 'Transaction failed',
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  /**
   * Get pool type from strategy type
   */
  private getPoolTypeFromStrategy(strategyType: string): 'damm_v1' | 'damm_v2' | 'dlmm' {
    switch (strategyType) {
      case 'DLMM':
        return 'dlmm';
      case 'DAMM':
        return 'damm_v2';
      default:
        return 'dlmm';
    }
  }

  /**
   * Generate mock transaction ID
   */
  private generateMockTransactionId(): string {
    const chars = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';
    let result = '';
    for (let i = 0; i < 64; i++) {
      result += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return result;
  }

  /**
   * Get all positions that need rebalancing
   */
  async getPositionsNeedingRebalance(): Promise<string[]> {
    try {
      const activePositions = await db
        .select({ id: positions.id })
        .from(positions)
        .innerJoin(users, eq(positions.userId, users.id))
        .where(
          and(
            eq(positions.status, 'ACTIVE'),
            eq(users.autoRebalanceEnabled, true)
          )
        );

      const positionsNeedingRebalance: string[] = [];

      for (const pos of activePositions) {
        const analysis = await this.analyzePosition(pos.id);
        if (analysis?.shouldRebalance) {
          positionsNeedingRebalance.push(pos.id);
        }
      }

      return positionsNeedingRebalance;
    } catch (error) {
      console.error('[Rebalance] Error getting positions needing rebalance:', error);
      return [];
    }
  }
}

export const rebalanceService = new RebalanceService();