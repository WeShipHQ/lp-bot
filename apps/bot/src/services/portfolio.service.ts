/**
 * @deprecated Use portfolio use cases via DI (GetPortfolioUseCase, SyncPortfolioUseCase, CalculateMetricsUseCase)
 * and adapter-based enrichment. This service will be removed after migration.
 */
import { PublicKey } from "@solana/web3.js";
import { PositionInfo } from "@meteora-ag/dlmm";
import { jupiterService } from "./jupiter.service";
import { MeteoraApiClient, meteoraApiClient } from "@/adapters/dex/meteora";
import {
  DlmmClaimFee,
  DlmmClaimReward,
  DlmmDepositWithdraw,
  PortfolioPosition,
  PortfolioResult,
  PortfolioTotals,
} from "@/types/portfolio.types";
import { meteoraDlmmService } from "@/adapters/dex/meteora";
import { getTokenPriceService } from "@/services/token-price.service";

// Numeric helpers (data-layer)
const fromRawAmount = (raw?: string | bigint | number, decimals = 0) =>
  (raw ? Number(raw) : 0) / Math.pow(10, decimals || 0);

type BnLike = { toString(): string } | number | bigint;

const toIsoFromBignumSeconds = (bnLike?: BnLike) => {
  const sec = bnLike ? Number(bnLike.toString()) : undefined;
  return sec ? new Date(sec * 1000).toISOString() : new Date().toISOString();
};

// s-sum, it-item
const sumClaimFeesInUsd = (arr: DlmmClaimFee[]) =>
  arr.reduce(
    (s, it) =>
      s +
      Number(it.token_x_usd_amount || 0) +
      Number(it.token_y_usd_amount || 0),
    0
  );

const sumRewardsInUsd = (arr: DlmmClaimReward[]) =>
  arr.reduce((s, it) => s + Number(it.token_usd_amount || 0), 0);

const sumDepositsWithdrawalsInUsd = (arr: DlmmDepositWithdraw[]) =>
  arr.reduce(
    (s, it) =>
      s +
      Number(it.token_x_usd_amount || 0) +
      Number(it.token_y_usd_amount || 0),
    0
  );
class PortfolioService {
  private readonly meteoraApi: MeteoraApiClient = meteoraApiClient;

  // ----- Helpers -----------------------------------------------------------
  private toRawValue(value: unknown): string | number | bigint | undefined {
    if (value == null) return undefined;
    const maybe = value as { toString?: () => string };
    return typeof maybe === "object" && typeof maybe.toString === "function"
      ? maybe.toString()
      : (value as string | number | bigint | undefined);
  }

  private getPoolFeeTvlRatio(poolInfo: unknown): number | undefined {
    const feeTvlRatioUnknown = (poolInfo as { fee_tvl_ratio?: unknown })
      ?.fee_tvl_ratio;
    if (typeof feeTvlRatioUnknown === "number") return feeTvlRatioUnknown;
    if (
      feeTvlRatioUnknown &&
      typeof feeTvlRatioUnknown === "object" &&
      feeTvlRatioUnknown !== null
    ) {
      const day = (feeTvlRatioUnknown as { hour_24?: unknown }).hour_24;
      return typeof day === "number" ? day : undefined;
    }
    return undefined;
  }

  private computeNetProfitUsd(args: {
    current_value_usd: number;
    total_withdrawals_usd: number;
    total_claimed_usd: number;
    total_unclaimed_usd: number;
    total_deposits_usd: number;
  }): number {
    const {
      current_value_usd,
      total_withdrawals_usd,
      total_claimed_usd,
      total_unclaimed_usd,
      total_deposits_usd,
    } = args;
    return (
      current_value_usd +
      total_withdrawals_usd +
      total_unclaimed_usd +
      total_claimed_usd -
      total_deposits_usd
    );
  }

  private computeNetProfitPercentage(
    net_profit_usd: number,
    total_deposits_usd: number
  ): number {
    return total_deposits_usd > 0
      ? (net_profit_usd / total_deposits_usd) * 100
      : 0;
  }

  private computePnlUsd(args: {
    total_claimed_fees_usd: number;
    total_withdrawals_usd: number;
    total_deposits_usd: number;
  }): number {
    const {
      total_claimed_fees_usd,
      total_withdrawals_usd,
      total_deposits_usd,
    } = args;
    return total_claimed_fees_usd + total_withdrawals_usd - total_deposits_usd;
  }

  private computePnlPct(pnl_usd: number, total_deposits_usd: number): number {
    return (pnl_usd / total_deposits_usd) * 100;
  }
  private async getLatestUsdPrices(
    xMint: string,
    yMint: string,
    jupiterFallback: { xPrice?: number; yPrice?: number }
  ): Promise<{ xUsd: number; yUsd: number }> {
    let xUsd = Number(jupiterFallback.xPrice ?? 0);
    let yUsd = Number(jupiterFallback.yPrice ?? 0);

    try {
      const svc = getTokenPriceService();
      const prices = await svc.getPrices([xMint, yMint]);
      const px = prices[xMint]?.price;
      const py = prices[yMint]?.price;
      if (typeof px === "number" && px > 0) xUsd = px;
      if (typeof py === "number" && py > 0) yUsd = py;
    } catch {
      console.error("Failed to get latest USD prices", xMint, yMint);
    }

    return { xUsd, yUsd };
  }

  private computePriceFromBin(
    binId: number,
    binStepBps: number,
    xDecimals: number,
    yDecimals: number
  ): number {
    const BASIS_POINT_MAX = 10000;
    const step = Number(binStepBps) / BASIS_POINT_MAX; // e.g., 25 => 0.0025
    const base = 1 + step;
    // price = (1 + binStep/10000)^binId
    const raw = Math.pow(base, binId);
    const decimalFactor = Math.pow(10, xDecimals - yDecimals);
    return raw * decimalFactor;
  }

  async getPositionByAddress(
    positionAddress: string,
    poolAddress: string
  ): Promise<
    | { success: true; data: PortfolioPosition }
    | { success: false; message: string }
  > {
    try {
      const { lpPair, lbPosition } = await meteoraDlmmService.getPosition(
        positionAddress,
        poolAddress
      );

      const xMint = lpPair.tokenXMint.toString();
      const yMint = lpPair.tokenYMint.toString();

      const [xInfo, yInfo, poolInfo] = await Promise.all([
        jupiterService.getTokenInfo(xMint),
        jupiterService.getTokenInfo(yMint),
        this.meteoraApi.getPool(poolAddress),
      ]);

      const xDecimals = Number(xInfo?.decimals ?? 0);
      const yDecimals = Number(yInfo?.decimals ?? 0);
      const { xUsd: xPrice, yUsd: yPrice } = await this.getLatestUsdPrices(
        xMint,
        yMint,
        {
          xPrice: xInfo?.price as number | undefined,
          yPrice: yInfo?.price as number | undefined,
        }
      );

      const activeId = Number(lpPair.activeId);
      const binStepBps = Number(lpPair.binStep);

      const positionData = lbPosition.positionData as unknown as {
        lowerBinId: number;
        upperBinId: number;
        totalXAmount?: string | bigint | number;
        totalYAmount?: string | bigint | number;
        totalXAmountExcludeTransferFee?: string | bigint | number;
        totalYAmountExcludeTransferFee?: string | bigint | number;
        feeX?: string | bigint | number;
        feeY?: string | bigint | number;
        feeXExcludeTransferFee?: string | bigint | number;
        feeYExcludeTransferFee?: string | bigint | number;
        rewardOne?: string | bigint | number;
        rewardTwo?: string | bigint | number;
        rewardOneExcludeTransferFee?: string | bigint | number;
        rewardTwoExcludeTransferFee?: string | bigint | number;
        totalClaimedFeeXAmount?: string | bigint | number;
        totalClaimedFeeYAmount?: string | bigint | number;
        lastUpdatedAt?: BnLike;
      };

      const totalXRaw = this.toRawValue(
        positionData.totalXAmountExcludeTransferFee ?? positionData.totalXAmount
      );
      const totalYRaw = this.toRawValue(
        positionData.totalYAmountExcludeTransferFee ?? positionData.totalYAmount
      );
      const rewardOneRaw = this.toRawValue(
        positionData.rewardOneExcludeTransferFee ?? positionData.rewardOne
      );
      const rewardTwoRaw = this.toRawValue(
        positionData.rewardTwoExcludeTransferFee ?? positionData.rewardTwo
      );
      const current_x_amount = fromRawAmount(totalXRaw, xDecimals);
      const current_y_amount = fromRawAmount(totalYRaw, yDecimals);

      const unclaimed_fees_x = fromRawAmount(
        this.toRawValue(
          positionData.feeXExcludeTransferFee ?? positionData.feeX
        ),
        xDecimals
      );
      const unclaimed_fees_y = fromRawAmount(
        this.toRawValue(
          positionData.feeYExcludeTransferFee ?? positionData.feeY
        ),
        yDecimals
      );
      const claimed_fees_x = fromRawAmount(
        this.toRawValue(positionData.totalClaimedFeeXAmount),
        xDecimals
      );
      const claimed_fees_y = fromRawAmount(
        this.toRawValue(positionData.totalClaimedFeeYAmount),
        yDecimals
      );

      const current_value_usd =
        current_x_amount * xPrice + current_y_amount * yPrice;
      const total_unclaimed_fees_usd =
        unclaimed_fees_x * xPrice + unclaimed_fees_y * yPrice;

      // Resolve reward token decimals and prices
      const rewardMintX = poolInfo.reward_mint_x as string | undefined;
      const rewardMintY = poolInfo.reward_mint_y as string | undefined;
      let rewardXDecimals = xDecimals;
      let rewardYDecimals = yDecimals;
      let rewardXPrice = xPrice;
      let rewardYPrice = yPrice;
      if (rewardMintX && rewardMintX !== xMint) {
        const info = await jupiterService.getTokenInfo(rewardMintX);
        rewardXDecimals = Number(info?.decimals ?? rewardXDecimals);
        rewardXPrice = (info?.price as number) ?? rewardXPrice;
      }
      if (rewardMintY && rewardMintY !== yMint) {
        const info = await jupiterService.getTokenInfo(rewardMintY);
        rewardYDecimals = Number(info?.decimals ?? rewardYDecimals);
        rewardYPrice = (info?.price as number) ?? rewardYPrice;
      }

      const unclaimed_rewards_x = fromRawAmount(rewardOneRaw, rewardXDecimals);
      const unclaimed_rewards_y = fromRawAmount(rewardTwoRaw, rewardYDecimals);
      const total_unclaimed_rewards_usd =
        unclaimed_rewards_x * rewardXPrice + unclaimed_rewards_y * rewardYPrice;
      const total_unclaimed_usd =
        total_unclaimed_fees_usd + total_unclaimed_rewards_usd;

      const [claimedFees, deposits, withdraws, rewards] = await Promise.all([
        this.meteoraApi.getPositionClaimFees(positionAddress),
        this.meteoraApi.getPositionDeposits(positionAddress),
        this.meteoraApi.getPositionWithdraws(positionAddress),
        this.meteoraApi.getPositionClaimRewards(positionAddress),
      ]);
      const claimed_fees_usd_api = sumClaimFeesInUsd(claimedFees);
      const claimed_rewards_usd_api = sumRewardsInUsd(rewards);
      const claimed_fees_usd_fallback =
        claimed_fees_x * xPrice + claimed_fees_y * yPrice;
      const total_claimed_fees_usd =
        claimed_fees_usd_api > 0
          ? claimed_fees_usd_api
          : claimed_fees_usd_fallback;
      const total_claimed_rewards_usd = claimed_rewards_usd_api;
      const total_claimed_usd =
        total_claimed_fees_usd + total_claimed_rewards_usd;

      const total_deposits_usd = sumDepositsWithdrawalsInUsd(deposits);
      const total_withdrawals_usd = sumDepositsWithdrawalsInUsd(withdraws);

      const lower = Number(positionData.lowerBinId);
      const upper = Number(positionData.upperBinId);
      const in_range = activeId >= lower && activeId <= upper;

      const price_min = this.computePriceFromBin(
        lower,
        binStepBps,
        xDecimals,
        yDecimals
      );
      const price_max = this.computePriceFromBin(
        upper,
        binStepBps,
        xDecimals,
        yDecimals
      );
      const pool_price = this.computePriceFromBin(
        activeId,
        binStepBps,
        xDecimals,
        yDecimals
      );

      const poolFeeTvlRatio: number | undefined =
        this.getPoolFeeTvlRatio(poolInfo);

      const net_profit_usd = this.computeNetProfitUsd({
        current_value_usd,
        total_withdrawals_usd,
        total_claimed_usd,
        total_unclaimed_usd,
        total_deposits_usd,
      });
      const net_profit_percentage = this.computeNetProfitPercentage(
        net_profit_usd,
        total_deposits_usd
      );

      const pnl_usd = this.computePnlUsd({
        total_claimed_fees_usd,
        total_withdrawals_usd,
        total_deposits_usd,
      });
      const pnl_pct = this.computePnlPct(pnl_usd, total_deposits_usd);

      const mapped: PortfolioPosition = {
        position_address: positionAddress,
        program_type: "DLMM",
        pool_address: poolAddress,
        token_x_info: {
          mint: xMint,
          symbol: xInfo?.symbol ?? xMint.slice(0, 4),
          decimals: xDecimals,
          image: xInfo?.icon || "",
        },
        token_y_info: {
          mint: yMint,
          symbol: yInfo?.symbol ?? yMint.slice(0, 4),
          decimals: yDecimals,
          image: yInfo?.icon || "",
        },
        current_x_amount,
        current_y_amount,
        unclaimed_fees_x,
        unclaimed_fees_y,
        claimed_fees_x,
        claimed_fees_y,
        initial_deposit_value_usd: total_deposits_usd,
        current_value_usd,
        total_deposits_usd,
        total_withdrawals_usd,
        total_claimed_fees_usd,
        total_claimed_rewards_usd,
        total_claimed_usd,
        total_unclaimed_fees_usd,
        total_unclaimed_rewards_usd,
        total_unclaimed_usd,
        pnl_usd,
        pnl_pct,
        net_profit_usd,
        net_profit_percentage,
        position_fee_24h_usd: undefined,
        position_fee_tvl_24h: undefined,
        pool_fee_tvl_24h: poolFeeTvlRatio,
        auto_rebalancing_enabled: false,
        in_range,
        created_at: toIsoFromBignumSeconds(positionData.lastUpdatedAt),
        lower_bin_id: lower,
        upper_bin_id: upper,
        active_bin_id: activeId,
        bin_step_bps: binStepBps,
        price_min,
        price_max,
        pool_price,
        unclaimed_rewards_x,
        unclaimed_rewards_y,
      };

      return { success: true, data: mapped };
    } catch (error) {
      console.error(error);
      return { success: false, message: "Failed to load position" };
    }
  }

  private async mapDlmmPositionsToPortfolio(
    positionsByPool: Map<string, PositionInfo>
  ): Promise<PortfolioPosition[]> {
    const out: PortfolioPosition[] = [];
    const poolCache = new Map<
      string,
      Awaited<ReturnType<typeof this.meteoraApi.getPool>>
    >();

    const getPool = async (pool: string) => {
      if (!poolCache.has(pool))
        poolCache.set(pool, await this.meteoraApi.getPool(pool));
      return poolCache.get(pool);
    };

    for (const [poolAddress, info] of Array.from(positionsByPool)) {
      const xMint = info.lbPair.tokenXMint.toString();
      const yMint = info.lbPair.tokenYMint.toString();

      const [xInfo, yInfo] = await Promise.all([
        jupiterService.getTokenInfo(xMint),
        jupiterService.getTokenInfo(yMint),
      ]);

      const xDecimals = Number(
        xInfo?.decimals ?? info.tokenX?.mint?.decimals ?? 0
      );
      const yDecimals = Number(
        yInfo?.decimals ?? info.tokenY?.mint?.decimals ?? 0
      );
      const { xUsd: xPrice, yUsd: yPrice } = await this.getLatestUsdPrices(
        xMint,
        yMint,
        {
          xPrice: (xInfo?.price as number | undefined) ?? 0,
          yPrice: (yInfo?.price as number | undefined) ?? 0,
        }
      );

      const activeId = Number(info.lbPair.activeId);
      const binStepBps = Number(info.lbPair.binStep);

      const poolInfo = await getPool(poolAddress);

      const poolFeeTvlRatio: number | undefined =
        this.getPoolFeeTvlRatio(poolInfo);

      // @ts-expect-error - SDK exposes lbPairPositionsData at runtime but type defs omit it
      for (const pos of (info.lbPairPositionsData ?? []) as Array<{
        publicKey: PublicKey;
        version: number;
        positionData: {
          lowerBinId: number;
          upperBinId: number;
          totalXAmount?: string | bigint | number;
          totalYAmount?: string | bigint | number;
          totalXAmountExcludeTransferFee?: string | bigint | number;
          totalYAmountExcludeTransferFee?: string | bigint | number;
          feeX?: string | bigint | number;
          feeY?: string | bigint | number;
          feeXExcludeTransferFee?: string | bigint | number;
          feeYExcludeTransferFee?: string | bigint | number;
          rewardOne?: string | bigint | number;
          rewardTwo?: string | bigint | number;
          rewardOneExcludeTransferFee?: string | bigint | number;
          rewardTwoExcludeTransferFee?: string | bigint | number;
          totalClaimedFeeXAmount?: string | bigint | number;
          totalClaimedFeeYAmount?: string | bigint | number;
          lastUpdatedAt?: BnLike;
        };
      }>) {
        const positionAddress = pos.publicKey.toString();
        const positionData = pos.positionData;

        const totalXRaw =
          positionData.totalXAmountExcludeTransferFee ??
          positionData.totalXAmount;
        const totalYRaw =
          positionData.totalYAmountExcludeTransferFee ??
          positionData.totalYAmount;
        const current_x_amount = fromRawAmount(totalXRaw, xDecimals);
        const current_y_amount = fromRawAmount(totalYRaw, yDecimals);

        const rewardOneRaw =
          positionData.rewardOneExcludeTransferFee ?? positionData.rewardOne;
        const rewardTwoRaw =
          positionData.rewardTwoExcludeTransferFee ?? positionData.rewardTwo;

        const current_value_usd =
          current_x_amount * xPrice + current_y_amount * yPrice;

        const unclaimed_fees_x = fromRawAmount(
          positionData.feeXExcludeTransferFee ?? positionData.feeX,
          xDecimals
        );
        const unclaimed_fees_y = fromRawAmount(
          positionData.feeYExcludeTransferFee ?? positionData.feeY,
          yDecimals
        );

        const unclaimed_rewards_x = fromRawAmount(rewardOneRaw, xDecimals);
        const unclaimed_rewards_y = fromRawAmount(rewardTwoRaw, yDecimals);

        const claimed_fees_x = fromRawAmount(
          positionData.totalClaimedFeeXAmount,
          xDecimals
        );
        const claimed_fees_y = fromRawAmount(
          positionData.totalClaimedFeeYAmount,
          yDecimals
        );

        const total_unclaimed_fees_usd =
          unclaimed_fees_x * xPrice + unclaimed_fees_y * yPrice;

        const total_unclaimed_rewards_usd =
          unclaimed_rewards_x * xPrice + unclaimed_rewards_y * yPrice;

        const total_unclaimed_usd =
          total_unclaimed_fees_usd + total_unclaimed_rewards_usd;

        const [claimedFees, deposits, withdraws, rewards] = await Promise.all([
          this.meteoraApi.getPositionClaimFees(positionAddress),
          this.meteoraApi.getPositionDeposits(positionAddress),
          this.meteoraApi.getPositionWithdraws(positionAddress),
          this.meteoraApi.getPositionClaimRewards(positionAddress),
        ]);

        const claimed_usd_api =
          sumClaimFeesInUsd(claimedFees) + sumRewardsInUsd(rewards);
        const claimed_usd_fallback =
          claimed_fees_x * xPrice + claimed_fees_y * yPrice;

        const total_claimed_fees_usd =
          claimed_usd_api > 0 ? claimed_usd_api : claimed_usd_fallback;
        const total_claimed_rewards_usd = sumRewardsInUsd(rewards);

        const total_claimed_usd =
          total_claimed_fees_usd + total_claimed_rewards_usd;

        const total_deposits_usd = sumDepositsWithdrawalsInUsd(deposits);
        const total_withdrawals_usd = sumDepositsWithdrawalsInUsd(withdraws);

        const lower = Number(positionData.lowerBinId);
        const upper = Number(positionData.upperBinId);
        const in_range = activeId >= lower && activeId <= upper;

        const price_min = this.computePriceFromBin(
          lower,
          binStepBps,
          xDecimals,
          yDecimals
        );
        const price_max = this.computePriceFromBin(
          upper,
          binStepBps,
          xDecimals,
          yDecimals
        );
        const pool_price = this.computePriceFromBin(
          activeId,
          binStepBps,
          xDecimals,
          yDecimals
        );

        const net_profit_usd =
          current_value_usd +
          total_withdrawals_usd +
          total_unclaimed_usd +
          total_claimed_usd -
          total_deposits_usd;

        const net_profit_percentage =
          total_deposits_usd !== 0
            ? (net_profit_usd / total_deposits_usd) * 100
            : 0;

        const pnl_usd =
          total_claimed_fees_usd + total_withdrawals_usd - total_deposits_usd;

        const pnl_pct = (pnl_usd / total_deposits_usd) * 100;

        // Placeholder for future position-level 24h fee/TVL metrics
        const position_fee_24h_usd: number | undefined = undefined;
        const position_fee_tvl_24h: number | undefined = undefined;

        out.push({
          position_address: positionAddress,
          program_type: "DLMM",
          pool_address: poolAddress,
          net_profit_usd,
          net_profit_percentage,
          token_x_info: {
            mint: xMint,
            symbol: xInfo?.symbol ?? xMint.slice(0, 4),
            decimals: xDecimals,
            image: xInfo?.icon || "",
          },
          token_y_info: {
            mint: yMint,
            symbol: yInfo?.symbol ?? yMint.slice(0, 4),
            decimals: yDecimals,
            image: yInfo?.icon || "",
          },
          current_x_amount,
          current_y_amount,
          unclaimed_fees_x,
          unclaimed_fees_y,
          claimed_fees_x,
          claimed_fees_y,
          initial_deposit_value_usd: total_deposits_usd,
          current_value_usd,
          total_deposits_usd,
          total_withdrawals_usd,
          total_claimed_fees_usd,
          total_claimed_rewards_usd,
          total_claimed_usd,
          total_unclaimed_fees_usd,
          total_unclaimed_rewards_usd,
          total_unclaimed_usd,
          pnl_usd,
          pnl_pct,
          position_fee_24h_usd,
          position_fee_tvl_24h,
          pool_fee_tvl_24h: poolFeeTvlRatio,
          auto_rebalancing_enabled: false,
          in_range,
          created_at: toIsoFromBignumSeconds(positionData.lastUpdatedAt),
          lower_bin_id: lower,
          upper_bin_id: upper,
          active_bin_id: activeId,
          bin_step_bps: binStepBps,
          price_min,
          price_max,
          pool_price,
          unclaimed_rewards_x,
          unclaimed_rewards_y,
        });
      }
    }

    return out;
  }

  async getUserPortfolio(walletAddress: string): Promise<PortfolioResult> {
    try {
      const owner = new PublicKey(walletAddress);

      const positionsMap =
        await meteoraDlmmService.getAllLbPairPositionsByUser(owner);

      const positions = await this.mapDlmmPositionsToPortfolio(positionsMap);

      const totals: PortfolioTotals = {
        total_positions: positions.length,
        total_current_value_usd: positions.reduce<number>(
          (s, p) => s + p.current_value_usd,
          0
        ),
        total_unclaimed_fees_usd: positions.reduce<number>(
          (s, p) => s + p.total_unclaimed_fees_usd,
          0
        ),
        total_unclaimed_rewards_usd: positions.reduce<number>(
          (s, p) => s + (p.total_unclaimed_rewards_usd ?? 0),
          0
        ),

        total_claimed_fees_usd: positions.reduce<number>(
          (s, p) => s + p.total_claimed_fees_usd,
          0
        ),
        total_claimed_rewards_usd: positions.reduce<number>(
          (s, p) => s + (p.total_claimed_rewards_usd ?? 0),
          0
        ),
        total_claimed_usd: positions.reduce<number>(
          (s, p) => s + (p.total_claimed_usd ?? 0),
          0
        ),
        total_unclaimed_usd: positions.reduce<number>(
          (s, p) => s + (p.total_unclaimed_usd ?? 0),
          0
        ),
        total_deposits_usd: positions.reduce<number>(
          (s, p) => s + p.total_deposits_usd,
          0
        ),
        total_withdrawals_usd: positions.reduce<number>(
          (s, p) => s + p.total_withdrawals_usd,
          0
        ),
        total_pnl_usd: positions.reduce<number>((s, p) => s + p.pnl_usd, 0),
        total_net_deposited_usd: 0,
      };

      totals.total_net_deposited_usd =
        totals.total_deposits_usd - totals.total_withdrawals_usd;

      return {
        success: true,
        data: { walletAddress, positions, totals },
        message: "Portfolio loaded successfully",
      };
    } catch (error) {
      console.error(error);
      return {
        success: false,
        message: "Failed to load portfolio. Please try again.",
      };
    }
  }
}

export const portfolioService = new PortfolioService();
