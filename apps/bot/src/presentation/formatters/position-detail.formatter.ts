import type { Position } from "@/domain/position/position.entity";
import type { UnifiedPool, UnifiedPosition } from "@/types/core.types";
import type { TokenPrice } from "@/types/token.types";
// import { divider } from "@/bot/utils/text-formatters";
import {
  formatCurrency,
  formatNumber,
  formatPercentage,
} from "./base.formatter";
import { divider } from "@/utils/misc";

interface FormatParams {
  position: Position;
  onchain?: UnifiedPosition;
  pool?: UnifiedPool;
  prices?: Record<string, TokenPrice | undefined>;
}

interface BalanceLine {
  label: string;
  amount: string;
  usd?: string;
}

export interface PositionDetailView {
  text: string;
  pairLabel: string;
}

export class PositionDetailFormatter {
  static format(params: FormatParams): PositionDetailView {
    const { position, onchain, pool, prices } = params;

    const tokenA = position.tokenX;
    const tokenB = position.tokenY;
    const pairLabel = pool?.name ?? `${tokenA.symbol}/${tokenB.symbol}`;

    const tokenAPrice = prices?.[tokenA.address]?.price ?? 0;
    const tokenBPrice = prices?.[tokenB.address]?.price ?? 0;

    const tokenAAmount = position.getCurrentTokenXAmount();
    const tokenBAmount = position.getCurrentTokenYAmount();

    const tokenAUi = tokenAAmount.toUi();
    const tokenBUi = tokenBAmount.toUi();

    const tokenAUsd = tokenAUi * tokenAPrice;
    const tokenBUsd = tokenBUi * tokenBPrice;

    const currentValueUsd =
      onchain?.currentValueUsd ?? position.getCurrentValue().toNumber();
    const initialValueUsd = position.getInitialValue().toNumber();
    const claimedFeesUsd = position.getClaimedFees().toNumber();
    const unclaimedFeesUsd = onchain?.unclaimedFeesUsd ?? 0;

    const netProfitUsd =
      currentValueUsd + claimedFeesUsd + unclaimedFeesUsd - initialValueUsd;
    const netProfitPct =
      initialValueUsd > 0 ? (netProfitUsd / initialValueUsd) * 100 : 0;
    const pnlEmoji = netProfitUsd > 0 ? "📈" : netProfitUsd < 0 ? "📉" : "➖";

    const balanceLines: BalanceLine[] = [
      {
        label: tokenA.symbol,
        amount: tokenAAmount.toFormattedString(),
        usd:
          tokenAPrice > 0
            ? formatCurrency(tokenAUsd, { maxDecimals: 2 })
            : undefined,
      },
      {
        label: tokenB.symbol,
        amount: tokenBAmount.toFormattedString(),
        usd:
          tokenBPrice > 0
            ? formatCurrency(tokenBUsd, { maxDecimals: 2 })
            : undefined,
      },
    ];

    const statusLabel = (() => {
      if (onchain?.inRange === true) return "🟢 In Range";
      if (onchain?.inRange === false) return "🔴 Out of Range";
      return "⚪️ Range Unknown";
    })();

    const metadata = (onchain?.metadata ?? {}) as Record<string, unknown>;
    const lowerBinId =
      typeof metadata.lowerBinId === "number" ? metadata.lowerBinId : undefined;
    const upperBinId =
      typeof metadata.upperBinId === "number" ? metadata.upperBinId : undefined;
    const activeId =
      typeof metadata.activeId === "number" ? metadata.activeId : undefined;

    const lines: string[] = [];

    lines.push(`*${pairLabel}* (${position.dex.toUpperCase()})`);
    lines.push("");
    lines.push(
      `${pnlEmoji} *Net PnL:* ${formatCurrency(netProfitUsd, { maxDecimals: 2 })} (${formatPercentage(netProfitPct, { decimals: 2, alwaysShowSign: true })})`
    );
    lines.push(divider());

    lines.push(`*Balance*`);
    balanceLines.forEach((item) => {
      const usdPart = item.usd ? ` (~${item.usd})` : "";
      lines.push(`• ${item.label}: ${item.amount}${usdPart}`);
    });
    lines.push(
      `• Total Value: ${formatCurrency(currentValueUsd, { maxDecimals: 2 })}`
    );
    lines.push("");

    lines.push(`*Fees*`);
    lines.push(
      `• Claimed: ${formatCurrency(claimedFeesUsd, { maxDecimals: 2 })}`
    );
    lines.push(
      `• Unclaimed: ${formatCurrency(unclaimedFeesUsd, { maxDecimals: 2 })}`
    );
    lines.push("");

    lines.push(`*Status*`);
    lines.push(`• ${statusLabel}`);
    if (typeof lowerBinId === "number" && typeof upperBinId === "number") {
      const activeSuffix =
        typeof activeId === "number" ? ` (active: ${activeId})` : "";
      lines.push(`• Bin Range: ${lowerBinId} – ${upperBinId}${activeSuffix}`);
    }
    if (pool?.currentPrice != null) {
      lines.push(
        `• Pool Price: ${formatNumber(pool.currentPrice, { maxDecimals: 6 })} ${pool.tokenA.symbol}/${pool.tokenB.symbol}`
      );
    }
    lines.push("");

    const updatedAt = onchain?.updatedAt ?? position.getUpdatedAt();
    lines.push(`_Last updated: ${updatedAt.toLocaleString()}_`);

    return {
      text: lines.join("\n"),
      pairLabel,
    };
  }
}
