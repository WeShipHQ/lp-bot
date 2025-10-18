import { Connection, PublicKey, VersionedTransaction, clusterApiUrl, RpcResponseAndContext, SignatureResult } from '@solana/web3.js';
import { CONFIG } from '@/config';
import { logger } from '@/utils/logger';

export class SolanaAdapter {
  private primary: Connection;
  private secondary: Connection;
  private rotateOnError = true;

  constructor(primaryUrl?: string, secondaryUrl?: string) {
    const p = primaryUrl || CONFIG.SOLANA.RPC_URL;
    const s = secondaryUrl || process.env.SOLANA_SECONDARY_RPC_URL || clusterApiUrl('mainnet-beta');
    this.primary = new Connection(p, 'confirmed');
    this.secondary = new Connection(s, 'confirmed');
  }

  getPrimaryEndpoint(): string { return this.primary.rpcEndpoint; }
  getSecondaryEndpoint(): string { return this.secondary.rpcEndpoint; }

  async getBalance(address: string): Promise<number> {
    const pk = new PublicKey(address);
    try {
      return (await this.primary.getBalance(pk)) / 1e9;
    } catch (err) {
      if (!this.rotateOnError) throw err;
      logger.warn({ err }, '[SolanaAdapter] primary balance failed, fallback');
      return (await this.secondary.getBalance(pk)) / 1e9;
    }
  }

  async getSignatureStatus(signature: string) {
    try {
      const s = await this.primary.getSignatureStatuses([signature]);
      return s.value?.[0] || null;
    } catch (err) {
      if (!this.rotateOnError) throw err;
      logger.warn({ err }, '[SolanaAdapter] primary status failed, fallback');
      const s = await this.secondary.getSignatureStatuses([signature]);
      return s.value?.[0] || null;
    }
  }

  async submitTransaction(tx: VersionedTransaction): Promise<string> {
    try {
      return await this.primary.sendRawTransaction(tx.serialize());
    } catch (err) {
      if (!this.rotateOnError) throw err;
      logger.warn({ err }, '[SolanaAdapter] primary submit failed, fallback');
      return await this.secondary.sendRawTransaction(tx.serialize());
    }
  }
}
