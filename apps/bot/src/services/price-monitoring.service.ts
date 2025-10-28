// import { eq } from 'drizzle-orm';
// import { db } from '../db';
// import { positions, users } from '../db/schema';
// import { rebalanceService } from './rebalance.service';
// import { CONFIG } from '../config';

// export interface PriceData {
//   tokenAddress: string;
//   poolAddress: string;
//   price: number;
//   timestamp: Date;
//   volume24h?: number;
//   priceChange24h?: number;
//   source: 'meteora' | 'jupiter' | 'coingecko';
// }

// export interface PriceAlert {
//   positionId: string;
//   tokenAddress: string;
//   currentPrice: number;
//   previousPrice: number;
//   priceChange: number;
//   threshold: number;
//   alertType: 'rebalance_needed' | 'significant_move' | 'price_recovery';
//   timestamp: Date;
// }

// export interface MonitoringStats {
//   totalPositionsMonitored: number;
//   activeAlerts: number;
//   priceUpdatesLast24h: number;
//   averageResponseTime: number;
//   lastUpdateTime: Date;
// }

// /**
//  * Service for monitoring token prices and detecting rebalancing triggers
//  */
// export class PriceMonitoringService {
//   private priceCache = new Map<string, PriceData>();
//   private alertQueue: PriceAlert[] = [];
//   private monitoringActive = false;
//   private updateInterval: NodeJS.Timeout | null = null;
//   private readonly cacheExpiry = 30000; // 30 seconds
//   private readonly maxRetries = 3;
//   private readonly retryDelay = 1000;
//   private stats: MonitoringStats = {
//     totalPositionsMonitored: 0,
//     activeAlerts: 0,
//     priceUpdatesLast24h: 0,
//     averageResponseTime: 0,
//     lastUpdateTime: new Date(),
//   };

//   /**
//    * Start price monitoring for all active positions
//    */
//   async startMonitoring(): Promise<void> {
//     if (this.monitoringActive) {
//       console.log('[PriceMonitoring] Monitoring already active');
//       return;
//     }

//     console.log('[PriceMonitoring] Starting price monitoring service');
//     this.monitoringActive = true;

//     // Initial price update
//     await this.updateAllPrices();

//     // Set up periodic updates
//     this.updateInterval = setInterval(async () => {
//       try {
//         await this.updateAllPrices();
//         await this.processAlerts();
//       } catch (error) {
//         console.error('[PriceMonitoring] Error in monitoring cycle:', error);
//       }
//     }, CONFIG.REBALANCING.INTERVAL_MINUTES * 60 * 1000);

//     console.log(`[PriceMonitoring] Monitoring started with ${CONFIG.REBALANCING.INTERVAL_MINUTES}min intervals`);
//   }

//   /**
//    * Stop price monitoring
//    */
//   stopMonitoring(): void {
//     if (!this.monitoringActive) {
//       return;
//     }

//     console.log('[PriceMonitoring] Stopping price monitoring service');
//     this.monitoringActive = false;

//     if (this.updateInterval) {
//       clearInterval(this.updateInterval);
//       this.updateInterval = null;
//     }

//     this.priceCache.clear();
//     this.alertQueue = [];
//   }

//   /**
//    * Get current price for a specific token/pool
//    */
//   async getPrice(tokenAddress: string, poolAddress: string): Promise<PriceData | null> {
//     const cacheKey = `${tokenAddress}-${poolAddress}`;
//     const cached = this.priceCache.get(cacheKey);

//     // Return cached data if still valid
//     if (cached && Date.now() - cached.timestamp.getTime() < this.cacheExpiry) {
//       return cached;
//     }

//     // Fetch fresh price data
//     const priceData = await this.fetchPriceData(tokenAddress, poolAddress);
//     if (priceData) {
//       this.priceCache.set(cacheKey, priceData);
//     }

//     return priceData;
//   }

//   /**
//    * Get price history for a token (mock implementation)
//    */
//   async getPriceHistory(
//     tokenAddress: string,
//     poolAddress: string,
//     hours: number = 24
//   ): Promise<PriceData[]> {
//     // In a real implementation, this would fetch from a time-series database
//     // For now, return mock historical data
//     const currentPrice = await this.getPrice(tokenAddress, poolAddress);
//     if (!currentPrice) {
//       return [];
//     }

//     const history: PriceData[] = [];
//     const now = new Date();

//     for (let i = hours; i >= 0; i--) {
//       const timestamp = new Date(now.getTime() - i * 60 * 60 * 1000);
//       const priceVariation = (Math.random() - 0.5) * 0.1; // ±5% variation
//       const price = currentPrice.price * (1 + priceVariation);

//       history.push({
//         tokenAddress,
//         poolAddress,
//         price,
//         timestamp,
//         volume24h: Math.random() * 1000000,
//         priceChange24h: (Math.random() - 0.5) * 20,
//         source: 'meteora',
//       });
//     }

//     return history;
//   }

//   /**
//    * Check if a position needs rebalancing based on price movements
//    */
//   async checkPositionForRebalancing(positionId: string): Promise<PriceAlert | null> {
//     try {
//       const result = await db
//         .select({
//           position: positions,
//           user: users,
//         })
//         .from(positions)
//         .innerJoin(users, eq(positions.userId, users.id))
//         .where(eq(positions.id, positionId))
//         .limit(1);

//       if (!result.length) {
//         return null;
//       }

//       const { position, user } = result[0];

//       // Skip if auto-rebalance is disabled
//       if (!user.autoRebalanceEnabled) {
//         return null;
//       }

//       // Get current and previous prices
//       const currentPriceData = await this.getPrice(
//         position.tokenAddress,
//         position.poolAddress
//       );

//       if (!currentPriceData) {
//         console.error(`[PriceMonitoring] Failed to get price for position ${positionId}`);
//         return null;
//       }

//       // Get price from 1 hour ago for comparison
//       const priceHistory = await this.getPriceHistory(
//         position.tokenAddress,
//         position.poolAddress,
//         1
//       );

//       const previousPrice = priceHistory.length > 1 ? priceHistory[0].price : currentPriceData.price;
//       const priceChange = ((currentPriceData.price - previousPrice) / previousPrice) * 100;
//       const threshold = parseFloat(user.rebalanceThreshold.toString());

//       // Determine alert type
//       let alertType: PriceAlert['alertType'] = 'significant_move';

//       if (Math.abs(priceChange) >= threshold) {
//         alertType = 'rebalance_needed';
//       } else if (priceChange > 0 && previousPrice < currentPriceData.price * 0.95) {
//         alertType = 'price_recovery';
//       }

//       // Only create alert if significant movement or rebalancing needed
//       if (Math.abs(priceChange) >= threshold * 0.5) {
//         const alert: PriceAlert = {
//           positionId,
//           tokenAddress: position.tokenAddress,
//           currentPrice: currentPriceData.price,
//           previousPrice,
//           priceChange,
//           threshold,
//           alertType,
//           timestamp: new Date(),
//         };

//         return alert;
//       }

//       return null;
//     } catch (error) {
//       console.error(`[PriceMonitoring] Error checking position ${positionId}:`, error);
//       return null;
//     }
//   }

//   /**
//    * Get monitoring statistics
//    */
//   getStats(): MonitoringStats {
//     return { ...this.stats };
//   }

//   /**
//    * Get current alerts in queue
//    */
//   getActiveAlerts(): PriceAlert[] {
//     return [...this.alertQueue];
//   }

//   /**
//    * Clear processed alerts
//    */
//   clearProcessedAlerts(): void {
//     this.alertQueue = [];
//     this.stats.activeAlerts = 0;
//   }

//   /**
//    * Add manual price alert
//    */
//   addAlert(alert: PriceAlert): void {
//     this.alertQueue.push(alert);
//     this.stats.activeAlerts = this.alertQueue.length;
//     console.log(`[PriceMonitoring] Added ${alert.alertType} alert for position ${alert.positionId}`);
//   }

//   /**
//    * Update prices for all active positions
//    */
//   private async updateAllPrices(): Promise<void> {
//     const startTime = Date.now();

//     try {
//       console.log('[PriceMonitoring] Starting price update cycle');

//       // Get all active positions with auto-rebalance enabled
//       const activePositions = await db
//         .select({
//           id: positions.id,
//           tokenAddress: positions.tokenAddress,
//           poolAddress: positions.poolAddress,
//         })
//         .from(positions)
//         .innerJoin(users, eq(positions.userId, users.id))
//         .where(
//           eq(positions.status, 'ACTIVE')
//         );

//       this.stats.totalPositionsMonitored = activePositions.length;
//       let updatedCount = 0;
//       let alertsGenerated = 0;

//       // Update prices and check for alerts
//       for (const position of activePositions) {
//         try {
//           // Update price in cache
//           const priceData = await this.fetchPriceData(
//             position.tokenAddress,
//             position.poolAddress
//           );

//           if (priceData) {
//             const cacheKey = `${position.tokenAddress}-${position.poolAddress}`;
//             this.priceCache.set(cacheKey, priceData);
//             updatedCount++;

//             // Check for rebalancing alerts
//             const alert = await this.checkPositionForRebalancing(position.id);
//             if (alert) {
//               this.addAlert(alert);
//               alertsGenerated++;
//             }
//           }
//         } catch (error) {
//           console.error(`[PriceMonitoring] Error updating position ${position.id}:`, error);
//         }
//       }

//       const responseTime = Date.now() - startTime;
//       this.stats.averageResponseTime = responseTime;
//       this.stats.priceUpdatesLast24h += updatedCount;
//       this.stats.lastUpdateTime = new Date();

//       console.log(
//         `[PriceMonitoring] Updated ${updatedCount}/${activePositions.length} positions, ` +
//         `generated ${alertsGenerated} alerts in ${responseTime}ms`
//       );
//     } catch (error) {
//       console.error('[PriceMonitoring] Error in price update cycle:', error);
//     }
//   }

//   /**
//    * Process alerts and trigger rebalancing if needed
//    */
//   private async processAlerts(): Promise<void> {
//     if (this.alertQueue.length === 0) {
//       return;
//     }

//     console.log(`[PriceMonitoring] Processing ${this.alertQueue.length} alerts`);

//     const alertsToProcess = [...this.alertQueue];
//     this.alertQueue = [];

//     for (const alert of alertsToProcess) {
//       try {
//         if (alert.alertType === 'rebalance_needed') {
//           console.log(
//             `[PriceMonitoring] Triggering rebalance for position ${alert.positionId} ` +
//             `(${alert.priceChange.toFixed(2)}% change)`
//           );

//           // Trigger rebalancing through RebalanceService
//           const rebalanceResult = await rebalanceService.executeRebalance(alert.positionId);

//           if (rebalanceResult.success) {
//             console.log(
//               `[PriceMonitoring] Rebalance successful for position ${alert.positionId}: ` +
//               `${rebalanceResult.transactionId}`
//             );
//           } else {
//             console.error(
//               `[PriceMonitoring] Rebalance failed for position ${alert.positionId}: ` +
//               `${rebalanceResult.error}`
//             );
//             // Re-queue the alert for retry (with some delay logic)
//             setTimeout(() => {
//               this.addAlert(alert);
//             }, 5 * 60 * 1000); // Retry in 5 minutes
//           }
//         } else {
//           console.log(
//             `[PriceMonitoring] ${alert.alertType} alert for position ${alert.positionId}: ` +
//             `${alert.priceChange.toFixed(2)}% change`
//           );
//         }
//       } catch (error) {
//         console.error(`[PriceMonitoring] Error processing alert for ${alert.positionId}:`, error);
//       }
//     }

//     this.stats.activeAlerts = this.alertQueue.length;
//   }

//   /**
//    * Fetch price data from Meteora API
//    */
//   private async fetchPriceData(
//     tokenAddress: string,
//     poolAddress: string
//   ): Promise<PriceData | null> {
//     let retries = 0;

//     while (retries < this.maxRetries) {
//       try {
//         // Try to get pool info from Meteora
//         const poolData: any = await meteoraApiClient.getPool(poolAddress);

//         if (poolData) {
//           return {
//             tokenAddress,
//             poolAddress,
//             price: parseFloat(poolData.price),
//             timestamp: new Date(),
//             volume24h: poolData.volume24h ? parseFloat(poolData.volume24h) : undefined,
//             priceChange24h: poolData.priceChange24h ? parseFloat(poolData.priceChange24h) : undefined,
//             source: 'meteora',
//           };
//         }

//         throw new Error('No pool data received');
//       } catch (error) {
//         retries++;
//         console.error(
//           `[PriceMonitoring] Error fetching price (attempt ${retries}/${this.maxRetries}):`,
//           error
//         );

//         if (retries < this.maxRetries) {
//           await new Promise(resolve => setTimeout(resolve, this.retryDelay * retries));
//         }
//       }
//     }

//     return null;
//   }

//   /**
//    * Get price change percentage over a specific period
//    */
//   async getPriceChange(
//     tokenAddress: string,
//     poolAddress: string,
//     hours: number = 24
//   ): Promise<number | null> {
//     try {
//       const history = await this.getPriceHistory(tokenAddress, poolAddress, hours);

//       if (history.length < 2) {
//         return null;
//       }

//       const oldestPrice = history[0].price;
//       const newestPrice = history[history.length - 1].price;

//       return ((newestPrice - oldestPrice) / oldestPrice) * 100;
//     } catch (error) {
//       console.error('[PriceMonitoring] Error calculating price change:', error);
//       return null;
//     }
//   }

//   /**
//    * Check if monitoring is active
//    */
//   isMonitoringActive(): boolean {
//     return this.monitoringActive;
//   }

//   /**
//    * Force update prices for a specific position
//    */
//   async forceUpdatePosition(positionId: string): Promise<boolean> {
//     try {
//       const position = await db
//         .select({
//           tokenAddress: positions.tokenAddress,
//           poolAddress: positions.poolAddress,
//         })
//         .from(positions)
//         .where(eq(positions.id, positionId))
//         .limit(1);

//       if (!position.length) {
//         return false;
//       }

//       const priceData = await this.fetchPriceData(
//         position[0].tokenAddress,
//         position[0].poolAddress
//       );

//       if (priceData) {
//         const cacheKey = `${position[0].tokenAddress}-${position[0].poolAddress}`;
//         this.priceCache.set(cacheKey, priceData);

//         // Check for alerts
//         const alert = await this.checkPositionForRebalancing(positionId);
//         if (alert) {
//           this.addAlert(alert);
//         }

//         return true;
//       }

//       return false;
//     } catch (error) {
//       console.error(`[PriceMonitoring] Error force updating position ${positionId}:`, error);
//       return false;
//     }
//   }
// }

// export const priceMonitoringService = new PriceMonitoringService();
