// import {
//   formatNumber as baseFormatNumber,
//   formatPercentage as baseFormatPercentage,
//   formatPrice,
// } from "@/bot/utils/formatters";

// export function formatNumber(
//   value: number | string,
//   opts?: { maxDecimals?: number; useSuffixes?: boolean }
// ): string {
//   const num = typeof value === "string" ? Number(value) : value;
//   return baseFormatNumber(num, opts);
// }

/**
 * Format numbers with appropriate suffixes (K, M, B)
 */
export function formatNumber(
  num: number | string,
  options: {
    locale?: string;
    minDecimals?: number;
    maxDecimals?: number;
    useSuffixes?: boolean;
  } = {}
): string {
  const {
    locale = "en-US",
    minDecimals = 0,
    maxDecimals = 2,
    useSuffixes = false,
  } = options;

  num = Number(num);

  if (!isFinite(num) || isNaN(num)) return "N/A";

  // Apply suffixes only when requested
  if (useSuffixes) {
    if (num >= 1e9) {
      const value = num / 1e9;
      return (
        new Intl.NumberFormat(locale, {
          minimumFractionDigits: minDecimals,
          maximumFractionDigits: maxDecimals,
        }).format(value) + "B"
      );
    }
    if (num >= 1e6) {
      const value = num / 1e6;
      return (
        new Intl.NumberFormat(locale, {
          minimumFractionDigits: minDecimals,
          maximumFractionDigits: maxDecimals,
        }).format(value) + "M"
      );
    }
    if (num >= 1e3) {
      const value = num / 1e3;
      return (
        new Intl.NumberFormat(locale, {
          minimumFractionDigits: minDecimals,
          maximumFractionDigits: maxDecimals,
        }).format(value) + "K"
      );
    }
  }

  // Format without suffixes
  return new Intl.NumberFormat(locale, {
    minimumFractionDigits: minDecimals,
    maximumFractionDigits: maxDecimals,
  }).format(num);
}

/**
 * Enhanced percentage formatting with better sign handling
 */
export function formatPercentage(
  percentage: number,
  options: {
    locale?: string;
    decimals?: number;
    alwaysShowSign?: boolean;
    compact?: boolean;
  } = {}
): string {
  const {
    locale = "en-US",
    decimals = 2,
    alwaysShowSign = false,
    compact = false,
  } = options;

  if (!isFinite(percentage) || isNaN(percentage)) return "N/A";

  if (compact && Math.abs(percentage) >= 1000) {
    return new Intl.NumberFormat(locale, {
      style: "percent",
      notation: "compact",
      maximumFractionDigits: 1,
    }).format(percentage / 100);
  }

  const formatted = new Intl.NumberFormat(locale, {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  }).format(Math.abs(percentage));

  let sign = "";
  if (percentage > 0 && alwaysShowSign) {
    sign = "+";
  } else if (percentage < 0) {
    sign = "-";
  }

  return `${sign}${formatted}%`;
}

export function formatCurrency(
  value: number,
  opts?: { maxDecimals?: number }
): string {
  return formatPrice(value, { maxDecimals: opts?.maxDecimals ?? 2 });
}

/**
 * Enhanced price formatting with better small number handling
 */
export function formatPrice(
  price: number,
  options: {
    locale?: string;
    minDecimals?: number;
    maxDecimals?: number;
    compact?: boolean;
  } = {}
): string {
  const {
    locale = "en-US",
    minDecimals = 2,
    maxDecimals = 6,
    compact = false,
  } = options;

  if (price === 0) return "$0.000";
  if (!isFinite(price)) return price > 0 ? "$∞" : "$-∞";
  if (isNaN(price)) return "N/A";

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

  // Handle very large numbers with compact notation
  if (compact && Math.abs(price) >= 999) {
    return new Intl.NumberFormat(locale, {
      style: "currency",
      currency: "USD",
      notation: "compact",
      maximumFractionDigits: 2,
    }).format(price);
  }

  // Handle regular numbers (>= 0.01)
  if (Math.abs(price) >= 0.01) {
    return new Intl.NumberFormat(locale, {
      style: "currency",
      currency: "USD",
      minimumFractionDigits: minDecimals,
      maximumFractionDigits: Math.min(maxDecimals, 6),
    }).format(price);
  }

  // Handle very small numbers (< 0.01)
  const str = Math.abs(price).toFixed(20);
  const afterDecimal = str.split(".")[1];
  const zerosCount = afterDecimal.search(/[1-9]/);

  if (zerosCount > 0 && zerosCount <= 10) {
    const significantDigits = afterDecimal.slice(zerosCount, zerosCount + 3);
    const subscriptZeros = zerosCount
      .toString()
      .split("")
      .map((digit) => subscriptMap[digit])
      .join("");

    const sign = price < 0 ? "-" : "";
    return `${sign}$0.0${subscriptZeros}${significantDigits}`;
  }

  // Fallback to scientific notation for extremely small numbers
  return new Intl.NumberFormat(locale, {
    style: "currency",
    currency: "USD",
    notation: "scientific",
    maximumFractionDigits: 2,
  }).format(price);
}

export function formatDuration(ms: number): string {
  const seconds = Math.floor(ms / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);
  if (days > 0) return `${days}d ${hours % 24}h`;
  if (hours > 0) return `${hours}h ${minutes % 60}m`;
  if (minutes > 0) return `${minutes}m ${seconds % 60}s`;
  return `${seconds}s`;
}

export function formatTxLink(signature: string): string {
  return `https://solscan.io/tx/${signature}`;
}

/**
 * Format APR/APY with appropriate precision and capping
 */
export function formatAPR(
  apr: number,
  options: {
    locale?: string;
    decimals?: number;
    showSign?: boolean;
    cap?: number;
  } = {}
): string {
  const {
    locale = "en-US",
    decimals = 2,
    showSign = false,
    cap = 10000,
  } = options;

  if (!isFinite(apr) || isNaN(apr)) return "N/A";

  // Cap extremely high APRs
  if (Math.abs(apr) > cap) {
    return `${cap > 0 && showSign ? "+" : ""}>${cap.toLocaleString(locale)}%`;
  }

  const formatted = new Intl.NumberFormat(locale, {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  }).format(apr);

  const sign = apr > 0 && showSign ? "+" : "";
  return `${sign}${formatted}%`;
}
