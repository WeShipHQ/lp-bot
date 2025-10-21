import { UnifiedPool } from "@/types/core.types";
import { Token } from "@/types/token.types";
import { divider } from "@/bot/utils/text-formatters";
import { formatNumber, formatPercentage } from "./base.formatter";

export interface CreatePositionStateView {
  strategy?: string;
  depositMethod?: "sol_auto_convert" | "single_sided";
  selectedToken?: Token;
  depositSource?: "sol_convert" | "token_balance";
  amount?: number;
  percentage?: number;
  priceChangePercentage?: number;
  autoRebalancing?: "yes" | "no";
}

export function generateProgressMessage(
  poolData: UnifiedPool,
  state: CreatePositionStateView,
  currentStep: string,
  guide?: string
): string {
  const verifiedEmoji = poolData.isVerified ? "✅" : "⚠️";

  let message =
    `*${poolData.name}* ${verifiedEmoji}\n` +
    `Pool Price: *${formatNumber(poolData.currentPrice)} ${poolData.tokenA.symbol}/${poolData.tokenB.symbol}*\n` +
    `TVL: *$${formatNumber(Number(poolData.tvl), { maxDecimals: 2 })}*\n` +
    `Fee/TVL: *${formatPercentage((poolData.feeTvlRatio24h || 0) * 100, { decimals: 2 })}*\n`;

  const hasSelected =
    state.strategy ||
    state.depositMethod ||
    state.selectedToken ||
    state.amount ||
    state.percentage ||
    state.priceChangePercentage ||
    state.autoRebalancing;

  if (hasSelected) {
    message += `${divider()}\n`;
    message += `*Your Selections:*\n`;

    if (state.strategy) {
      message += `Strategy: *${state.strategy.toUpperCase()}*\n`;
    } else {
      message += `Strategy: *Not selected*\n`;
    }

    if (state.depositMethod) {
      const methodName =
        state.depositMethod === "sol_auto_convert"
          ? "SOL Auto-convert"
          : "Single-sided Token";
      message += `Deposit Method: *${methodName}*\n`;
    }

    if (state.depositMethod === "single_sided" && state.selectedToken) {
      const tokenName = state.selectedToken.symbol;
      message += `Token: *${tokenName}*\n`;
    }

    if (state.depositSource) {
      const sourceName =
        state.depositSource === "sol_convert"
          ? "Convert from SOL"
          : "From Token Balance";
      message += `Source: *${sourceName}*\n`;
    }

    if (state.amount) {
      message += `Amount: *${state.amount} SOL*\n`;
    } else if (state.percentage) {
      message += `Percentage: *${state.percentage}%*\n`;
    }

    if (state.depositMethod === "single_sided" && state.priceChangePercentage) {
      message += `Price Change Coverage: *${state.priceChangePercentage}%*\n`;
    }

    if (state.autoRebalancing) {
      message += `Auto-rebalancing: ${state.autoRebalancing === "yes" ? "✅" : "❌"}\n`;
    }
  }

  message += divider();
  message += `\n`;

  message += `*${currentStep}*\n\n`;
  if (guide) {
    message += `${guide}\n\n`;
  }

  return message;
}

export function generatePositionSummary(
  poolData: UnifiedPool,
  state: CreatePositionStateView,
  preview: {
    rangeMin: string;
    rangeMax: string;
    tokenAAmount: number;
    tokenBAmount: number;
  }
): string {
  const { strategy, depositMethod, selectedToken, amount, percentage, autoRebalancing } = state;

  const verifiedEmoji = poolData?.isVerified ? "✅" : "⚠️";

  let message = `*Position Summary*\n\n` + `Pool: *${poolData?.name}* ${verifiedEmoji}\n`;

  message += `Strategy: *${(strategy || "").toUpperCase()}*\n`;

  if (depositMethod === "single_sided") {
    const tokenName = selectedToken?.symbol || "TOKEN";
    message += `Deposit Method: *Single-sided (${tokenName})*\n`;
    if (percentage) {
      message += `Amount: *${percentage}% of token balance*\n`;
    } else {
      message += `Amount: *${amount} SOL (converted)*\n`;
    }
  } else {
    message += `Deposit Method: *SOL Auto-convert*\n`;
    message += `Amount: *${amount} SOL*\n`;
  }

  message += `Position Range: *${formatNumber(preview.rangeMin, { maxDecimals: 6 })} - ${formatNumber(preview.rangeMax, { maxDecimals: 6 })} ${poolData?.tokenB.symbol} / ${poolData?.tokenA.symbol}*\n`;
  message += `Tokens: *${formatNumber(preview.tokenAAmount, { maxDecimals: 6 })} ${poolData?.tokenA.symbol} / ${formatNumber(preview.tokenBAmount, { maxDecimals: 6 })} ${poolData?.tokenB.symbol}*\n`;

  if (depositMethod === "sol_auto_convert") {
    message += `Auto-rebalancing: *${autoRebalancing === "yes" ? "Enabled" : "Disabled"}*\n\n`;
  }

  message += "*Create position by confirming on the button below*";
  return message;
}
