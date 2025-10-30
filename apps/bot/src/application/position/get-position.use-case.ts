import { IPositionRepository } from "@/domain/position/position.repository";
import { IUserRepository } from "@/domain/user/user.repository";
import { TokenAmount } from "@/domain/shared/value-objects";
import { DexType, UserPosition, PositionWithPrices } from "@/types/core.types";
import { IDexAdapter } from "@/types/dex-adapter.interface";
import { logger } from "@/utils/logger";
import { PriceEnrichmentService } from "@/services/price-enrichment.service";
import { DexRegistryLike } from "./create-position.use-case";
import { findRebalanceEventsByPositionId } from "@/db/queries";

export interface GetPositionCommand {
  positionId: string;
}

export interface GetPositionResult {
  success: boolean;
  position?: UserPosition;
  error?: string;
}

export class GetPositionUseCase {
  private readonly enrichmentService: PriceEnrichmentService;

  constructor(
    private readonly positionRepository: IPositionRepository,
    private readonly dexRegistry: DexRegistryLike,
    private readonly userRepository: IUserRepository,
    enrichmentService?: PriceEnrichmentService
  ) {
    this.enrichmentService = enrichmentService ?? new PriceEnrichmentService();
  }

  async execute(command: GetPositionCommand): Promise<GetPositionResult> {
    try {
      if (!command?.positionId) {
        return { success: false, error: "Position ID is required" };
      }

      const position = await this.positionRepository.findById(
        command.positionId
      );

      if (!position) {
        return { success: false, error: "Position not found" };
      }

      const user = await this.userRepository.findById(position.userId);
      if (!user) {
        return { success: false, error: "User not found" };
      }
      const userAddress = user?.walletAddress ?? "";

      const isRebalancingEnabled =
        user.getPreferences().autoRebalanceEnabled ?? false;
      const rebalanceThreshold = user.getPreferences().rebalanceThreshold;

      const adapter: IDexAdapter = this.dexRegistry.get(
        position.dex as DexType
      );

      let onchainPosition: PositionWithPrices | null = null;
      try {
        const rawPosition = await adapter.getPosition(
          position.positionAddress,
          position.poolAddress
        );

        if (rawPosition) {
          const tokenXAmount = this.parseTokenAmount(
            rawPosition.tokenAAmount,
            position.tokenX.symbol,
            position.tokenX.decimals
          );
          const tokenYAmount = this.parseTokenAmount(
            rawPosition.tokenBAmount,
            position.tokenY.symbol,
            position.tokenY.decimals
          );
          position.updateTokenAmounts(tokenXAmount, tokenYAmount);

          onchainPosition =
            await this.enrichmentService.enrichPosition(rawPosition);
        }
      } catch (err) {
        logger.warn(
          {
            err,
            positionId: position.id,
            positionAddress: position.positionAddress,
          },
          "[GetPositionUseCase] Failed to fetch on-chain position data"
        );
      }

      const enrichedPosition =
        await this.enrichmentService.enrichDomainPosition(
          position,
          onchainPosition
        );

      const durationDays = this.calculateDurationDays(position.createdAt);
      const rebalanceCount = await this.getRebalanceCount(position.id);

      const userPosition: UserPosition = {
        ...enrichedPosition,
        metadata: {
          ...enrichedPosition.metadata,
          isRebalancingEnabled,
          rebalanceThreshold,
          userAddress, // Add for worker compatibility
        },
        metrics: {
          claimedFeesUsd: enrichedPosition.claimedFeesUsd,
          totalPnlUsd: enrichedPosition.pnlUsd,
          durationDays,
          rebalanceCount,
        },
      };

      return {
        success: true,
        position: userPosition,
      };
    } catch (error) {
      logger.error({ error, command }, "[GetPositionUseCase] Unexpected error");
      return {
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
      };
    }
  }

  private parseTokenAmount(amount: string, symbol: string, decimals: number) {
    return TokenAmount.fromUi(symbol, parseFloat(amount), decimals);
  }

  /**
   * Calculate duration in days since position creation
   */
  private calculateDurationDays(createdAt: Date): number {
    const now = new Date();
    const diffMs = now.getTime() - createdAt.getTime();
    const diffDays = diffMs / (1000 * 60 * 60 * 24);
    return Math.max(0, Math.round(diffDays * 100) / 100); // Round to 2 decimal places
  }

  /**
   * Get rebalance count from database
   */
  private async getRebalanceCount(positionId: string): Promise<number> {
    try {
      const rebalanceEvents = await findRebalanceEventsByPositionId(positionId);
      return rebalanceEvents.length;
    } catch (err) {
      logger.warn(
        { err, positionId },
        "[GetPositionUseCase] Failed to fetch rebalance count"
      );
      return 0;
    }
  }
}
