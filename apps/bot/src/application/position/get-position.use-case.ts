import { IPositionRepository } from "@/domain/position/position.repository";
import type { Position } from "@/domain/position/position.entity";
import { IUserRepository } from "@/domain/user/user.repository";
import { Money, TokenAmount } from "@/domain/shared/value-objects";
import {
  DexType,
  UnifiedPool,
  UnifiedPosition,
  TokenPrice,
  PositionWithPrices,
  UserPosition,
} from "@/types/core.types";
import { IDexAdapter } from "@/types/dex-adapter.interface";
import { logger } from "@/utils/logger";
import { getTokenPriceService } from "@/services/token-price.service";
import { PriceEnrichmentService } from "@/services/price-enrichment.service";
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

export interface GetPositionEnrichedResult {
  success: boolean;
  position?: UserPosition;
  pool?: UnifiedPool;
  userAddress?: string;
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

      const adapter: IDexAdapter = this.dexRegistry.get(
        position.dex as DexType
      );

      let onchain: UnifiedPosition | undefined;

      try {
        onchain = await adapter.getPosition(
          position.positionAddress,
          position.poolAddress
        );

        if (onchain) {
          // Update domain entity with latest on-chain token amounts
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
        logger.warn(
          {
            err,
            positionId: position.id,
          },
          "Failed to enrich position with on-chain data"
        );
        console.error("Failed to enrich position with on-chain data", {
          err,
          positionId: position.id,
        });
      }

      let pool: UnifiedPool | undefined;
      if (command.includePool) {
        try {
          pool = await adapter.getPool(position.poolAddress);
        } catch (err) {
          logger.warn(
            {
              err,
              poolAddress: position.poolAddress,
            },
            "Failed to fetch pool metadata for position"
          );
        }
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
          logger.warn(
            {
              err,
              positionId: position.id,
            },
            "Failed to fetch token prices for position"
          );
        }
      }

      return {
        success: true,
        position,
        onchain,
        pool,
        prices,
        userAddress: command.userAddress,
      };
    } catch (error) {
      logger.error({ error }, "GetPositionUseCase.execute unexpected error");
      return {
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
      };
    }
  }

  /**
   * New enriched execution that returns a fully priced position
   */
  async executeEnriched(command: GetPositionCommand): Promise<GetPositionEnrichedResult> {
    const result = await this.execute({ ...command, includePrices: true });

    if (!result.success || !result.position) {
      return {
        success: false,
        error: result.error ?? "Failed to fetch position",
      };
    }

    try {
      const prices = result.prices
        ? (Object.entries(result.prices).reduce((acc, [key, value]) => {
            if (value) acc[key] = value;
            return acc;
          }, {} as Record<string, TokenPrice>))
        : await getTokenPriceService().getPrices([
            result.position.tokenX.address,
            result.position.tokenY.address,
          ]);

      const enrichedOnchain = result.onchain
        ? await this.enrichmentService.enrichPosition(result.onchain, prices)
        : undefined;

      const userPosition = await this.enrichmentService.enrichDomainPosition(
        result.position,
        enrichedOnchain,
        prices
      );

      return {
        success: true,
        position: userPosition,
        pool: result.pool,
        userAddress: result.userAddress,
      };
    } catch (error) {
      logger.error({ error }, "GetPositionUseCase.executeEnriched failed");
      return {
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
      };
    }
  }
}
