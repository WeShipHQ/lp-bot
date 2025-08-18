export function formatCurrency(
  amount: number,
  currency: string = "USD"
): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: currency,
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(amount);
}

export function formatPercentage(percentage: number): string {
  const sign = percentage >= 0 ? "+" : "";
  return `${sign}${percentage.toFixed(2)}%`;
}

export function formatTokenAmount(
  amount: number,
  decimals: number = 6
): string {
  return new Intl.NumberFormat("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: decimals,
  }).format(amount);
}

export function truncateAddress(
  address: string,
  start: number = 4,
  end: number = 4
): string {
  if (address.length <= start + end) return address;
  return `${address.slice(0, start)}...${address.slice(-end)}`;
}

import {
  TokenInfo,
  MeteoraPoolData,
  TokenDisplayData,
} from "../../types/token.types";

/**
 * Format numbers with appropriate suffixes (K, M, B)
 */
export function formatNumber(num: number | string): string {
  num = Number(num);
  if (num >= 1e9) {
    return (num / 1e9).toFixed(2) + "B";
  }
  if (num >= 1e6) {
    return (num / 1e6).toFixed(2) + "M";
  }
  if (num >= 1e3) {
    return (num / 1e3).toFixed(2) + "K";
  }
  return num.toFixed(2);
}

/**
 * Format price with appropriate decimal places
 */
export function formatPrice(price: number): string {
  if (price >= 1) {
    return `$${price.toFixed(4)}`;
  }
  if (price >= 0.01) {
    return `$${price.toFixed(6)}`;
  }
  return `$${price.toExponential(3)}`;
}

/**
 * Format token information for display
 */
export function formatTokenInfo(token: TokenInfo): string {
  const priceChangeEmoji = token.priceChange24h >= 0 ? "🟢" : "🔴";
  const verifiedEmoji = token.isVerified ? "✅" : "⚠️";

  return (
    `🪙 **${token.name} (${token.symbol})** ${verifiedEmoji}\n` +
    `📍 Address: \`${token.address}\`\n` +
    `💰 Price: ${formatPrice(token.price)}\n` +
    `📈 24h Change: ${priceChangeEmoji} ${formatPercentage(token.priceChange24h)}\n` +
    `🏦 Market Cap: $${formatNumber(token.marketCap)}\n` +
    `📊 24h Volume: $${formatNumber(token.volume24h)}\n` +
    `💧 Liquidity: $${formatNumber(token.liquidity)}\n` +
    `🔗 Source: ${token.source.charAt(0).toUpperCase() + token.source.slice(1)}`
  );
}

/**
 * Format Meteora pool information for display
 */
export function formatPoolInfo(pool: MeteoraPoolData): string {
  const aprEmoji = pool.apr >= 10 ? "🔥" : pool.apr >= 5 ? "📈" : "📊";

  return (
    `🏊‍♂️ **${pool.pool_name}**\n` +
    `📍 Pool Address: \`${pool.pool_address}\`\n` +
    `💱 Pair: ${pool.token_a_symbol}/${pool.token_b_symbol}\n` +
    `💰 TVL: $${formatNumber(pool.tvl)}\n` +
    `📈 APR: ${aprEmoji} ${pool.apr.toFixed(2)}%\n` +
    `📊 24h Volume: $${formatNumber(pool.volume24h)}\n` +
    `💸 24h Fees: $${formatNumber(pool.fee24h)}\n` +
    `⚖️ Pool Price: ${formatPrice(pool.pool_price)}\n` +
    `🔒 Permanent Lock: ${formatNumber(pool.permanent_lock_liquidity)}\n` +
    `✅ Tokens Verified: ${pool.tokens_verified ? "Yes" : "No"}`
  );
}

/**
 * Format complete token display data (token + pool info if available)
 */
export function formatTokenDisplayData(data: TokenDisplayData): string {
  if (data.error) {
    return `❌ **Error**: ${data.error}`;
  }

  let message = formatTokenInfo(data.token);

  if (data.poolInfo) {
    message +=
      "\n\n" + "🏊‍♂️ **Pool Information:**\n" + formatPoolInfo(data.poolInfo);
  }

  return message;
}

/**
 * Format error message for invalid inputs
 */
export function formatErrorMessage(input: string, reason?: string): string {
  const baseMessage = `❌ **Invalid Input**\n\nI couldn't recognize: \`${input}\``;

  if (reason) {
    return baseMessage + `\n\n**Reason**: ${reason}`;
  }

  return (
    baseMessage +
    "\n\n**Supported formats:**\n" +
    "• Solana token address (44 characters)\n" +
    "• Meteora DAMM v1: `https://www.meteora.ag/pools/{poolId}`\n" +
    "• Meteora DAMM v2: `https://www.meteora.ag/dammv2/{poolId}`\n" +
    "• Meteora DLMM: `https://www.meteora.ag/dlmm/{poolId}`"
  );
}

/**
 * Format loading message
 */
export function formatLoadingMessage(inputType: string): string {
  const typeMessages = {
    address: "🔍 Fetching token information...",
    meteora_damm_v1: "🏊‍♂️ Fetching DAMM v1 pool data...",
    meteora_damm_v2: "🏊‍♂️ Fetching DAMM v2 pool data...",
    meteora_dlmm: "🏊‍♂️ Fetching DLMM pool data...",
  };

  return (
    typeMessages[inputType as keyof typeof typeMessages] ||
    "⏳ Processing your request..."
  );
}
