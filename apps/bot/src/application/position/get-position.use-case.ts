import { IPositionRepository } from '@/domain/position/position.repository';
import { Money, TokenAmount } from '@/domain/shared/value-objects';
import { DexType, UnifiedPosition } from '@/types/core.types';
import { IDexAdapter } from '@/types/dex-adapter.interface';
import { logger } from '@/utils/logger';
import { DexRegistryLike } from './create-position.use-case';

export interface GetPositionCommand {
  positionId: string;
}

export interface GetPositionResult {
  success: boolean;
  position?: import('@/domain/position/position.entity').Position;
  onchain?: UnifiedPosition;
  error?: string;
}

export class GetPositionUseCase {
  constructor(
    private readonly positionRepository: IPositionRepository,
    private readonly dexRegistry: DexRegistryLike
  ) {}

  async execute(command: GetPositionCommand): Promise<GetPositionResult> {
    try {
      if (!command?.positionId) {
        return { success: false, error: 'Position ID is required' };
      }

      const position = await this.positionRepository.findById(command.positionId);
      if (!position) {
        return { success: false, error: 'Position not found' };
      }

      const dexType: DexType = position.dex;
      const adapter: IDexAdapter = this.dexRegistry.get(dexType);

      // Fetch latest on-chain data and enrich the domain entity in-memory
      let onchain: UnifiedPosition | undefined;
      try {
        onchain = await adapter.getPosition(position.positionAddress);

        // Update domain entity with latest known values (not persisted here)
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
        logger.warn('Failed to enrich position with on-chain data', { err });
      }

      return { success: true, position, onchain };
    } catch (error) {
      logger.error('GetPositionUseCase.execute unexpected error', { error });
      return { success: false, error: error instanceof Error ? error.message : 'Unknown error' };
    }
  }
}
