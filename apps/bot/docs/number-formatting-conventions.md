# Number Formatting Conventions

## Overview

This document outlines the number formatting conventions used throughout the Meteora Liquidity Bot application. These conventions ensure consistent display of financial data across all user interfaces.

## Core Principles

1. **Context-Specific Formatting**: Different types of numbers require different formatting approaches
2. **User Locale Support**: Numbers should be formatted according to user's locale preferences
3. **Precision Preservation**: Critical financial data maintains appropriate precision
4. **Visual Hierarchy**: More important numbers get more prominent formatting
5. **Accessibility**: All formatted numbers remain screen-reader friendly

## Number Types and Formatting Rules

### 1. Price Formatting (`formatPrice`)

**Purpose**: Display token prices with appropriate precision

**Rules**:
- Large prices (≥ $0.01): `$1.234` (3 decimal places)
- Small prices (< $0.01): `$0.0₃153` (subscript notation for leading zeros)
- Micro prices (< $0.000001): `$1.23e-7` (scientific notation)
- Zero prices: `$0.000`

**Examples**:

### 2. Market Cap & Volume Formatting (`formatNumber`)

**Purpose**: Display large numbers with appropriate suffixes

**Rules**:
- Billions: `2.45B` (2 decimal places)
- Millions: `150.5M` (1-2 decimal places)
- Thousands: `45.2K` (1-2 decimal places)
- Under 1K: `999.99` (2 decimal places)

**Examples**:
$2.45B
$150.5M
$45.2K
$999.99


### 3. Percentage Formatting (`formatPercentage`)

**Purpose**: Display percentage changes with proper sign indicators

**Rules**:
- Positive: `+12.55%` (with + sign)
- Negative: `-12.55%` (with - sign)
- Zero: `0.00%`
- Large changes: `+1,234.56%` (with comma separators)

**Examples**:
+12.55%
-0.01%
+1,234.56%
0.00%


### 4. Token Amount Formatting (`formatTokenAmount`)

**Purpose**: Display token quantities with configurable precision

**Rules**:
- Whole numbers: `1,234,567` (with comma separators)
- Decimal amounts: `123.456789` (configurable decimal places)
- Small amounts: `0.000123` (preserve precision)

**Examples**:
1,234,567
123.456789
0.000123


### 5. Address Formatting (`truncateAddress`)

**Purpose**: Display wallet/contract addresses in readable format

**Rules**:
- Default: `1A2B...9Z8Y` (first 4 + last 4 characters)
- Configurable start/end lengths
- Preserve readability while saving space

**Examples**:
1A2B...9Z8Y
So11...112 (for Solana addresses)


### 6. APR/APY Formatting (`formatAPR`)

**Purpose**: Display yield rates with appropriate precision

**Rules**:
- Standard rates: `12.34%` (2 decimal places)
- High yields: `1,234.56%` (with comma separators)
- Very high yields: `>10,000%` (capped display)

**Examples**:
12.34%
156.78%
1,234.56%

10,000%


### 7. Fee Formatting (`formatFee`)

**Purpose**: Display trading fees with high precision

**Rules**:
- Basis points: `0.25%` (2-5 decimal places)
- High precision: `0.12345%` (up to 5 decimal places)
- Fee ratios: `1.234%` (Fee/TVL ratios)

**Examples**:
0.25%
0.12345%
1.234%


### 8. Duration Formatting (`formatDuration`)

**Purpose**: Display time-based values consistently

**Rules**:
- Hours: `24h`, `2h`
- Days: `7d`, `30d`
- Months: `3mo`, `12mo`
- Auto-select appropriate unit

**Examples**:
2h
5d
3mo
1y


## Implementation Guidelines

### Function Organization

**Location**: `/src/bot/utils/formatters.ts`

**Naming Convention**:
- `format[Type]` - e.g., `formatPrice`, `formatPercentage`
- Use descriptive names that indicate the data type
- Maintain consistency with existing functions

### Parameters

**Standard Parameters**:
```typescript
interface FormattingOptions {
  locale?: string;           // User locale (default: 'en-US')
  decimals?: number;         // Decimal places (context-dependent)
  compact?: boolean;         // Use compact notation
  currency?: string;         // Currency code (default: 'USD')
}
```

### Error Handling

**Rules**:
- Invalid numbers: Return `"N/A"` or `"—"`
- Null/undefined: Return `"—"`
- Infinity: Return `"∞"`
- Very large numbers: Use scientific notation

### Performance Considerations

1. **Caching**: Cache formatted strings for frequently displayed values
2. **Memoization**: Use memoization for expensive formatting operations
3. **Lazy Loading**: Load locale data only when needed

## Internationalization (i18n)

### Locale Support

**Supported Locales**:
- `en-US` (default): `$1,234.56`
- `en-GB`: `£1,234.56`
- `de-DE`: `1.234,56 €`
- `ja-JP`: `¥1,234`

### Implementation

```typescript
const formatWithLocale = (value: number, locale: string = 'en-US') => {
  return new Intl.NumberFormat(locale, {
    style: 'currency',
    currency: getCurrencyForLocale(locale)
  }).format(value);
};
```

## Testing Guidelines

### Test Cases

**Required Test Categories**:
1. **Edge Cases**: Zero, negative, infinity, very large/small numbers
2. **Precision**: Decimal handling, rounding behavior
3. **Locale**: Different locale formatting
4. **Performance**: Large dataset formatting

**Example Test Structure**:
```typescript
describe('formatPrice', () => {
  it('should format large prices correctly', () => {
    expect(formatPrice(10000.123)).toBe('$10,000.123');
  });
  
  it('should handle small prices with subscript notation', () => {
    expect(formatPrice(0.0000153)).toBe('$0.0₄153');
  });
});
```

## Migration Guide

### Updating Existing Code

1. **Identify**: Find all hardcoded number formatting
2. **Replace**: Use appropriate formatting functions
3. **Test**: Verify visual consistency
4. **Optimize**: Remove duplicate formatting logic

### Breaking Changes

**Version 2.0 Changes**:
- `formatNumber` now supports locale parameter
- `formatPrice` uses subscript notation for small numbers
- All functions return consistent fallback values

## Best Practices

### Do's

✅ **Use context-appropriate functions**
✅ **Maintain consistent decimal places within contexts**
✅ **Handle edge cases gracefully**
✅ **Support user locale preferences**
✅ **Cache formatted values when possible**

### Don'ts

❌ **Don't hardcode number formatting**
❌ **Don't mix formatting styles in same context**
❌ **Don't ignore locale requirements**
❌ **Don't format numbers multiple times**
❌ **Don't use inconsistent fallback values**

## Examples in Context

### Portfolio Display
```typescript
const portfolioMessage = `
💰 Total Value: ${formatCurrency(totalValue)}
📈 24h Change: ${formatPercentage(change24h)}
🏊‍♂️ Active Positions: ${positions.length}
`;
```

### Pool Information
```typescript
const poolMessage = `
💧 TVL: ${formatNumber(pool.tvl)}
📊 APR: ${formatAPR(pool.apr)}
💸 Fee: ${formatFee(pool.fee)}
⏰ Age: ${formatDuration(pool.age)}
`;
```

### Token Details
```typescript
const tokenMessage = `
💰 Price: ${formatPrice(token.price)}
📊 Market Cap: ${formatNumber(token.marketCap)}
📈 Volume: ${formatNumber(token.volume24h)}
📍 Address: ${truncateAddress(token.address)}
`;
```

## Conclusion

Consistent number formatting is crucial for user experience in financial applications. These conventions ensure that all developers on the team format numbers consistently, making the application more professional and user-friendly.

For questions or suggestions regarding these conventions, please refer to the team lead or create an issue in the project repository.