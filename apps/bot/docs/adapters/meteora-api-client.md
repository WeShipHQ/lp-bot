# MeteoraApiClient Documentation

## Overview

The enhanced `MeteoraApiClient` is a robust HTTP client for interacting with Meteora DEX APIs, providing comprehensive support for DLMM, DAMM v1, and DAMM v2 pools, as well as position-related endpoints.

**Location:** `apps/bot/src/adapters/dex/meteora/meteora-api.client.ts`

## Features

### 1. **Full Method Coverage**
- **DLMM Pools:** Single pool queries, trending/paginated pools, all pools
- **DAMM v1 Pools:** Pool queries with special handling for array responses
- **DAMM v2 Pools:** Pool queries with structured response format
- **Position Endpoints:** Fees, rewards, deposits, withdrawals

### 2. **Resilience & Reliability**
- **Retry Logic:** Configurable retry attempts with exponential backoff
- **Circuit Breaker:** Automatic failure detection and recovery
- **Timeout Handling:** Configurable request timeouts
- **Graceful Degradation:** Falls back to cached data when API unavailable

### 3. **Performance Optimization**
- **Dual-Layer Caching:**
  - In-memory cache (Map-based) with TTL for fastest access
  - Redis cache for persistence and shared state
- **Cache Key Generation:** Includes query params for accurate cache hits
- **Configurable TTLs:** Per-endpoint cache duration tuning

### 4. **Observability**
- **Structured Logging:** Pino logger with request/response context
- **Retry Tracking:** Logs retry attempts and outcomes
- **Performance Metrics:** Duration tracking for all requests
- **Error Context:** Rich error details without leaking sensitive data

### 5. **Type Safety**
- **Typed Responses:** All methods return properly typed data
- **Domain-Specific Errors:** `MeteoraApiError` with context preservation
- **Configuration Types:** `MeteoraApiClientConfig` interface

## API Reference

### Constructor

```typescript
new MeteoraApiClient(config?: MeteoraApiClientConfig)
```

#### Configuration Options

```typescript
interface MeteoraApiClientConfig {
  /** Base URL for DLMM API (default: https://dlmm-api.meteora.ag) */
  dlmmApiUrl?: string;
  
  /** Base URL for DAMM v1 API (default: https://damm-api.meteora.ag) */
  dammV1ApiUrl?: string;
  
  /** Base URL for DAMM v2 API (default: https://dammv2-api.meteora.ag) */
  dammV2ApiUrl?: string;
  
  /** Maximum retry attempts (default: 3) */
  maxRetries?: number;
  
  /** Request timeout in milliseconds (default: 10000) */
  timeoutMs?: number;
  
  /** Enable exponential backoff (default: true) */
  exponentialBackoff?: boolean;
  
  /** Cache TTL configuration in seconds */
  cacheTtl?: {
    dlmmPool?: number;        // default: 60
    dammV1Pool?: number;      // default: 60
    dammV2Pool?: number;      // default: 60
    trendingPools?: number;   // default: 120
    positionData?: number;    // default: 30
  };
  
  /** Circuit breaker configuration */
  circuitBreaker?: {
    enabled?: boolean;          // default: true
    failureThreshold?: number;  // default: 5
    successThreshold?: number;  // default: 2
    timeoutMs?: number;         // default: 15000
  };
}
```

### DLMM Methods

#### `getPool(poolAddress: string): Promise<MeteoraDlmmPoolResponse>`

Fetch a single DLMM pool by address.

**Example:**
```typescript
const pool = await client.getPool("8BnEgHoWFysVcuFFX7QztDmzuH8r5ZFvyP3sYwn1XTh6");
console.log(pool.name); // "SOL-USDC"
console.log(pool.tvl);  // Current TVL
```

#### `getTrendingPools(params?: DlmmPoolsPaginationParams): Promise<MeteoraDlmmPoolsPaginationResponse>`

Fetch trending DLMM pools with pagination and filtering.

**Parameters:**
- `page?: number` - Page number (1-indexed)
- `limit?: number` - Results per page
- `sort_key?: string` - Sort by: "tvl", "volume", "feetvlratio", etc.
- `order_by?: "asc" | "desc"` - Sort direction
- `search_term?: string` - Search token names
- `include_unknown?: boolean` - Include unverified tokens
- `hide_low_tvl?: number` - Minimum TVL threshold
- `hide_low_apr?: boolean` - Hide low APR pools
- `include_token_mints?: string[]` - Filter by token addresses
- `tags?: string[]` - Filter by tags
- `launchpad?: string[]` - Filter by launchpad

**Example:**
```typescript
const trending = await client.getTrendingPools({
  page: 1,
  limit: 10,
  sort_key: "feetvlratio",
  order_by: "desc",
  hide_low_tvl: 10000, // Min $10k TVL
});

trending.pairs.forEach(pool => {
  console.log(`${pool.name}: ${pool.fee_tvl_ratio.hour_24}`);
});
```

#### `getAllPools(): Promise<MeteoraDlmmPoolResponse[]>`

Fetch all DLMM pools (no pagination).

**Example:**
```typescript
const allPools = await client.getAllPools();
console.log(`Total pools: ${allPools.length}`);
```

### DAMM Methods

#### `getDammV1Pool(poolId: string): Promise<MeteoraDammV1PoolResponse>`

Fetch a DAMM v1 pool by address.

**Note:** DAMM v1 API returns an array; this method extracts the first element.

**Example:**
```typescript
const pool = await client.getDammV1Pool("PoolAddress...");
console.log(pool.pool_name);
console.log(pool.pool_tvl);
```

#### `getDammV2Pool(poolId: string): Promise<MeteoraDammV2PoolResponse>`

Fetch a DAMM v2 pool by address.

**Example:**
```typescript
const response = await client.getDammV2Pool("PoolAddress...");
const pool = response.data;
console.log(pool.pool_name);
console.log(pool.tvl);
```

### Position Methods

#### `getPositionClaimFees(positionAddress: string): Promise<DlmmClaimFee[]>`

Fetch claimable fees for a position.

**Returns:** Array of fee claims (empty array if position not found).

**Example:**
```typescript
const fees = await client.getPositionClaimFees("PositionAddress...");
fees.forEach(fee => {
  console.log(`Fee: ${fee.token_x_amount} X, ${fee.token_y_amount} Y`);
  console.log(`USD Value: $${fee.token_x_usd_amount + fee.token_y_usd_amount}`);
});
```

#### `getPositionClaimRewards(positionAddress: string): Promise<DlmmClaimReward[]>`

Fetch claimable rewards for a position.

**Returns:** Array of reward claims (empty array if position not found).

**Example:**
```typescript
const rewards = await client.getPositionClaimRewards("PositionAddress...");
rewards.forEach(reward => {
  console.log(`Reward: ${reward.token_amount} (${reward.reward_mint_address})`);
});
```

#### `getPositionDeposits(positionAddress: string): Promise<DlmmDepositWithdraw[]>`

Fetch deposit history for a position.

**Example:**
```typescript
const deposits = await client.getPositionDeposits("PositionAddress...");
deposits.forEach(deposit => {
  console.log(`Deposited at: ${new Date(deposit.onchain_timestamp * 1000)}`);
  console.log(`Amounts: ${deposit.token_x_amount} X, ${deposit.token_y_amount} Y`);
});
```

#### `getPositionWithdraws(positionAddress: string): Promise<DlmmDepositWithdraw[]>`

Fetch withdrawal history for a position.

**Example:**
```typescript
const withdrawals = await client.getPositionWithdraws("PositionAddress...");
console.log(`Total withdrawals: ${withdrawals.length}`);
```

### Utility Methods

#### `clearCache(): Promise<void>`

Clear all cached data (both in-memory and Redis).

**Example:**
```typescript
await client.clearCache();
console.log("Cache cleared");
```

#### `getCircuitBreakerState(): CircuitBreakerState`

Get current circuit breaker state for monitoring.

**Returns:** `"CLOSED" | "OPEN" | "HALF_OPEN"`

**Example:**
```typescript
const state = client.getCircuitBreakerState();
if (state === "OPEN") {
  console.warn("Circuit breaker is open - API is degraded");
}
```

## Error Handling

### MeteoraApiError

Domain-specific error class with rich context:

```typescript
try {
  await client.getPool("invalid-address");
} catch (error) {
  if (error instanceof MeteoraApiError) {
    console.error(`Endpoint: ${error.endpoint}`);
    console.error(`Status: ${error.statusCode}`);
    console.error(`Message: ${error.message}`);
    console.error(`Original error:`, error.originalError);
  }
}
```

### Common Error Scenarios

1. **404 Not Found:**
   - Position methods return empty arrays
   - Pool methods throw `MeteoraApiError` with `statusCode: 404`

2. **Circuit Breaker Open:**
   - Returns cached data if available
   - Throws `MeteoraApiError` if no cache exists

3. **Network Timeouts:**
   - Retries with exponential backoff (up to `maxRetries`)
   - Throws after exhausting retries

4. **Invalid Responses:**
   - Wrapped in `MeteoraApiError` with context

## Usage Examples

### Basic Usage (Singleton)

```typescript
import { meteoraApiClient } from "@/adapters/dex/meteora";

// Use the singleton instance
const pool = await meteoraApiClient.getPool("PoolAddress...");
```

### Custom Configuration

```typescript
import { MeteoraApiClient } from "@/adapters/dex/meteora";

const client = new MeteoraApiClient({
  maxRetries: 5,
  timeoutMs: 15000,
  cacheTtl: {
    dlmmPool: 300,      // 5 minutes
    trendingPools: 600, // 10 minutes
  },
  circuitBreaker: {
    failureThreshold: 10,
    timeoutMs: 30000, // 30 seconds
  },
});
```

### With Error Handling

```typescript
import { meteoraApiClient, MeteoraApiError } from "@/adapters/dex/meteora";

try {
  const trending = await meteoraApiClient.getTrendingPools({
    limit: 20,
    sort_key: "volume",
  });
  
  // Process trending pools...
} catch (error) {
  if (error instanceof MeteoraApiError) {
    if (error.statusCode === 503) {
      // API unavailable - maybe use fallback
      console.warn("Meteora API temporarily unavailable");
    } else {
      // Other error
      console.error("Failed to fetch trending:", error.message);
    }
  } else {
    throw error; // Unexpected error
  }
}
```

### Monitoring Circuit Breaker

```typescript
import { meteoraApiClient } from "@/adapters/dex/meteora";

// Check circuit breaker state
setInterval(() => {
  const state = meteoraApiClient.getCircuitBreakerState();
  console.log(`Meteora API circuit breaker state: ${state}`);
}, 60000); // Check every minute
```

### Cache Management

```typescript
import { meteoraApiClient } from "@/adapters/dex/meteora";

// Clear cache after significant pool updates
async function handlePoolUpdate() {
  await meteoraApiClient.clearCache();
  // Fetch fresh data
  const pools = await meteoraApiClient.getTrendingPools();
}
```

## Logging

All requests are logged with structured context:

```json
{
  "level": "info",
  "component": "MeteoraApiClient",
  "endpoint": "/pair/all_with_pagination",
  "url": "https://dlmm-api.meteora.ag/pair/all_with_pagination?page=1&limit=10",
  "duration": 342,
  "cached": false,
  "msg": "Request successful"
}
```

Error logs include full context:

```json
{
  "level": "error",
  "component": "MeteoraApiClient",
  "endpoint": "/pair/invalid",
  "url": "https://dlmm-api.meteora.ag/pair/invalid",
  "status": 404,
  "statusText": "Not Found",
  "duration": 156,
  "msg": "HTTP error"
}
```

## Performance Characteristics

### Cache Hit Rates
- **In-memory cache:** ~1ms latency
- **Redis cache:** ~5-10ms latency
- **API request:** ~100-500ms latency (depending on endpoint)

### Recommended TTLs
- **Pool data:** 60-120 seconds (pools change relatively slowly)
- **Trending pools:** 120-300 seconds (rankings change gradually)
- **Position data:** 30-60 seconds (fees/rewards update frequently)

### Circuit Breaker Behavior
- **Failure threshold:** 5 consecutive failures → circuit opens
- **Open duration:** 15 seconds before attempting recovery
- **Success threshold:** 2 consecutive successes → circuit closes

## Migration from Legacy Services

### From MeteoraApiService

```typescript
// OLD (legacy)
import { MeteoraApiService } from "@/services/meteora/meteora-api.service";
const service = new MeteoraApiService();
const pool = await service.getDlmmPool(poolAddress);

// NEW (enhanced)
import { meteoraApiClient } from "@/adapters/dex/meteora";
const pool = await meteoraApiClient.getPool(poolAddress);
```

### From MeteoraPoolService

```typescript
// OLD (legacy)
import { meteoraPoolService } from "@/services/meteora/pool.service";
const pool = await meteoraPoolService.getDlmmPoolInfo(poolAddress);
const fees = await meteoraPoolService.getPositionClaimFees(positionAddress);

// NEW (enhanced)
import { meteoraApiClient } from "@/adapters/dex/meteora";
const pool = await meteoraApiClient.getPool(poolAddress);
const fees = await meteoraApiClient.getPositionClaimFees(positionAddress);
```

## Best Practices

1. **Use the Singleton:** Import `meteoraApiClient` for most use cases
2. **Handle Errors:** Always wrap calls in try-catch with `MeteoraApiError` handling
3. **Monitor Circuit Breaker:** Log circuit breaker state changes for alerting
4. **Tune Cache TTLs:** Adjust based on your data freshness requirements
5. **Clear Cache on Updates:** Invalidate cache when you know data has changed
6. **Log Context:** Use child loggers with request-specific context

## Testing

### Unit Tests

```typescript
import { MeteoraApiClient } from "@/adapters/dex/meteora";

describe("MeteoraApiClient", () => {
  let client: MeteoraApiClient;

  beforeEach(() => {
    client = new MeteoraApiClient({
      circuitBreaker: { enabled: false }, // Disable for tests
      cacheTtl: { dlmmPool: 0 }, // Disable caching for tests
    });
  });

  it("should fetch a pool", async () => {
    const pool = await client.getPool("ValidPoolAddress");
    expect(pool.address).toBe("ValidPoolAddress");
  });
});
```

### Integration Tests

```typescript
it("should use cache on subsequent requests", async () => {
  const client = new MeteoraApiClient();
  
  const start1 = Date.now();
  await client.getPool(poolAddress);
  const duration1 = Date.now() - start1;
  
  const start2 = Date.now();
  await client.getPool(poolAddress); // Should hit cache
  const duration2 = Date.now() - start2;
  
  expect(duration2).toBeLessThan(duration1 / 10); // Cache is 10x+ faster
});
```

## Troubleshooting

### Issue: "Circuit breaker open" errors

**Cause:** Too many API failures in a short time.

**Solution:**
1. Check Meteora API status
2. Verify network connectivity
3. Increase circuit breaker thresholds if API is flaky
4. Use cached data as fallback

### Issue: Stale cache data

**Cause:** Cache TTL is too long for your use case.

**Solution:**
1. Reduce cache TTL in configuration
2. Call `clearCache()` after known updates
3. Use shorter TTLs for frequently-changing data

### Issue: High latency

**Cause:** Cache misses or slow API responses.

**Solution:**
1. Increase cache TTLs to improve hit rate
2. Warm up cache on startup
3. Monitor circuit breaker state
4. Check network/API performance

## Future Enhancements

- [ ] Metrics collection (Prometheus format)
- [ ] Request batching for multiple pools
- [ ] WebSocket support for real-time updates
- [ ] Query result pagination streaming
- [ ] Advanced cache invalidation strategies

## References

- [Meteora DLMM API Documentation](https://docs.meteora.ag/api/dlmm)
- [Circuit Breaker Pattern](https://martinfowler.com/bliki/CircuitBreaker.html)
- [Pino Logger Documentation](https://getpino.io/)
