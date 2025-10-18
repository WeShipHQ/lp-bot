import { Job } from "bullmq";
import { IWorker } from "../worker-registry";
import { TransactionConfirmJobData } from "../job-definitions";
import { logger } from "@/utils/logger";
import { SolanaAdapter } from "@/adapters/blockchain/solana.adapter";
import { db, pendingTransactions } from "@/db";
import { eq } from "drizzle-orm";
import { PositionRepository } from "@/infrastructure/database/repositories/position.repository";

export class TransactionConfirmWorker implements IWorker<TransactionConfirmJobData> {
  constructor(
    private readonly solana: SolanaAdapter,
    private readonly positionRepository: PositionRepository,
  ) {}

  async process(job: Job<TransactionConfirmJobData>) {
    const { signature, operationType, userId, positionId, positionAddress, submittedAt } = job.data;
    const started = Date.now();

    try {
      const status = await this.solana.getSignatureStatus(signature);
      if (!status || (!status.confirmationStatus && !status.err)) {
        // Pending/no info: decide on retry vs timeout
        const [ptx] = await db.select().from(pendingTransactions).where(eq(pendingTransactions.signature, signature));
        const created = ptx?.createdAt || (submittedAt ? new Date(submittedAt) : new Date(Date.now() - 1000));
        const ageMs = Date.now() - new Date(created).getTime();
        const timeoutMs = 5 * 60 * 1000; // 5 minutes
        if (ageMs > timeoutMs) {
          await db.update(pendingTransactions)
            .set({ status: 'FAILED', updatedAt: new Date(), errorMessage: 'Timeout while waiting for confirmation' })
            .where(eq(pendingTransactions.signature, signature));
          logger.warn({ signature }, '[TxConfirmWorker] Marked as FAILED due to timeout');
          return { confirmed: false, timeout: true };
        }
        // Re-throw to trigger retry/backoff
        throw new Error('Pending confirmation');
      }

      if (status?.err) {
        await db.update(pendingTransactions)
          .set({ status: 'FAILED', updatedAt: new Date(), errorMessage: JSON.stringify(status.err) })
          .where(eq(pendingTransactions.signature, signature));
        logger.warn({ signature }, '[TxConfirmWorker] Transaction failed');
        return { confirmed: false, failed: true };
      }

      // Consider confirmed once confirmationStatus present and not "processed"
      await db.update(pendingTransactions)
        .set({ status: 'COMPLETED', updatedAt: new Date() })
        .where(eq(pendingTransactions.signature, signature));

      // Domain side-effects
      try {
        if (operationType === 'REBALANCE') {
          let pos = positionId ? await this.positionRepository.findById(positionId) : null;
          if (!pos && positionAddress) {
            pos = await this.positionRepository.findByPositionAddress(positionAddress);
          }
          if (pos) {
            pos.completeRebalancing();
            await this.positionRepository.update(pos);
          }
        } else if (operationType === 'CLOSE_POSITION') {
          let pos = positionId ? await this.positionRepository.findById(positionId) : null;
          if (!pos && positionAddress) pos = await this.positionRepository.findByPositionAddress(positionAddress);
          if (pos && !pos.isClosed()) {
            pos.close();
            await this.positionRepository.update(pos);
          }
        }
      } catch (err) {
        logger.warn({ err }, '[TxConfirmWorker] Post-confirm side-effects failed');
      }

      const duration = Date.now() - started;
      logger.info({ signature, operationType, duration }, '[TxConfirmWorker] Confirmed');
      return { confirmed: true, status };
    } catch (error) {
      logger.debug({ error, signature }, '[TxConfirmWorker] Pending or error');
      throw error; // rely on backoff/attempts
    }
  }
}
