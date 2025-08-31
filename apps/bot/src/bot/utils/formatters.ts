export function truncateAddress(
  address: string,
  start: number = 4,
  end: number = 4
): string {
  if (address.length <= start + end) return address;
  return `${address.slice(0, start)}...${address.slice(-end)}`;
}
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
      return new Intl.NumberFormat(locale, {
        minimumFractionDigits: minDecimals,
        maximumFractionDigits: maxDecimals,
      }).format(value) + "B";
    }
    if (num >= 1e6) {
      const value = num / 1e6;
      return new Intl.NumberFormat(locale, {
        minimumFractionDigits: minDecimals,
        maximumFractionDigits: maxDecimals,
      }).format(value) + "M";
    }
    if (num >= 1e3) {
      const value = num / 1e3;
      return new Intl.NumberFormat(locale, {
        minimumFractionDigits: minDecimals,
        maximumFractionDigits: maxDecimals,
      }).format(value) + "K";
    }
  }

  // Format without suffixes
  return new Intl.NumberFormat(locale, {
    minimumFractionDigits: minDecimals,
    maximumFractionDigits: maxDecimals,
  }).format(num);
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

/**
 * Format duration with intelligent unit selection
 */
export function formatDuration(
  seconds: number,
  options: {
    compact?: boolean;
    precision?: "low" | "medium" | "high";
  } = {}
): string {
  const { compact = true, precision = "medium" } = options;

  if (!isFinite(seconds) || isNaN(seconds) || seconds < 0) return "N/A";

  const units = [
    { name: "year", short: "y", seconds: 31536000 },
    { name: "month", short: "mo", seconds: 2592000 },
    { name: "day", short: "d", seconds: 86400 },
    { name: "hour", short: "h", seconds: 3600 },
    { name: "minute", short: "m", seconds: 60 },
    { name: "second", short: "s", seconds: 1 },
  ];

  for (const unit of units) {
    const value = Math.floor(seconds / unit.seconds);
    if (value >= 1) {
      if (compact) {
        return `${value}${unit.short}`;
      }

      const unitName = value === 1 ? unit.name : `${unit.name}s`;

      if (precision === "high" && unit.seconds > 60) {
        const remainder = seconds % unit.seconds;
        const nextUnit = units[units.indexOf(unit) + 1];
        if (nextUnit && remainder >= nextUnit.seconds) {
          const nextValue = Math.floor(remainder / nextUnit.seconds);
          const nextUnitName =
            nextValue === 1 ? nextUnit.name : `${nextUnit.name}s`;
          return `${value} ${unitName}, ${nextValue} ${nextUnitName}`;
        }
      }

      return `${value} ${unitName}`;
    }
  }

  return compact ? "0s" : "0 seconds";
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
    const sign = apr < 0 ? "-" : "+";
    return `${cap > 0 && showSign ? "+" : ""}>${cap.toLocaleString(locale)}%`;
  }

  const formatted = new Intl.NumberFormat(locale, {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  }).format(apr);

  const sign = apr > 0 && showSign ? "+" : "";
  return `${sign}${formatted}%`;
}

/**
 * Format fees with high precision
 */
export function formatFee(
  fee: number,
  options: {
    locale?: string;
    decimals?: number;
    asBasisPoints?: boolean;
  } = {}
): string {
  const { locale = "en-US", decimals = 5, asBasisPoints = false } = options;

  if (!isFinite(fee) || isNaN(fee)) return "N/A";

  const value = asBasisPoints ? fee * 10000 : fee * 100;
  const unit = asBasisPoints ? "bp" : "%";

  const formatted = new Intl.NumberFormat(locale, {
    minimumFractionDigits: 2,
    maximumFractionDigits: decimals,
  }).format(value);

  return `${formatted}${unit}`;
}

/**
 * Format market cap with locale support and intelligent sizing
 */
export function formatMarketCap(
  marketCap: number,
  options: {
    locale?: string;
    compact?: boolean;
    showCurrency?: boolean;
  } = {}
): string {
  const { locale = "en-US", compact = true, showCurrency = true } = options;

  if (!isFinite(marketCap) || isNaN(marketCap)) return "N/A";
  if (marketCap === 0) return showCurrency ? "$0" : "0";

  const absValue = Math.abs(marketCap);
  const sign = marketCap < 0 ? "-" : "";

  if (compact) {
    if (absValue >= 1e12) {
      return `${sign}${showCurrency ? "$" : ""}${(absValue / 1e12).toFixed(2)}T`;
    }
    if (absValue >= 1e9) {
      return `${sign}${showCurrency ? "$" : ""}${(absValue / 1e9).toFixed(2)}B`;
    }
    if (absValue >= 1e6) {
      return `${sign}${showCurrency ? "$" : ""}${(absValue / 1e6).toFixed(2)}M`;
    }
    if (absValue >= 1e3) {
      return `${sign}${showCurrency ? "$" : ""}${(absValue / 1e3).toFixed(2)}K`;
    }
  }

  return new Intl.NumberFormat(locale, {
    style: showCurrency ? "currency" : "decimal",
    currency: "USD",
    maximumFractionDigits: 2,
  }).format(marketCap);
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
