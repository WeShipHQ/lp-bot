import { IPositionRepository } from "@/domain/position/position.repository";
import type { Position } from "@/domain/position/position.entity";
import { IUserRepository } from "@/domain/user/user.repository";
import { Money, TokenAmount } from "@/domain/shared/value-objects";
import { DexType, UnifiedPool, UnifiedPosition } from "@/types/core.types";
import type { TokenPrice } from "@/types/token.types";
import { IDexAdapter } from "@/types/dex-adapter.interface";
import { logger } from "@/utils/logger";
import { getTokenPriceService } from "@/services/token-price.service";
import { DexRegistryLike } from "./create-position.use-case";

export interface GetPositionCommand {
  positionId?: string;
  positionAddress?: string;
  userId?: string;
  userAddress?: string;
  includePool?: boolean;
  includePrices?: boolean;
}

export interface GetPositionResult {
  success: boolean;
  position?: Position;
  onchain?: UnifiedPosition;
  pool?: UnifiedPool;
  prices?: Record<string, TokenPrice | undefined>;
  userAddress?: string;
  error?: string;
}

export class GetPositionUseCase {
  constructor(
    private readonly positionRepository: IPositionRepository,
    private readonly dexRegistry: DexRegistryLike,
    private readonly userRepository: IUserRepository
  ) {}

  async execute(command: GetPositionCommand): Promise<GetPositionResult> {
    try {
      if (!command?.positionId && !command?.positionAddress) {
        return { success: false, error: "Position identifier is required" };
      }

      let position: Position | null = null;
      if (command.positionId) {
        position = await this.positionRepository.findById(command.positionId);
      } else if (command.positionAddress) {
        position = await this.positionRepository.findByPositionAddress(
          command.positionAddress
        );
      }

      if (!position) {
        return { success: false, error: "Position not found" };
      }

      const resolvedUserId = command.userId ?? position.userId;
      let userAddress = command.userAddress;

      if (!userAddress && resolvedUserId) {
        try {
          const user = await this.userRepository.findById(resolvedUserId);
          userAddress = user?.walletAddress ?? undefined;
        } catch (err) {
          logger.warn(
            { err, resolvedUserId },
            "GetPositionUseCase.resolveUserAddress failed"
          );
        }
      }

      const adapter: IDexAdapter = this.dexRegistry.get(
        position.dex as DexType
      );

      let onchain: UnifiedPosition | undefined;
      const adapterContext = {
        userAddress,
        poolAddress: position.poolAddress,
      } as const;

      try {
        onchain = await adapter.getPosition(
          position.positionAddress,
          adapterContext
        );

        if (onchain) {
          position.updateCurrentValue(Money.usd(onchain.currentValueUsd));

          const tokenXAmount = TokenAmount.fromUi(
            position.tokenX.symbol,
            parseFloat(onchain.tokenAAmount),
            position.tokenX.decimals
          );
          const tokenYAmount = TokenAmount.fromUi(
            position.tokenY.symbol,
            parseFloat(onchain.tokenBAmount),
            position.tokenY.decimals
          );
          position.updateTokenAmounts(tokenXAmount, tokenYAmount);
        }
      } catch (err) {
        logger.warn({
          err,
          positionId: position.id,
        }, "Failed to enrich position with on-chain data");
        console.error("Failed to enrich position with on-chain data", {
          err,
          positionId: position.id,
        });
      }

      if (!userAddress) {
        logger.debug(
          { positionId: position.id },
          "On-chain enrichment executed without a resolved user address"
        );
      }

      let pool: UnifiedPool | undefined;
      if (command.includePool) {
        try {
          pool = await adapter.getPool(position.poolAddress);
        } catch (err) {
          logger.warn({
            err,
            poolAddress: position.poolAddress,
          }, "Failed to fetch pool metadata for position");
        }


      let prices: Record<string, TokenPrice | undefined> | undefined;
      if (command.includePrices) {
        try {
          const priceService = getTokenPriceService();
          prices = await priceService.getPrices([
            position.tokenX.address,
            position.tokenY.address,
          ]);
        } catch (err) {
          logger.warn({
            err,
            positionId: position.id,
          }, "Failed to fetch token prices for position");
        }
      }

      return {
        success: true,
        position,
        onchain,
        pool,
        prices,
        userAddress,
      };
    } catch (error) {
      logger.error({ error }, "GetPositionUseCase.execute unexpected error");
      return {
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
      };
    }
  }
}
