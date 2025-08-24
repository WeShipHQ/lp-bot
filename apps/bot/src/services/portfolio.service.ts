import { Connection, PublicKey } from "@solana/web3.js";
import DLMM, { PositionInfo } from "@meteora-ag/dlmm";
import { jupiterService } from "./jupiter.service";
import { meteoraService } from "./meteora.service";
import {
  DlmmClaimFee,
  DlmmClaimReward,
  DlmmDepositWithdraw,
  PortfolioPosition,
  PortfolioResult,
  PortfolioTotals,
} from "@/types/portfolio.types";

const toNum = (raw?: string | bigint | number, decimals = 0) =>
  (raw ? Number(raw) : 0) / Math.pow(10, decimals || 0);

const toISOFromBnSec = (bnLike?: any) => {
  const sec = bnLike ? Number(bnLike.toString()) : undefined;
  return sec ? new Date(sec * 1000).toISOString() : new Date().toISOString();
};

const sumClaimFeesUsd = (arr: DlmmClaimFee[]) =>
  arr.reduce(
    (s, it) =>
      s +
      Number(it.token_x_usd_amount || 0) +
      Number(it.token_y_usd_amount || 0),
    0
  );

const sumRewardsUsd = (arr: DlmmClaimReward[]) =>
  arr.reduce((s, it) => s + Number(it.token_usd_amount || 0), 0);

const sumDepWdrUsd = (arr: DlmmDepositWithdraw[]) =>
  arr.reduce(
    (s, it) =>
      s +
      Number(it.token_x_usd_amount || 0) +
      Number(it.token_y_usd_amount || 0),
    0
  );

export class PortfolioService {
  private static connection = new Connection(
    "https://mainnet.helius-rpc.com/?api-key=1f208f9b-11d6-4d11-82a4-3dcc1774e1c2"
  );

  static async getUserPortfolio(
    walletAddress: string
  ): Promise<PortfolioResult> {
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const dlmm = (DLMM as any).default || DLMM;
      const owner = new PublicKey(walletAddress);

      const map: Map<string, PositionInfo> =
        await dlmm.getAllLbPairPositionsByUser(this.connection, owner);

      const positions = await this.toPortfolioPositions(map);

      const totals: PortfolioTotals = {
        total_positions: positions.length,
        total_current_value_usd: positions.reduce(
          (s, p) => s + p.current_value_usd,
          0
        ),
        total_unclaimed_fees_usd: positions.reduce(
          (s, p) => s + p.total_unclaimed_fees_usd,
          0
        ),
        total_claimed_fees_usd: positions.reduce(
          (s, p) => s + p.total_claimed_fees_usd,
          0
        ),
        total_deposits_usd: positions.reduce(
          (s, p) => s + p.total_deposits_usd,
          0
        ),
        total_withdrawals_usd: positions.reduce(
          (s, p) => s + p.total_withdrawals_usd,
          0
        ),
        total_pnl_usd: positions.reduce((s, p) => s + p.pnl_usd, 0),
        total_net_deposited_usd: 0,
      };
      totals.total_net_deposited_usd =
        totals.total_deposits_usd - totals.total_withdrawals_usd;

      return {
        success: true,
        data: { walletAddress, positions, totals },
        message: "Portfolio loaded successfully",
      };
    } catch {
      return {
        success: false,
        message: "Failed to load portfolio. Please try again.",
      };
    }
  }

  private static async toPortfolioPositions(
    positionsByPool: Map<string, PositionInfo>
  ): Promise<PortfolioPosition[]> {
    const out: PortfolioPosition[] = [];
    const poolCache = new Map<
      string,
      Awaited<ReturnType<typeof meteoraService.getDlmmPoolInfo>>
    >();

    const getPool = async (pool: string) => {
      if (!poolCache.has(pool))
        poolCache.set(pool, await meteoraService.getDlmmPoolInfo(pool));
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

      const poolInfo = await getPool(poolAddress);
      const poolFeeTvlRatio =
        typeof poolInfo?.fee_tvl_ratio === "number"
          ? poolInfo.fee_tvl_ratio
          : undefined;

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
          lastUpdatedAt?: any;
        };
      }>) {
        const addr = pos.publicKey.toString();
        const p = pos.positionData;

        const totalXRaw = p.totalXAmountExcludeTransferFee ?? p.totalXAmount;
        const totalYRaw = p.totalYAmountExcludeTransferFee ?? p.totalYAmount;
        const current_x_amount = toNum(totalXRaw, xDecimals);
        const current_y_amount = toNum(totalYRaw, yDecimals);

        const current_value_usd =
          current_x_amount * xPrice + current_y_amount * yPrice;

        const unclaimed_fees_x = toNum(p.feeX, xDecimals);
        const unclaimed_fees_y = toNum(p.feeY, yDecimals);
        const claimed_fees_x = toNum(p.totalClaimedFeeXAmount, xDecimals);
        const claimed_fees_y = toNum(p.totalClaimedFeeYAmount, yDecimals);

        const total_unclaimed_fees_usd =
          unclaimed_fees_x * xPrice + unclaimed_fees_y * yPrice;

        const [claimedFees, deposits, withdraws, rewards] = await Promise.all([
          meteoraService.getPositionClaimFees(addr),
          meteoraService.getPositionDeposits(addr),
          meteoraService.getPositionWithdraws(addr),
          meteoraService.getPositionClaimRewards(addr),
        ]);
        const claimed_usd_api =
          sumClaimFeesUsd(claimedFees) + sumRewardsUsd(rewards);

        const claimed_usd_fallback =
          claimed_fees_x * xPrice + claimed_fees_y * yPrice;

        const total_claimed_fees_usd =
          claimed_usd_api > 0 ? claimed_usd_api : claimed_usd_fallback;

        const total_deposits_usd = sumDepWdrUsd(deposits);
        const total_withdrawals_usd = sumDepWdrUsd(withdraws);

        const lower = Number(p.lowerBinId);
        const upper = Number(p.upperBinId);
        const in_range = activeId >= lower && activeId <= upper;

        const pnl_usd =
          current_value_usd +
          total_withdrawals_usd +
          total_claimed_fees_usd -
          total_deposits_usd;
        const netDeposited = total_deposits_usd - total_withdrawals_usd;
        const pnl_pct = netDeposited > 0 ? pnl_usd / netDeposited : undefined;

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
          pool_fee_tvl_24h: poolFeeTvlRatio,
          auto_rebalancing_enabled: false,
          in_range,
          created_at: toISOFromBnSec(p.lastUpdatedAt),
        });
      }
    }

    return out;
  }
}
