import Decimal from "decimal.js";

/**
 * Number formatting and precision utilities following database precision standards
 */

// Database precision standards
export const PRECISION = {
  USD: { precision: 18, scale: 6 },      // $0.000001 precision
  SOL: { precision: 18, scale: 9 },      // 1 lamport precision
  TOKEN: { precision: 28, scale: 9 },    // Handles all token supplies
  PRICE: { precision: 18, scale: 9 },    // $0.000000001 for microcaps
  PERCENTAGE: { precision: 10, scale: 4 }, // 0.0001% precision
} as const;

/**
 * Converts raw lamports to SOL with proper precision
 */
export function lamportsToSol(lamports: string | number | bigint): Decimal {
  return new Decimal(lamports.toString()).div(new Decimal(10).pow(9));
}

/**
 * Converts SOL to lamports
 */
export function solToLamports(sol: string | number | Decimal): bigint {
  return BigInt(new Decimal(sol).mul(new Decimal(10).pow(9)).floor().toString());
}

/**
 * Converts raw token amount to UI amount based on decimals
 */
export function rawToUiAmount(raw: string | number | bigint, decimals: number): Decimal {
  return new Decimal(raw.toString()).div(new Decimal(10).pow(decimals));
}

/**
 * Converts UI amount to raw token amount
 */
export function uiToRawAmount(uiAmount: string | number | Decimal, decimals: number): bigint {
  return BigInt(new Decimal(uiAmount).mul(new Decimal(10).pow(decimals)).floor().toString());
}

/**
 * Truncates number for database insertion following precision standards
 */
export function truncateForDatabase(
  value: string | number | Decimal,
  type: keyof typeof PRECISION
): string {
  const decimal = new Decimal(value);
  const { precision, scale } = PRECISION[type];
  
  return decimal.toDecimalPlaces(scale, Decimal.ROUND_DOWN).toString();
}

/**
 * Truncates USD value for database storage
 */
export function truncateUSD(value: string | number | Decimal): string {
  return truncateForDatabase(value, 'USD');
}

/**
 * Truncates SOL amount for database storage
 */
export function truncateSOL(value: string | number | Decimal): string {
  return truncateForDatabase(value, 'SOL');
}

/**
 * Truncates token amount for database storage
 */
export function truncateToken(value: string | number | Decimal): string {
  return truncateForDatabase(value, 'TOKEN');
}

/**
 * Truncates price for database storage
 */
export function truncatePrice(value: string | number | Decimal): string {
  return truncateForDatabase(value, 'PRICE');
}

/**
 * Truncates percentage for database storage
 */
export function truncatePercentage(value: string | number | Decimal): string {
  return truncateForDatabase(value, 'PERCENTAGE');
}

/**
 * Formats number for display with appropriate decimals
 */
export function formatForDisplay(
  value: string | number | Decimal,
  decimals: number = 4
): string {
  const decimal = new Decimal(value);
  return decimal.toDecimalPlaces(decimals, Decimal.ROUND_DOWN).toString();
}

/**
 * Formats USD amount for display
 */
export function formatUSD(value: string | number | Decimal): string {
  return formatForDisplay(value, 2);
}

/**
 * Formats SOL amount for display
 */
export function formatSOL(value: string | number | Decimal): string {
  return formatForDisplay(value, 4);
}

/**
 * Formats percentage for display
 */
export function formatPercentage(value: string | number | Decimal): string {
  return formatForDisplay(value, 2);
}

/**
 * Safe number conversion that handles null/undefined
 */
export function safeDecimal(value: any): Decimal {
  if (value === null || value === undefined || value === '') {
    return new Decimal(0);
  }
  return new Decimal(value.toString());
}

/**
 * Checks if a value is effectively zero
 */
export function isZero(value: string | number | Decimal): boolean {
  return safeDecimal(value).isZero();
}

/**
 * Adds two numbers with proper precision handling
 */
export function addNumbers(
  a: string | number | Decimal,
  b: string | number | Decimal
): Decimal {
  return safeDecimal(a).plus(safeDecimal(b));
}

/**
 * Subtracts two numbers with proper precision handling
 */
export function subtractNumbers(
  a: string | number | Decimal,
  b: string | number | Decimal
): Decimal {
  return safeDecimal(a).minus(safeDecimal(b));
}

/**
 * Multiplies two numbers with proper precision handling
 */
export function multiplyNumbers(
  a: string | number | Decimal,
  b: string | number | Decimal
): Decimal {
  return safeDecimal(a).mul(safeDecimal(b));
}

/**
 * Divides two numbers with proper precision handling
 */
export function divideNumbers(
  a: string | number | Decimal,
  b: string | number | Decimal
): Decimal {
  return safeDecimal(a).div(safeDecimal(b));
}

/**
 * Calculates percentage change
 */
export function calculatePercentageChange(
  oldValue: string | number | Decimal,
  newValue: string | number | Decimal
): Decimal {
  const old = safeDecimal(oldValue);
  const newv = safeDecimal(newValue);
  
  if (old.isZero()) {
    return new Decimal(0);
  }
  
  return newv.minus(old).div(old).mul(100);
}

/**
 * Validates if a value is within acceptable range for database storage
 */
export function validateDatabaseRange(
  value: string | number | Decimal,
  type: keyof typeof PRECISION
): boolean {
  const decimal = safeDecimal(value);
  const { precision, scale } = PRECISION[type];
  
  // Check if the value fits within the precision limits
  const maxValue = new Decimal(10).pow(precision - scale).minus(1);
  const minValue = maxValue.negated();
  
  return decimal.gte(minValue) && decimal.lte(maxValue);
}