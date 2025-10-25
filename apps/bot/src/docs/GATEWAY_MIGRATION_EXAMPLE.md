# Example: Integrating Sanctum Gateway in Create Position Use Case

This example shows how to update the `create-position.use-case.ts` to use Sanctum Gateway with minimal changes and fallback support.

## Current Implementation

```typescript
// Current code (around line 196-208)
let signature = "" as string | undefined;
try {
  signature = await WalletService.signAndSendTransactionWithJitoV2(
    command.walletId,
    command.walletAddress,
    txResult.instructions,
    [txResult.positionKp],
    []
  );
} catch (err) {
  console.log("Transaction submission failed", { err, command });
  logger.error("Transaction submission failed", { err, command });
}
```

## Updated Implementation with Gateway

```typescript
import { WalletService } from "@/services/wallet.service";

// Add this import at the top of the file
// import { SanctumGatewayOptions } from "@/services/sanctum-gateway.service";

// Replace the transaction submission section (around line 196-208):
let signature = "" as string | undefined;
try {
  // Check if Gateway is available
  if (await WalletService.isGatewayAvailable()) {
    console.log("[CreatePosition] Using Sanctum Gateway for transaction");
    
    // Use Gateway for higher reliability
    signature = await WalletService.signAndSendTransactionWithGateway(
      user,
      txResult.instructions,
      [txResult.positionKp],
      [],
      {}, // Standard options
      {
        cuPriceRange: "high",        // High priority for position creation
        jitoTipRange: "medium",      // Medium Jito tips
        expireInSlots: 150,           // Standard expiry
        deliveryMethodType: undefined, // Let Gateway decide optimal method
        skipSimulation: false,         // Simulate for CU estimation
        skipPriorityFee: false,       // Let Gateway optimize fees
      } as SanctumGatewayOptions
    );
  } else {
    console.log("[CreatePosition] Gateway not available, using standard Jito method");
    
    // Fallback to existing method
    signature = await WalletService.signAndSendTransactionWithJitoV2(
      command.walletId,
      command.walletAddress,
      txResult.instructions,
      [txResult.positionKp],
      []
    );
  }
} catch (err) {
  console.log("Transaction submission failed", { err, command });
  logger.error("Transaction submission failed", { err, command });
}
```

## Alternative: Direct Gateway Usage

If you want to ensure Gateway is always used (when available), you can make it the primary method:

```typescript
let signature = "" as string | undefined;
try {
  // Try Gateway first
  try {
    signature = await WalletService.signAndSendTransactionWithGateway(
      user,
      txResult.instructions,
      [txResult.positionKp],
      [],
      {},
      {
        cuPriceRange: "high",
        jitoTipRange: "medium",
      }
    );
  } catch (gatewayError) {
    console.warn("[CreatePosition] Gateway failed, trying standard method:", gatewayError);
    
    // Fallback to standard method
    signature = await WalletService.signAndSendTransactionWithJitoV2(
      command.walletId,
      command.walletAddress,
      txResult.instructions,
      [txResult.positionKp],
      []
    );
  }
} catch (err) {
  console.log("Transaction submission failed", { err, command });
  logger.error("Transaction submission failed", { err, command });
}
```

## Gateway Options for Different Operations

### Position Creation (High Priority)
```typescript
{
  cuPriceRange: "high",        // Ensure position creation lands quickly
  jitoTipRange: "medium",      // Balance cost and speed
  expireInSlots: 150,           // Standard validity
}
```

### Fee Claiming (Medium Priority)
```typescript
{
  cuPriceRange: "medium",      // Medium priority for simple transfers
  deliveryMethodType: "rpc",   // Use RPC for simple operations
  jitoTipRange: "low",        // Lower tips for low-cost operations
}
```

### Rebalancing (High Priority)
```typescript
{
  cuPriceRange: "high",        // High priority to avoid impermanent loss
  jitoTipRange: "high",       // Higher tips for time-sensitive operations
  expireInSlots: 100,           // Shorter expiry for faster retries
}
```

## Benefits of This Approach

1. **No Breaking Changes**: Existing code continues to work if Gateway is not configured
2. **Automatic Fallback**: If Gateway fails, system falls back to existing methods
3. **Gradual Migration**: Can enable Gateway per environment or feature flag
4. **Better Reliability**: When available, Gateway provides higher success rates
5. **Easy Rollback**: Can disable Gateway by setting `SANCTUM_ENABLED=false`

## Testing

To test the integration:

1. **Without Gateway**:
   ```bash
   # Set environment variables
   SANCTUM_ENABLED=false
   # or
   unset SANCTUM_API_KEY
   ```

2. **With Gateway**:
   ```bash
   SANCTUM_ENABLED=true
   SANCTUM_API_KEY=your-api-key
   ```

3. **Check Logs**:
   ```
   [CreatePosition] Using Sanctum Gateway for transaction
   [SanctumGateway] Building optimized transaction
   [SanctumGateway] Transaction sent: 5KJp7...
   [Wallet] Gateway transaction sent: 5KJp7...
   ```

## Production Deployment

For production deployment:

1. Configure Gateway in your production environment
2. Set `SANCTUM_ENABLED=true`
3. Monitor logs for Gateway usage
4. Set up alerts for Gateway failures (to investigate fallbacks)

## Monitoring Gateway Performance

Add logging to track Gateway success rates:

```typescript
// Add to your use case
const gatewayStartTime = Date.now();
let usedGateway = false;

try {
  if (await WalletService.isGatewayAvailable()) {
    usedGateway = true;
    signature = await WalletService.signAndSendTransactionWithGateway(...);
  } else {
    signature = await WalletService.signAndSendTransactionWithJitoV2(...);
  }
} catch (error) {
  const gatewayTime = Date.now() - gatewayStartTime;
  
  logger.error("Transaction failed", {
    usedGateway,
    gatewayTime,
    error: error.message,
    userId: command.userId,
    dex: command.dex,
  });
  
  throw error;
}

const totalTime = Date.now() - gatewayStartTime;
logger.info("Transaction completed", {
  usedGateway,
  totalTime,
  signature,
  userId: command.userId,
});
```

This helps you:
- Compare Gateway vs standard performance
- Track fallback rates
- Identify Gateway issues early
- Optimize costs and success rates