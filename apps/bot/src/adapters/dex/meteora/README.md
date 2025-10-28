# Meteora DEX Adapter Module

This directory contains the enhanced Meteora API client with comprehensive support for all Meteora DEX endpoints.

## Files

- **`meteora-api.client.ts`** - Main API client implementation with retry, caching, circuit breaker, and logging
- **`meteora-dlmm.service.ts`** - Meteora DLMM SDK wrapper for position creation, closing, and on-chain interactions
- **`index.ts`** - Barrel export for clean imports

## Quick Start

```typescript
import { meteoraApiClient, meteoraDlmmService } from "@/adapters/dex/meteora";

// Fetch a pool
const pool = await meteoraApiClient.getPool(poolAddress);

// Build position creation transaction (RECOMMENDED - standardized naming)
const { instructions, positionKp } = await meteoraDlmmService.buildCreatePositionTx(
  poolAddress,
  userAddress,
  totalXAmount,
  totalYAmount,
  StrategyType.Spot,
  rangeInterval
);

// Parse position data from on-chain
const positionData = await meteoraDlmmService.parsePositionData(
  positionAddress,
  poolAddress
);
```

## Features

✅ Full method coverage (DLMM, DAMM v1/v2, positions)  
✅ Configurable retry with exponential backoff  
✅ Dual-layer caching (in-memory + Redis)  
✅ Circuit breaker pattern for resilience  
✅ Structured logging with Pino  
✅ Type-safe responses  
✅ Rich error handling

## Documentation

See comprehensive documentation at:
- **API Reference:** `apps/bot/docs/adapters/meteora-api-client.md`
- **Task Summary:** `apps/bot/docs/refactors/meteora/task-2.2-completion-summary.md`

## Usage

### Singleton Instance (Recommended)
```typescript
import { meteoraApiClient } from "@/adapters/dex/meteora";
const pool = await meteoraApiClient.getPool(poolAddress);
```

### Custom Configuration
```typescript
import { MeteoraApiClient } from "@/adapters/dex/meteora";

const client = new MeteoraApiClient({
  maxRetries: 5,
  timeoutMs: 15000,
  cacheTtl: {
    dlmmPool: 300, // 5 minutes
  },
});
```

## Error Handling

```typescript
import { meteoraApiClient, MeteoraApiError } from "@/adapters/dex/meteora";

try {
  const pool = await meteoraApiClient.getPool(poolAddress);
} catch (error) {
  if (error instanceof MeteoraApiError) {
    console.error(`API Error: ${error.message}`);
    console.error(`Endpoint: ${error.endpoint}`);
    console.error(`Status Code: ${error.statusCode}`);
  }
}
```

## Exports

- `MeteoraApiClient` - Main client class
- `meteoraApiClient` - Singleton instance
- `MeteoraApiClientConfig` - Configuration interface
- `MeteoraApiError` - Error class

## Migration from Legacy

If you're migrating from legacy services:

```typescript
// OLD
import { MeteoraApiService } from "@/services/meteora/meteora-api.service";
const service = new MeteoraApiService();
const pool = await service.getDlmmPool(poolAddress);

// NEW
import { meteoraApiClient } from "@/adapters/dex/meteora";
const pool = await meteoraApiClient.getPool(poolAddress);
```

## Related Files

- **Adapter:** `apps/bot/src/adapters/dex/meteora.adapter.ts` - Main Meteora adapter using this client
- **Types:** `apps/bot/src/types/meteora.types.ts` - Meteora-specific types
- **Config:** `apps/bot/src/config/dex.config.ts` - DEX configuration
