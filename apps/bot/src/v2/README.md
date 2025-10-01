# V2 Multi-DEX Architecture

This directory contains the refactored multi-DEX architecture for the Telegram bot. The new architecture provides a unified interface for interacting with multiple DEXes while maintaining extensibility for future additions.

## Architecture Overview

### Core Components

1. **Types** (`/types/`)
   - `core.types.ts`: Unified interfaces for pools, positions, transactions, etc.

2. **Interfaces** (`/interfaces/`)
   - `dex-adapter.interface.ts`: Contract that all DEX adapters must implement

3. **Adapters** (`/adapters/`)
   - `base-dex.adapter.ts`: Abstract base class with common functionality
   - `meteora.adapter.ts`: Meteora-specific implementation
   - `saros.adapter.ts`: Saros-specific implementation

4. **Services** (`/services/`)
   - `dex-registry.service.ts`: Central registry for managing adapters
   - `unified-pool.service.ts`: Unified pool operations across DEXes
   - `unified-position.service.ts`: Unified position operations across DEXes
   - `unified-input-detection.service.ts`: URL parsing and input detection

5. **Utils** (`/utils/`)
   - `transformers.ts`: Data transformation utilities

6. **Config** (`/config/`)
   - `dex.config.ts`: Configuration for each DEX

## Key Benefits

### 1. Extensibility
Adding a new DEX requires only:
- Implementing the `IDexAdapter` interface
- Registering the adapter in the registry
- No changes to core business logic

### 2. Unified Interface
All DEX operations use the same interface:
```typescript
// Works with any DEX
const pool = await unifiedPoolService.getPool(poolId, "meteora");
const positions = await unifiedPositionService.getUserPositions(userAddress, "saros");
```

### 3. Multi-DEX Operations
Easily aggregate data across all DEXes:
```typescript
const portfolio = await unifiedPositionService.getUserPortfolio(userAddress);
const trendingPools = await unifiedPoolService.getAllTrendingPools();
```

### 4. Type Safety
Full TypeScript support with unified types that work across all DEXes.

## Usage Examples

### Initialize the Architecture
```typescript
import { initializeV2Architecture } from "./v2";

// Call once during app startup
initializeV2Architecture();
```

### Get Pool Information
```typescript
import { unifiedPoolService } from "./v2";

// Get pool from specific DEX
const meteoraPool = await unifiedPoolService.getPool(poolId, "meteora");

// Get trending pools from all DEXes
const { pools, dexBreakdown } = await unifiedPoolService.getAllTrendingPools({
  limit: 10,
  sortBy: "tvl"
});
```

### Manage Positions
```typescript
import { unifiedPositionService } from "./v2";

// Get user's complete portfolio
const portfolio = await unifiedPositionService.getUserPortfolio(userAddress);

// Create position on specific DEX
const result = await unifiedPositionService.createPosition("meteora", {
  poolAddress,
  userAddress,
  tokenAAmount: "1000",
  tokenBAmount: "2000"
});
```

### Input Detection
```typescript
import { unifiedInputDetectionService } from "./v2";

// Detect input type and DEX
const detection = unifiedInputDetectionService.detectInput(userInput);

if (detection?.type === "pool") {
  const pool = await unifiedPoolService.getPool(detection.poolId!, detection.dex!);
}
```

## Adding a New DEX

### Step 1: Create Adapter
```typescript
// /adapters/raydium.adapter.ts
export class RaydiumAdapter extends BaseDexAdapter {
  readonly dexType: DexType = "raydium";
  readonly name: string = "Raydium";

  async getPool(poolId: string): Promise<UnifiedPool> {
    // Implement using Raydium SDK/API
  }

  // ... implement all required methods
}
```

### Step 2: Register Adapter
```typescript
// In index.ts
import { RaydiumAdapter } from "./adapters/raydium.adapter";

export function initializeV2Architecture(): void {
  dexRegistry.register(new MeteoraAdapter());
  dexRegistry.register(new SarosAdapter());
  dexRegistry.register(new RaydiumAdapter()); // Add this
}
```

### Step 3: Update Configuration
```typescript
// In config/dex.config.ts
export const DEX_CONFIGS: Record<DexType, DexConfig> = {
  // ... existing configs
  raydium: {
    enabled: true,
    apiUrl: "https://api.raydium.io",
    timeout: 10000,
    retries: 3,
  },
};
```

### Step 4: Update Types (if needed)
```typescript
// In types/core.types.ts
export type DexType = "meteora" | "saros" | "orca" | "raydium";
```

## Migration Strategy

The v2 architecture is designed to coexist with the existing v1 code:

1. **Phase 1**: Implement adapters using existing services
2. **Phase 2**: Gradually migrate bot handlers to use unified services
3. **Phase 3**: Replace v1 services with v2 implementations
4. **Phase 4**: Remove v1 code

## Error Handling

The architecture includes comprehensive error handling:
- `DexAdapterError` for DEX-specific errors
- Graceful degradation when DEXes are unavailable
- Detailed error reporting with context

## Testing

Each adapter can be tested independently:
```typescript
describe("MeteoraAdapter", () => {
  it("should get pool details", async () => {
    const adapter = new MeteoraAdapter();
    const pool = await adapter.getPool(poolId);
    expect(pool.dex).toBe("meteora");
  });
});
```

## Performance Considerations

- Parallel execution for multi-DEX operations
- Caching at the adapter level
- Rate limiting per DEX
- Connection pooling for API calls