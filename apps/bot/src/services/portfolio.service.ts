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
import { CONFIG } from "@/config";
import { db } from "@/db";
import {
  users as usersTable,
  wallets as walletsTable,
  positions as positionsTable,
  PositionStatus,
} from "@/db/schema";
import { and, eq, inArray } from "drizzle-orm";
import type { SQL } from "drizzle-orm";

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

export class PortfolioService {
  private static connection = new Connection(CONFIG.SOLANA.RPC_URL);

  static async getUserPortfolio(
    walletAddress: string
  ): Promise<PortfolioResult> {
    try {
      const dlmm = (DLMM as any).default || DLMM;
      const owner = new PublicKey(walletAddress);

      const map: Map<string, PositionInfo> =
        await dlmm.getAllLbPairPositionsByUser(this.connection, owner);

      const positionsRaw = await this.mapDlmmPositionsToPortfolio(map);

      const positions = await this.annotatePositionsWithDbTracking(
        positionsRaw,
        walletAddress
      );

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

  private static async mapDlmmPositionsToPortfolio(
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
          meteoraService.getPositionClaimFees(addr),
          meteoraService.getPositionDeposits(addr),
          meteoraService.getPositionWithdraws(addr),
          meteoraService.getPositionClaimRewards(addr),
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
          created_at: toIsoFromBignumSeconds(p.lastUpdatedAt),
        });
      }
    }

    return out;
  }

  // Resolve user ID by wallet address
  private static async resolveUserIdByWalletAddress(
    walletAddress: string
  ): Promise<string | undefined> {
    // 1) Check user table first
    const u = await db
      .select({ id: usersTable.id })
      .from(usersTable)
      .where(eq(usersTable.walletAddress, walletAddress))
      .limit(1);

    if (u[0]?.id) return u[0].id;

    // 2) Fallback: Check wallets table
    const w = await db
      .select({ userId: walletsTable.userId })
      .from(walletsTable)
      .where(eq(walletsTable.address, walletAddress))
      .limit(1);

    return w[0]?.userId;
  }

  // Annotate positions with database tracking information
  private static async annotatePositionsWithDbTracking(
    dlmmPositions: PortfolioPosition[],
    walletAddress: string
  ): Promise<PortfolioPosition[]> {
    if (dlmmPositions.length === 0) return dlmmPositions;

    const tokenAddresses = Array.from(
      new Set(dlmmPositions.map((p) => p.position_address))
    );
    if (tokenAddresses.length === 0) {
      return dlmmPositions.map((p) => ({ ...p, is_tracked_in_db: false }));
    }

    const userId = await this.resolveUserIdByWalletAddress(walletAddress);
    const ACTIVE: PositionStatus = "ACTIVE";

    const tokenFilter = inArray(positionsTable.tokenAddress, tokenAddresses);

    let whereExpr = and(
      tokenFilter,
      eq(positionsTable.status, ACTIVE)
    ) as SQL<unknown>;

    if (userId) {
      whereExpr = and(
        whereExpr,
        eq(positionsTable.userId, userId)
      ) as SQL<unknown>;
    }

    const rows = await db
      .select({ tokenAddress: positionsTable.tokenAddress })
      .from(positionsTable)
      .where(whereExpr);

    const trackedSet = new Set(rows.map((row) => row.tokenAddress));

    return dlmmPositions.map((p) => ({
      ...p,
      is_tracked_in_db: trackedSet.has(p.position_address),
    }));
  }
}
