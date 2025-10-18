import { formatNumber as baseFormatNumber, formatPercentage as baseFormatPercentage, formatPrice } from "@/bot/utils/formatters";

export function formatNumber(value: number | string, opts?: { maxDecimals?: number; useSuffixes?: boolean }): string {
  const num = typeof value === 'string' ? Number(value) : value;
  return baseFormatNumber(num, opts);
}

export function formatPercentage(value: number, opts?: { decimals?: number; alwaysShowSign?: boolean }): string {
  return baseFormatPercentage(value, opts);
}

export function formatCurrency(value: number, opts?: { maxDecimals?: number }): string {
  return formatPrice(value, { maxDecimals: opts?.maxDecimals ?? 2 });
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
