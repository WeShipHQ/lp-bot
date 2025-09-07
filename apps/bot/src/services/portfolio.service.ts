import { PublicKey } from "@solana/web3.js";
import { PositionInfo } from "@meteora-ag/dlmm";
import { jupiterService } from "./jupiter.service";
import { meteoraPoolService } from "./meteora/pool.service";
import {
  DlmmClaimFee,
  DlmmClaimReward,
  DlmmDepositWithdraw,
  PortfolioPosition,
  PortfolioResult,
  PortfolioTotals,
} from "@/types/portfolio.types";
import { meteoraDlmmService } from "./meteora/dlmm.service";

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
  private computePriceFromBin(binId: number, binStepBps: number): number {
    const BASIS_POINT_MAX = 10000;
    const step = Number(binStepBps) / BASIS_POINT_MAX; // e.g., 25 => 0.0025
    const base = 1 + step;
    // price = (1 + binStep/10000)^binId
    return Math.pow(base, binId);
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
        meteoraPoolService.getDlmmPoolInfo(poolAddress),
      ]);

      const xDecimals = Number(xInfo?.decimals ?? 0);
      const yDecimals = Number(yInfo?.decimals ?? 0);
      const xPrice = Number(xInfo?.price ?? 0);
      const yPrice = Number(yInfo?.price ?? 0);

      const activeId = Number(lpPair.activeId);
      const binStepBps = Number(lpPair.binStep);

      const p = lbPosition.positionData as unknown as {
        lowerBinId: number;
        upperBinId: number;
        totalXAmount?: string | bigint | number;
        totalYAmount?: string | bigint | number;
        totalXAmountExcludeTransferFee?: string | bigint | number;
        totalYAmountExcludeTransferFee?: string | bigint | number;
        feeX?: string | bigint | number;
        feeY?: string | bigint | number;
        totalClaimedFeeXAmount?: string | bigint | number;
        totalClaimedFeeYAmount?: string | bigint | number;
        lastUpdatedAt?: BnLike;
      };

      const toRaw = (v: unknown): string | number | bigint | undefined => {
        if (v == null) return undefined;
        const maybe = v as { toString?: () => string };
        return typeof maybe === "object" && typeof maybe.toString === "function"
          ? maybe.toString()
          : (v as string | number | bigint | undefined);
      };

      const totalXRaw = toRaw(
        p.totalXAmountExcludeTransferFee ?? p.totalXAmount
      );
      const totalYRaw = toRaw(
        p.totalYAmountExcludeTransferFee ?? p.totalYAmount
      );
      const current_x_amount = fromRawAmount(totalXRaw, xDecimals);
      const current_y_amount = fromRawAmount(totalYRaw, yDecimals);

      const unclaimed_fees_x = fromRawAmount(toRaw(p.feeX), xDecimals);
      const unclaimed_fees_y = fromRawAmount(toRaw(p.feeY), yDecimals);
      const claimed_fees_x = fromRawAmount(
        toRaw(p.totalClaimedFeeXAmount),
        xDecimals
      );
      const claimed_fees_y = fromRawAmount(
        toRaw(p.totalClaimedFeeYAmount),
        yDecimals
      );

      const current_value_usd =
        current_x_amount * xPrice + current_y_amount * yPrice;
      const total_unclaimed_fees_usd =
        unclaimed_fees_x * xPrice + unclaimed_fees_y * yPrice;

      const [claimedFees, deposits, withdraws, rewards] = await Promise.all([
        meteoraPoolService.getPositionClaimFees(positionAddress),
        meteoraPoolService.getPositionDeposits(positionAddress),
        meteoraPoolService.getPositionWithdraws(positionAddress),
        meteoraPoolService.getPositionClaimRewards(positionAddress),
      ]);
      const claimed_usd_api =
        sumClaimFeesInUsd(claimedFees) + sumRewardsInUsd(rewards);
      const claimed_usd_fallback =
        claimed_fees_x * xPrice + claimed_fees_y * yPrice;
      const total_claimed_fees_usd =
        claimed_usd_api > 0 ? claimed_usd_api : claimed_usd_fallback;

      const total_deposits_usd = sumDepositsWithdrawalsInUsd(deposits);
      const total_withdrawals_usd = sumDepositsWithdrawalsInUsd(withdraws);

      const lower = Number(p.lowerBinId);
      const upper = Number(p.upperBinId);
      const in_range = activeId >= lower && activeId <= upper;

      const price_min = this.computePriceFromBin(lower, binStepBps);
      const price_max = this.computePriceFromBin(upper, binStepBps);
      const pool_price = this.computePriceFromBin(activeId, binStepBps);

      const poolFeeTvlRatio: number | undefined = ((): number | undefined => {
        const v = (poolInfo as unknown as { fee_tvl_ratio?: unknown })
          ?.fee_tvl_ratio as unknown;
        if (typeof v === "number") return v;
        if (v && typeof v === "object" && v !== null) {
          const day = (v as { hour_24?: unknown }).hour_24;
          return typeof day === "number" ? day : undefined;
        }
        return undefined;
      })();

      const pnl_usd =
        current_value_usd +
        total_withdrawals_usd +
        total_claimed_fees_usd -
        total_deposits_usd;
      const netDeposited = total_deposits_usd - total_withdrawals_usd;
      const pnl_pct = netDeposited > 0 ? pnl_usd / netDeposited : undefined;

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
        current_value_usd,
        total_deposits_usd,
        total_withdrawals_usd,
        total_claimed_fees_usd,
        total_unclaimed_fees_usd,
        pnl_usd,
        pnl_pct,
        position_fee_24h_usd: undefined,
        position_fee_tvl_24h: undefined,
        pool_fee_tvl_24h: poolFeeTvlRatio,
        auto_rebalancing_enabled: false,
        in_range,
        created_at: toIsoFromBignumSeconds(p.lastUpdatedAt),
        lower_bin_id: lower,
        upper_bin_id: upper,
        active_bin_id: activeId,
        bin_step_bps: binStepBps,
        price_min,
        price_max,
        pool_price,
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
      Awaited<ReturnType<typeof meteoraPoolService.getDlmmPoolInfo>>
    >();

    const getPool = async (pool: string) => {
      if (!poolCache.has(pool))
        poolCache.set(pool, await meteoraPoolService.getDlmmPoolInfo(pool));
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
      const xPrice = Number(xInfo?.price ?? 0);
      const yPrice = Number(yInfo?.price ?? 0);
      const activeId = Number(info.lbPair.activeId);
      const binStepBps = Number(info.lbPair.binStep);

      const poolInfo = await getPool(poolAddress);
      const poolFeeTvlRatio: number | undefined = ((): number | undefined => {
        const v = (poolInfo as unknown as { fee_tvl_ratio?: unknown })
          ?.fee_tvl_ratio as unknown;
        if (typeof v === "number") return v;
        if (v && typeof v === "object" && v !== null) {
          const day = (v as { hour_24?: unknown }).hour_24;
          return typeof day === "number" ? day : undefined;
        }
        return undefined;
      })();

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
          totalClaimedFeeXAmount?: string | bigint | number;
          totalClaimedFeeYAmount?: string | bigint | number;
          lastUpdatedAt?: BnLike;
        };
      }>) {
        const addr = pos.publicKey.toString();
        const p = pos.positionData;

        const totalXRaw = p.totalXAmountExcludeTransferFee ?? p.totalXAmount;
        const totalYRaw = p.totalYAmountExcludeTransferFee ?? p.totalYAmount;
        const current_x_amount = fromRawAmount(totalXRaw, xDecimals);
        const current_y_amount = fromRawAmount(totalYRaw, yDecimals);

        const current_value_usd =
          current_x_amount * xPrice + current_y_amount * yPrice;

        const unclaimed_fees_x = fromRawAmount(p.feeX, xDecimals);
        const unclaimed_fees_y = fromRawAmount(p.feeY, yDecimals);
        const claimed_fees_x = fromRawAmount(
          p.totalClaimedFeeXAmount,
          xDecimals
        );
        const claimed_fees_y = fromRawAmount(
          p.totalClaimedFeeYAmount,
          yDecimals
        );

        const total_unclaimed_fees_usd =
          unclaimed_fees_x * xPrice + unclaimed_fees_y * yPrice;

        const [claimedFees, deposits, withdraws, rewards] = await Promise.all([
          meteoraPoolService.getPositionClaimFees(addr),
          meteoraPoolService.getPositionDeposits(addr),
          meteoraPoolService.getPositionWithdraws(addr),
          meteoraPoolService.getPositionClaimRewards(addr),
        ]);
        const claimed_usd_api =
          sumClaimFeesInUsd(claimedFees) + sumRewardsInUsd(rewards);

        const claimed_usd_fallback =
          claimed_fees_x * xPrice + claimed_fees_y * yPrice;

        const total_claimed_fees_usd =
          claimed_usd_api > 0 ? claimed_usd_api : claimed_usd_fallback;

        const total_deposits_usd = sumDepositsWithdrawalsInUsd(deposits);
        const total_withdrawals_usd = sumDepositsWithdrawalsInUsd(withdraws);

        const lower = Number(p.lowerBinId);
        const upper = Number(p.upperBinId);
        const in_range = activeId >= lower && activeId <= upper;

        const price_min = this.computePriceFromBin(lower, binStepBps);
        const price_max = this.computePriceFromBin(upper, binStepBps);
        const pool_price = this.computePriceFromBin(activeId, binStepBps);

        const pnl_usd =
          current_value_usd +
          total_withdrawals_usd +
          total_claimed_fees_usd -
          total_deposits_usd;
        const netDeposited = total_deposits_usd - total_withdrawals_usd;
        const pnl_pct = netDeposited > 0 ? pnl_usd / netDeposited : undefined;

        // Placeholder for future position-level 24h fee/TVL metrics
        // To compute accurately, we must persist historical snapshots and
        // compare fee accrual over 24h, then divide by position TVL.
        const position_fee_24h_usd: number | undefined = undefined;
        const position_fee_tvl_24h: number | undefined = undefined;

        out.push({
          position_address: addr,
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
          current_value_usd,
          total_deposits_usd,
          total_withdrawals_usd,
          total_claimed_fees_usd,
          total_unclaimed_fees_usd,
          pnl_usd,
          pnl_pct,
          position_fee_24h_usd,
          position_fee_tvl_24h,
          pool_fee_tvl_24h: poolFeeTvlRatio,
          auto_rebalancing_enabled: false,
          in_range,
          created_at: toIsoFromBignumSeconds(p.lastUpdatedAt),
          lower_bin_id: lower,
          upper_bin_id: upper,
          active_bin_id: activeId,
          bin_step_bps: binStepBps,
          price_min,
          price_max,
          pool_price,
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
        total_claimed_fees_usd: positions.reduce<number>(
          (s, p) => s + p.total_claimed_fees_usd,
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
