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
  if (price === 0) return "$0.000";

  // Unicode subscript mapping
  const subscriptMap: { [key: string]: string } = {
    "0": "₀",
    "1": "₁",
    "2": "₂",
    "3": "₃",
    "4": "₄",
    "5": "₅",
    "6": "₆",
    "7": "₇",
    "8": "₈",
    "9": "₉",
  };

  // Handle regular numbers (>= 0.01)
  if (price >= 0.01) {
    return `$${price.toFixed(3)}`;
  }

  // Handle very small numbers (< 0.01)
  const str = price.toFixed(20);
  const afterDecimal = str.split(".")[1];
  const zerosCount = afterDecimal.search(/[1-9]/);

  if (zerosCount > 0) {
    const significantDigits = afterDecimal.slice(zerosCount, zerosCount + 3);

    // Convert zeros count to subscript
    const subscriptZeros = zerosCount
      .toString()
      .split("")
      .map((digit) => subscriptMap[digit])
      .join("");

    return `$0.0${subscriptZeros}${significantDigits}`;
  }

  // Fallback for edge cases
  return `$${price.toExponential(2)}`;
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
    `💰 Price: **${formatPrice(token.price)}**\n` +
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
  const farmEmoji = pool.has_farm ? (pool.farm_active ? "🚜✅" : "🚜⏸️") : "";
  const verifiedEmoji = pool.tokens_verified ? "✅" : "⚠️";

  // Calculate exchange rate (1 token_a = X token_b)
  const exchangeRate =
    pool.token_a_amount > 0
      ? (pool.token_b_amount / pool.token_a_amount).toFixed(6)
      : "0";

  // Calculate total LP fee (base + dynamic)
  const totalLpFee = ((pool.base_fee + pool.dynamic_fee) * 100).toFixed(5);
  const baseFeePercent = (pool.base_fee * 100).toFixed(2);
  const dynamicFeePercent = (pool.dynamic_fee * 100).toFixed(5);

  // Determine fee collection token (usually the quote token)
  const feeCollectionToken = pool.token_b_symbol; // Assuming token_b is quote token

  // Calculate pool age
  const poolAgeHours = pool.created_at_slot_timestamp
    ? Math.floor((Date.now() / 1000 - pool.created_at_slot_timestamp) / 3600)
    : 0;
  const poolAgeDisplay =
    poolAgeHours < 24
      ? `${poolAgeHours}h`
      : `${Math.floor(poolAgeHours / 24)}d`;

  return (
    `🏊‍♂️ **${pool.pool_name}** ${verifiedEmoji}\n` +
    `📍 Pool: \`${truncateAddress(pool.pool_address)}\`\n` +
    `\n` +
    `💱 **Current Pool Price**\n` +
    `1 ${pool.token_a_symbol} ≈ ${exchangeRate} ${pool.token_b_symbol}\n` +
    `⚖️ Pool Price: ${formatPrice(pool.pool_price)}\n` +
    `📊 Virtual Price: ${formatPrice(pool.virtual_price)}\n` +
    `\n` +
    `💰 **Liquidity & Volume**\n` +
    `💧 TVL: **$${formatNumber(pool.tvl)}**\n` +
    `📈 24h Volume: $${formatNumber(pool.volume24h)}\n` +
    `💸 24h Fees: $${formatNumber(pool.fee24h)}\n` +
    `📊 Fee/TVL Ratio: ${(pool.fee_tvl_ratio * 100).toFixed(3)}%\n` +
    `\n` +
    `🎯 **Fee Structure**\n` +
    `⚡ Base Fee: ${baseFeePercent}%\n` +
    `🔄 Dynamic Fee: ${pool.dynamic_fee > 0 ? `Yes (Current: ${dynamicFeePercent}%)` : "No"}\n` +
    `💎 Total LP Fee: **${totalLpFee}%**\n` +
    `🪙 Fee Collection: ${feeCollectionToken}\n` +
    `\n` +
    `📈 **Yield Information**\n` +
    `🎯 APR: ${aprEmoji} **${pool.apr.toFixed(2)}%**\n` +
    `${pool.has_farm ? `🚜 Farm: ${pool.farm_active ? "Active" : "Inactive"} ${farmEmoji}\n` : ""}` +
    `\n` +
    `🏗️ **Pool Composition**\n` +
    `${pool.token_a_symbol}: ${formatTokenAmount(pool.token_a_amount)} ($${formatNumber(pool.token_a_amount_usd)})\n` +
    `${pool.token_b_symbol}: ${formatTokenAmount(pool.token_b_amount)} ($${formatNumber(pool.token_b_amount_usd)})\n` +
    `🔒 Permanent Lock: ${formatNumber(pool.permanent_lock_liquidity)}\n`
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

/**
 * Format pool selection message
 */
export function formatPoolSelectionMessage(
  tokenInfo: TokenInfo,
  pools: MeteoraPoolData[]
): string {
  const tokenEmoji = tokenInfo.isVerified ? "✅" : "⚠️";

  let message = `🎯 **Select Pool for ${tokenInfo.symbol}** ${tokenEmoji}\n\n`;
  message += `📊 **Token**: ${tokenInfo.name}\n`;
  message += `💰 **Price**: $${tokenInfo.price.toFixed(6)}\n\n`;
  message += `🏊‍♂️ **Available Pools** (${pools.length}):\n\n`;

  pools.forEach((pool, index) => {
    const farmEmoji = pool.has_farm ? (pool.farm_active ? "🚜✅" : "🚜⏸️") : "";
    message += `**${index + 1}. ${pool.pool_name}** ${farmEmoji}\n`;
    message += `   💹 APR: **${pool.apr.toFixed(1)}%**\n`;
    message += `   💰 TVL: $${formatNumber(pool.tvl)}\n`;
    message += `   📊 24h Vol: $${formatNumber(pool.volume24h)}\n\n`;
  });

  message += `👆 Select a pool to open your position`;

  return message;
}

/**
 * Format position confirmation message
 */
export function formatPositionConfirmation(pool: MeteoraPoolData): string {
  const farmEmoji = pool.has_farm ? (pool.farm_active ? "🚜✅" : "🚜⏸️") : "";
  const verifiedEmoji = pool.tokens_verified ? "✅" : "⚠️";

  let message = `🎯 **Open Position** ${verifiedEmoji}\n\n`;
  message += `🏊‍♂️ **Pool**: ${pool.pool_name} ${farmEmoji}\n`;
  message += `📍 \`${truncateAddress(pool.pool_address)}\`\n\n`;

  message += `📊 **Pool Metrics**\n`;
  message += `💹 APR: **${pool.apr.toFixed(1)}%**\n`;
  message += `💰 TVL: $${formatNumber(pool.tvl)}\n`;
  message += `📈 24h Volume: $${formatNumber(pool.volume24h)}\n`;
  message += `💸 24h Fees: $${formatNumber(pool.fee24h)}\n\n`;

  message += `⚖️ **Deposit Types**:\n`;
  message += `• **Spot**: Balanced 50/50 deposit\n`;
  message += `• **Curve**: Concentrated liquidity\n`;
  message += `• **Single-sided**: Deposit one token only\n\n`;

  message += `⚠️ **Risk Warning**: Liquidity provision involves impermanent loss risk\n\n`;
  message += `👆 Choose your deposit type to continue`;

  return message;
}
