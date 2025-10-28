import { db } from '../db';
import { positions, rebalanceEvents, transactions, users } from '../db/schema';
import { eq, and, gte, lte, desc, asc, sql, count } from 'drizzle-orm';
import { logger } from '../utils/logger';
import type { Position, RebalanceEvent, Transaction } from '../db/schema';

export interface PositionHealthMetrics {
  positionId: string;
  healthScore: number; // 0-100 scale
  riskLevel: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
  priceDeviation: number; // Percentage from optimal range
  timeInRange: number; // Percentage of time in optimal range
  impermanentLoss: number; // Estimated IL percentage
  feesVsIL: number; // Fees earned vs IL ratio
  lastAnalyzedAt: Date;
}

export interface PositionPerformanceMetrics {
  positionId: string;
  totalReturn: number; // Total return percentage
  annualizedReturn: number; // APY
  totalFeesEarned: number;
  totalRebalances: number;
  avgRebalanceInterval: number; // Days between rebalances
  successfulRebalances: number;
  failedRebalances: number;
  rebalanceSuccessRate: number;
  maxDrawdown: number;
  sharpeRatio: number;
  volatility: number;
  profitFactor: number;
}

export interface PortfolioAnalytics {
  userId: string;
  totalPositions: number;
  activePositions: number;
  totalValue: number;
  totalFeesEarned: number;
  avgHealthScore: number;
  bestPerformingPosition: string | null;
  worstPerformingPosition: string | null;
  totalRebalances: number;
  rebalanceFrequency: number; // Rebalances per month
  portfolioReturn: number;
  riskDistribution: {
    low: number;
    medium: number;
    high: number;
    critical: number;
  };
}

export interface RebalanceAnalytics {
  positionId: string;
  rebalanceHistory: {
    date: Date;
    oldValue: number;
    newValue: number;
    feesCollected: number;
    reason: string;
    priceImpact: number;
    success: boolean;
  }[];
  avgRebalanceGain: number;
  rebalanceEfficiency: number; // Success rate weighted by gains
  optimalRebalanceFrequency: number; // Suggested days between rebalances
  nextRebalanceRecommendation: Date | null;
}

export class PositionAnalyticsService {
  /**
   * Calculate comprehensive health metrics for a position
   */
  async calculatePositionHealth(positionId: string): Promise<PositionHealthMetrics> {
    try {
      const position = await db.query.positions.findFirst({
        where: eq(positions.id, positionId),
        with: {
          rebalanceEvents: {
            orderBy: desc(rebalanceEvents.createdAt),
            limit: 50
          },
          transactions: {
            orderBy: desc(transactions.createdAt),
            limit: 100
          }
        }
      });

      if (!position) {
        throw new Error(`Position ${positionId} not found`);
      }

      // Calculate price deviation from optimal range
      const priceDeviation = this.calculatePriceDeviation(position);
      
      // Calculate time in optimal range
      const timeInRange = await this.calculateTimeInRange(position);
      
      // Estimate impermanent loss
      const impermanentLoss = await this.estimateImpermanentLoss(position);
      
      // Calculate fees vs IL ratio
      const feesVsIL = this.calculateFeesVsILRatio(position, impermanentLoss);
      
      // Calculate overall health score
      const healthScore = this.calculateHealthScore({
        priceDeviation,
        timeInRange,
        impermanentLoss,
        feesVsIL,
        rebalanceFrequency: position.rebalanceEvents.length
      });
      
      // Determine risk level
      const riskLevel = this.determineRiskLevel(healthScore, priceDeviation, impermanentLoss);

      return {
        positionId,
        healthScore,
        riskLevel,
        priceDeviation,
        timeInRange,
        impermanentLoss,
        feesVsIL,
        lastAnalyzedAt: new Date()
      };
    } catch (error) {
      logger.error({ error, positionId }, "Failed to calculate position health");
      throw error;
    }
  }

  /**
   * Calculate detailed performance metrics for a position
   */
  async calculatePositionPerformance(positionId: string): Promise<PositionPerformanceMetrics> {
    try {
      const position = await db.query.positions.findFirst({
        where: eq(positions.id, positionId),
        with: {
          rebalanceEvents: {
            orderBy: asc(rebalanceEvents.createdAt)
          },
          transactions: {
            orderBy: asc(transactions.createdAt)
          }
        }
      });

      if (!position) {
        throw new Error(`Position ${positionId} not found`);
      }

      const daysActive = this.calculateDaysActive(position.createdAt);
      const totalReturn = this.calculateTotalReturn(position);
      const annualizedReturn = this.calculateAnnualizedReturn(totalReturn, daysActive);
      
      const rebalanceMetrics = this.analyzeRebalancePerformance(position.rebalanceEvents);
      const volatilityMetrics = await this.calculateVolatilityMetrics(position);
      
      return {
        positionId,
        totalReturn,
        annualizedReturn,
        totalFeesEarned: parseFloat(position.feesEarned),
        totalRebalances: position.rebalanceEvents.length,
        avgRebalanceInterval: rebalanceMetrics.avgInterval,
        successfulRebalances: rebalanceMetrics.successful,
        failedRebalances: rebalanceMetrics.failed,
        rebalanceSuccessRate: rebalanceMetrics.successRate,
        maxDrawdown: volatilityMetrics.maxDrawdown,
        sharpeRatio: volatilityMetrics.sharpeRatio,
        volatility: volatilityMetrics.volatility,
        profitFactor: volatilityMetrics.profitFactor
      };
    } catch (error) {
      logger.error({ error, positionId }, "Failed to calculate position performance");
      throw error;
    }
  }

  /**
   * Generate portfolio-wide analytics for a user
   */
  async generatePortfolioAnalytics(userId: string): Promise<PortfolioAnalytics> {
    try {
      const userPositions = await db.query.positions.findMany({
        where: eq(positions.userId, userId),
        with: {
          rebalanceEvents: true
        }
      });

      if (userPositions.length === 0) {
        throw new Error(`No positions found for user ${userId}`);
      }

      const activePositions = userPositions.filter(p => p.status === 'ACTIVE');
      const totalValue = userPositions.reduce((sum, p) => sum + parseFloat(p.currentValue), 0);
      const totalFeesEarned = userPositions.reduce((sum, p) => sum + parseFloat(p.feesEarned), 0);
      
      // Calculate health scores for all positions
      const healthScores = await Promise.all(
        activePositions.map(p => this.calculatePositionHealth(p.id))
      );
      
      const avgHealthScore = healthScores.reduce((sum, h) => sum + h.healthScore, 0) / healthScores.length;
      
      // Find best and worst performing positions
      const performanceMetrics = await Promise.all(
        userPositions.map(p => this.calculatePositionPerformance(p.id))
      );
      
      const bestPerforming = performanceMetrics.reduce((best, current) => 
        current.totalReturn > best.totalReturn ? current : best
      );
      
      const worstPerforming = performanceMetrics.reduce((worst, current) => 
        current.totalReturn < worst.totalReturn ? current : worst
      );
      
      // Calculate risk distribution
      const riskDistribution = this.calculateRiskDistribution(healthScores);
      
      // Calculate total rebalances and frequency
      const totalRebalances = userPositions.reduce((sum, p) => sum + p.rebalanceEvents.length, 0);
      const avgDaysActive = userPositions.reduce((sum, p) => sum + this.calculateDaysActive(p.createdAt), 0) / userPositions.length;
      const rebalanceFrequency = (totalRebalances / avgDaysActive) * 30; // Per month
      
      // Calculate portfolio return
      const portfolioReturn = this.calculatePortfolioReturn(userPositions);

      return {
        userId,
        totalPositions: userPositions.length,
        activePositions: activePositions.length,
        totalValue,
        totalFeesEarned,
        avgHealthScore,
        bestPerformingPosition: bestPerforming.positionId,
        worstPerformingPosition: worstPerforming.positionId,
        totalRebalances,
        rebalanceFrequency,
        portfolioReturn,
        riskDistribution
      };
    } catch (error) {
      logger.error({ error, userId }, "Failed to generate portfolio analytics");
      throw error;
    }
  }

  /**
   * Analyze rebalance history and effectiveness
   */
  async analyzeRebalanceHistory(positionId: string): Promise<RebalanceAnalytics> {
    try {
      const rebalanceEvents = await db.query.rebalanceEvents.findMany({
        where: eq(rebalanceEvents.positionId, positionId),
        orderBy: desc(rebalanceEvents.createdAt)
      });

      const rebalanceHistory = rebalanceEvents.map(event => ({
        date: event.createdAt,
        oldValue: parseFloat(event.oldValue),
        newValue: parseFloat(event.newValue),
        feesCollected: parseFloat(event.feesCollected),
        reason: event.reason,
        priceImpact: this.calculatePriceImpact(parseFloat(event.oldValue), parseFloat(event.newValue)),
        success: !!event.txHash // Assume success if txHash exists
      }));

      const avgRebalanceGain = this.calculateAverageRebalanceGain(rebalanceHistory);
      const rebalanceEfficiency = this.calculateRebalanceEfficiency(rebalanceHistory);
      const optimalFrequency = this.calculateOptimalRebalanceFrequency(rebalanceHistory);
      const nextRecommendation = this.calculateNextRebalanceRecommendation(rebalanceHistory, optimalFrequency);

      return {
        positionId,
        rebalanceHistory,
        avgRebalanceGain,
        rebalanceEfficiency,
        optimalRebalanceFrequency: optimalFrequency,
        nextRebalanceRecommendation: nextRecommendation
      };
    } catch (error) {
      logger.error({ error, positionId }, "Failed to analyze rebalance history");
      throw error;
    }
  }

  /**
   * Get positions that need immediate attention
   */
  async getPositionsNeedingAttention(userId?: string): Promise<{
    critical: PositionHealthMetrics[];
    high: PositionHealthMetrics[];
    recommendations: string[];
  }> {
    try {
      const whereClause = userId ? eq(positions.userId, userId) : undefined;
      
      const allPositions = await db.query.positions.findMany({
        where: whereClause
      });

      const healthMetrics = await Promise.all(
        allPositions.map(p => this.calculatePositionHealth(p.id))
      );

      const critical = healthMetrics.filter(h => h.riskLevel === 'CRITICAL');
      const high = healthMetrics.filter(h => h.riskLevel === 'HIGH');
      
      const recommendations = this.generateRecommendations(healthMetrics);

      return {
        critical,
        high,
        recommendations
      };
    } catch (error) {
      logger.error({ error, userId }, "Failed to get positions needing attention");
      throw error;
    }
  }

  // Private helper methods
  private calculatePriceDeviation(position: Position): number {
    if (!position.priceRangeMin || !position.priceRangeMax) {
      return 0;
    }
    
    // Mock current price - in real implementation, fetch from price service
    const currentPrice = parseFloat(position.currentValue) / parseFloat(position.initialAmount);
    const minPrice = parseFloat(position.priceRangeMin);
    const maxPrice = parseFloat(position.priceRangeMax);
    const optimalPrice = (minPrice + maxPrice) / 2;
    
    return Math.abs((currentPrice - optimalPrice) / optimalPrice) * 100;
  }

  private async calculateTimeInRange(position: Position): Promise<number> {
    // Mock implementation - in real scenario, track price history
    const daysActive = this.calculateDaysActive(position.createdAt);
    const rebalanceCount = position.rebalanceEvents?.length || 0;
    
    // Estimate based on rebalance frequency
    const estimatedTimeInRange = Math.max(0, 100 - (rebalanceCount / daysActive) * 100);
    return Math.min(100, estimatedTimeInRange);
  }

  private async estimateImpermanentLoss(position: Position): Promise<number> {
    // Simplified IL calculation - in real implementation, use actual price data
    const currentValue = parseFloat(position.currentValue);
    const initialAmount = parseFloat(position.initialAmount);
    const feesEarned = parseFloat(position.feesEarned);
    
    // Estimate IL as the difference between current value and what it would be without IL
    const estimatedValueWithoutIL = initialAmount * 1.1; // Assume 10% growth
    const impermanentLoss = Math.max(0, (estimatedValueWithoutIL - currentValue - feesEarned) / initialAmount * 100);
    
    return impermanentLoss;
  }

  private calculateFeesVsILRatio(position: Position, impermanentLoss: number): number {
    const feesEarned = parseFloat(position.feesEarned);
    const initialAmount = parseFloat(position.initialAmount);
    const feesPercentage = (feesEarned / initialAmount) * 100;
    
    return impermanentLoss > 0 ? feesPercentage / impermanentLoss : feesPercentage;
  }

  private calculateHealthScore(metrics: {
    priceDeviation: number;
    timeInRange: number;
    impermanentLoss: number;
    feesVsIL: number;
    rebalanceFrequency: number;
  }): number {
    const {
      priceDeviation,
      timeInRange,
      impermanentLoss,
      feesVsIL,
      rebalanceFrequency
    } = metrics;
    
    // Weighted scoring system
    const priceScore = Math.max(0, 100 - priceDeviation * 2); // Weight: 25%
    const rangeScore = timeInRange; // Weight: 25%
    const ilScore = Math.max(0, 100 - impermanentLoss * 5); // Weight: 20%
    const feesScore = Math.min(100, feesVsIL * 20); // Weight: 20%
    const rebalanceScore = Math.max(0, 100 - rebalanceFrequency * 5); // Weight: 10%
    
    const healthScore = (
      priceScore * 0.25 +
      rangeScore * 0.25 +
      ilScore * 0.20 +
      feesScore * 0.20 +
      rebalanceScore * 0.10
    );
    
    return Math.round(Math.max(0, Math.min(100, healthScore)));
  }

  private determineRiskLevel(healthScore: number, priceDeviation: number, impermanentLoss: number): 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL' {
    if (healthScore < 30 || priceDeviation > 20 || impermanentLoss > 15) {
      return 'CRITICAL';
    } else if (healthScore < 50 || priceDeviation > 10 || impermanentLoss > 8) {
      return 'HIGH';
    } else if (healthScore < 70 || priceDeviation > 5 || impermanentLoss > 4) {
      return 'MEDIUM';
    } else {
      return 'LOW';
    }
  }

  private calculateDaysActive(createdAt: Date): number {
    const now = new Date();
    const diffTime = Math.abs(now.getTime() - createdAt.getTime());
    return Math.ceil(diffTime / (1000 * 60 * 60 * 24));
  }

  private calculateTotalReturn(position: Position): number {
    const currentValue = parseFloat(position.currentValue);
    const initialAmount = parseFloat(position.initialAmount);
    const feesEarned = parseFloat(position.feesEarned);
    
    return ((currentValue + feesEarned - initialAmount) / initialAmount) * 100;
  }

  private calculateAnnualizedReturn(totalReturn: number, daysActive: number): number {
    if (daysActive === 0) return 0;
    return (Math.pow(1 + totalReturn / 100, 365 / daysActive) - 1) * 100;
  }

  private analyzeRebalancePerformance(rebalanceEvents: RebalanceEvent[]) {
    const successful = rebalanceEvents.filter(e => e.txHash).length;
    const failed = rebalanceEvents.length - successful;
    const successRate = rebalanceEvents.length > 0 ? (successful / rebalanceEvents.length) * 100 : 0;
    
    let avgInterval = 0;
    if (rebalanceEvents.length > 1) {
      const intervals = [];
      for (let i = 1; i < rebalanceEvents.length; i++) {
        const diff = rebalanceEvents[i].createdAt.getTime() - rebalanceEvents[i - 1].createdAt.getTime();
        intervals.push(diff / (1000 * 60 * 60 * 24)); // Convert to days
      }
      avgInterval = intervals.reduce((sum, interval) => sum + interval, 0) / intervals.length;
    }
    
    return {
      successful,
      failed,
      successRate,
      avgInterval
    };
  }

  private async calculateVolatilityMetrics(position: Position) {
    // Mock implementation - in real scenario, use historical price data
    return {
      maxDrawdown: 5.2, // Mock 5.2% max drawdown
      sharpeRatio: 1.8, // Mock Sharpe ratio
      volatility: 12.5, // Mock 12.5% volatility
      profitFactor: 2.1 // Mock profit factor
    };
  }

  private calculateRiskDistribution(healthScores: PositionHealthMetrics[]) {
    const total = healthScores.length;
    if (total === 0) {
      return { low: 0, medium: 0, high: 0, critical: 0 };
    }
    
    const distribution = healthScores.reduce(
      (acc, score) => {
        acc[score.riskLevel.toLowerCase()]++;
        return acc;
      },
      { low: 0, medium: 0, high: 0, critical: 0 }
    );
    
    return {
      low: (distribution.low / total) * 100,
      medium: (distribution.medium / total) * 100,
      high: (distribution.high / total) * 100,
      critical: (distribution.critical / total) * 100
    };
  }

  private calculatePortfolioReturn(positions: Position[]): number {
    const totalInitial = positions.reduce((sum, p) => sum + parseFloat(p.initialAmount), 0);
    const totalCurrent = positions.reduce((sum, p) => sum + parseFloat(p.currentValue), 0);
    const totalFees = positions.reduce((sum, p) => sum + parseFloat(p.feesEarned), 0);
    
    if (totalInitial === 0) return 0;
    return ((totalCurrent + totalFees - totalInitial) / totalInitial) * 100;
  }

  private calculatePriceImpact(oldValue: number, newValue: number): number {
    if (oldValue === 0) return 0;
    return ((newValue - oldValue) / oldValue) * 100;
  }

  private calculateAverageRebalanceGain(history: any[]): number {
    if (history.length === 0) return 0;
    const gains = history.map(h => h.priceImpact);
    return gains.reduce((sum, gain) => sum + gain, 0) / gains.length;
  }

  private calculateRebalanceEfficiency(history: any[]): number {
    if (history.length === 0) return 0;
    const successfulGains = history.filter(h => h.success && h.priceImpact > 0);
    return (successfulGains.length / history.length) * 100;
  }

  private calculateOptimalRebalanceFrequency(history: any[]): number {
    // Analyze historical data to suggest optimal frequency
    // Mock implementation - return 7 days as default
    return 7;
  }

  private calculateNextRebalanceRecommendation(history: any[], optimalFrequency: number): Date | null {
    if (history.length === 0) return null;
    
    const lastRebalance = history[0].date;
    const nextRecommended = new Date(lastRebalance.getTime() + optimalFrequency * 24 * 60 * 60 * 1000);
    
    return nextRecommended > new Date() ? nextRecommended : new Date();
  }

  private generateRecommendations(healthMetrics: PositionHealthMetrics[]): string[] {
    const recommendations = [];
    
    const criticalPositions = healthMetrics.filter(h => h.riskLevel === 'CRITICAL');
    const highRiskPositions = healthMetrics.filter(h => h.riskLevel === 'HIGH');
    
    if (criticalPositions.length > 0) {
      recommendations.push(`${criticalPositions.length} position(s) need immediate rebalancing`);
    }
    
    if (highRiskPositions.length > 0) {
      recommendations.push(`${highRiskPositions.length} position(s) are at high risk`);
    }
    
    const avgHealth = healthMetrics.reduce((sum, h) => sum + h.healthScore, 0) / healthMetrics.length;
    if (avgHealth < 60) {
      recommendations.push('Consider adjusting rebalance thresholds for better performance');
    }
    
    return recommendations;
  }
}

export const positionAnalyticsService = new PositionAnalyticsService();