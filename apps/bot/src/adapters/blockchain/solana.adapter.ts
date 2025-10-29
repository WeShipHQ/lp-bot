import { Connection, PublicKey, VersionedTransaction, clusterApiUrl } from '@solana/web3.js';
import { CONFIG } from '@/config';
import { logger } from '@/utils/logger';
import { CircuitBreaker } from '@/infrastructure/resilience/circuit-breaker';
import { retry } from '@/infrastructure/resilience/retry';
import {
  normalizeRpcError,
  normalizeTransactionError,
  trackError,
} from '@/utils/errors';

export class SolanaAdapter {
  private primary: Connection;
  private secondary: Connection;
  private rotateOnError = true;
  private primaryBreaker: CircuitBreaker;
  private secondaryBreaker: CircuitBreaker;

  constructor(primaryUrl?: string, secondaryUrl?: string) {
    const p = primaryUrl || CONFIG.SOLANA.RPC_URL;
    const s = secondaryUrl || process.env.SOLANA_SECONDARY_RPC_URL || clusterApiUrl('mainnet-beta');
    this.primary = new Connection(p, 'confirmed');
    this.secondary = new Connection(s, 'confirmed');

    // Initialize circuit breakers for both RPC endpoints
    this.primaryBreaker = new CircuitBreaker({
      name: 'solana-primary-rpc',
      failureThreshold: 5,
      successThreshold: 2,
      timeoutMs: 30000, // 30 seconds before retry
    });

    this.secondaryBreaker = new CircuitBreaker({
      name: 'solana-secondary-rpc',
      failureThreshold: 5,
      successThreshold: 2,
      timeoutMs: 30000,
    });
  }

  getPrimaryEndpoint(): string {
    return this.primary.rpcEndpoint;
  }
  getSecondaryEndpoint(): string {
    return this.secondary.rpcEndpoint;
  }
  getConnection(): Connection {
    return this.primary;
  }

  async getBalance(address: string): Promise<number> {
    const pk = new PublicKey(address);

    try {
      return await this.primaryBreaker.execute(
        async () => {
          const balance = await retry(() => this.primary.getBalance(pk), {
            retries: 2,
            minDelayMs: 500,
          });
          return balance / 1e9;
        },
        async () => {
          // Fallback to secondary
          if (!this.rotateOnError) throw new Error('Primary RPC failed and rotation disabled');
          logger.warn('[SolanaAdapter] primary balance failed, using fallback');

          return await this.secondaryBreaker.execute(async () => {
            const balance = await retry(() => this.secondary.getBalance(pk), {
              retries: 2,
              minDelayMs: 500,
            });
            return balance / 1e9;
          });
        }
      );
    } catch (err) {
      const error = normalizeRpcError(
        err,
        this.primary.rpcEndpoint,
        'getBalance',
        { address }
      );
      trackError(error, 'getBalance');
      throw error;
    }
  }

  async getSignatureStatus(signature: string) {
    try {
      return await this.primaryBreaker.execute(
        async () => {
          const statuses = await retry(
            () => this.primary.getSignatureStatuses([signature]),
            { retries: 2, minDelayMs: 500 }
          );
          return statuses.value?.[0] || null;
        },
        async () => {
          if (!this.rotateOnError) throw new Error('Primary RPC failed and rotation disabled');
          logger.warn('[SolanaAdapter] primary status check failed, using fallback');

          return await this.secondaryBreaker.execute(async () => {
            const statuses = await retry(
              () => this.secondary.getSignatureStatuses([signature]),
              { retries: 2, minDelayMs: 500 }
            );
            return statuses.value?.[0] || null;
          });
        }
      );
    } catch (err) {
      const error = normalizeRpcError(
        err,
        this.primary.rpcEndpoint,
        'getSignatureStatus',
        { signature }
      );
      trackError(error, 'getSignatureStatus');
      throw error;
    }
  }

  async submitTransaction(tx: VersionedTransaction): Promise<string> {
    try {
      return await this.primaryBreaker.execute(
        async () => {
          return await retry(() => this.primary.sendRawTransaction(tx.serialize()), {
            retries: 1, // Only retry once for transaction submission
            minDelayMs: 1000,
          });
        },
        async () => {
          if (!this.rotateOnError) throw new Error('Primary RPC failed and rotation disabled');
          logger.warn('[SolanaAdapter] primary submit failed, using fallback');

          return await this.secondaryBreaker.execute(async () => {
            return await retry(() => this.secondary.sendRawTransaction(tx.serialize()), {
              retries: 1,
              minDelayMs: 1000,
            });
          });
        }
      );
    } catch (err) {
      const error = normalizeTransactionError(err, 'unknown', {
        endpoint: this.primary.rpcEndpoint,
      });
      trackError(error, 'submitTransaction');
      throw error;
    }
  }

  /**
   * Health check for primary RPC
   */
  async isHealthy(): Promise<boolean> {
    try {
      await this.primary.getSlot();
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Get circuit breaker states for monitoring
   */
  getCircuitBreakerStates() {
    return {
      primary: this.primaryBreaker.getState(),
      secondary: this.secondaryBreaker.getState(),
    };
  }
}
