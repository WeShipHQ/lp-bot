# Sanctum Gateway Integration

This document describes how to use the Sanctum Gateway integration in the Liquidity Bot.

## Overview

Sanctum Gateway provides higher reliability and better transaction landing rates for Solana transactions. It automatically handles:
- Transaction simulation and optimization
- Priority fee estimation and setting
- Tip instruction generation for Jito bundles
- Delivery method routing (RPC, Jito, Sanctum Sender, etc.)
- Real-time parameter updates without code changes

## Configuration

Add these environment variables to your `.env` file:

```bash
# Sanctum Gateway API Key (required)
SANCTUM_API_KEY=your-sanctum-api-key

# Enable/disable Gateway (optional, defaults to false)
SANCTUM_ENABLED=true
```

Get your API key from: https://app.sanctum.so/gateway/api-keys

## Usage in Wallet Service

### New Gateway Methods

The `WalletService` class now includes these new methods:

### 1. `signAndSendTransactionWithGateway()`

Build and send transaction through Gateway with automatic optimization.

```typescript
import { WalletService } from "@/services/wallet.service";

const signature = await WalletService.signAndSendTransactionWithGateway(
  user,
  instructions,
  signers,
  lookupTables,
  options,           // CreateSmartTransactionOptions
  gatewayOptions      // SanctumGatewayOptions
);
```

**Parameters:**
- `user`: User object with wallet info
- `instructions`: Transaction instructions to execute
- `signers`: Optional array of signers
- `lookupTables`: Optional address lookup tables
- `options`: Standard transaction options (priorityFeeCap, etc.)
- `gatewayOptions`: Gateway-specific options

### 2. `signAndSendViaGateway()`

Send a pre-built transaction through Gateway.

```typescript
const signature = await WalletService.signAndSendViaGateway(
  user,
  transaction,        // Pre-built Transaction or VersionedTransaction
  gatewayOptions      // SanctumGatewayOptions
);
```

### 3. `isGatewayAvailable()`

Check if Gateway is configured and healthy.

```typescript
if (await WalletService.isGatewayAvailable()) {
  // Use Gateway methods
} else {
  // Use standard methods
}
```

## Gateway Options

### `SanctumGatewayOptions`

```typescript
interface SanctumGatewayOptions {
  /** Override project-level CU price range */
  cuPriceRange?: "low" | "medium" | "high";
  
  /** Override project-level Jito tip range */
  jitoTipRange?: "low" | "medium" | "high" | "max";
  
  /** Transaction expiry in slots */
  expireInSlots?: number;
  
  /** Force specific delivery method */
  deliveryMethodType?: "rpc" | "jito" | "sanctum-sender" | "helius-sender";
  
  /** Skip transaction simulation */
  skipSimulation?: boolean;
  
  /** Skip priority fee optimization */
  skipPriorityFee?: boolean;
}
```

### Examples

#### Basic Usage with Defaults

```typescript
const signature = await WalletService.signAndSendTransactionWithGateway(
  user,
  [createPositionInstruction, claimFeeInstruction],
  [userKeypair],
  lookupTables
);
```

#### Custom Gateway Options

```typescript
const signature = await WalletService.signAndSendTransactionWithGateway(
  user,
  instructions,
  signers,
  lookupTables,
  {},
  {
    cuPriceRange: "high",           // Use high priority fees
    jitoTipRange: "medium",        // Medium Jito tips
    expireInSlots: 100,            // Expire in 100 slots
    deliveryMethodType: "jito"      // Force Jito delivery
  }
);
```

#### Fallback Behavior

Gateway methods automatically fallback to standard methods if:
- Gateway is not configured (`SANCTUM_API_KEY` missing)
- Gateway is disabled (`SANCTUM_ENABLED=false`)
- Gateway API call fails
- Gateway health check fails

This ensures no breaking changes - existing code continues to work.

## Integration in Use Cases

### Position Creation

```typescript
// In create-position.use-case.ts

// Check if Gateway is available
if (await WalletService.isGatewayAvailable()) {
  signature = await WalletService.signAndSendTransactionWithGateway(
    user,
    instructions,
    signers,
    lookupTables,
    options,
    {
      cuPriceRange: "high",     // High priority for position creation
      jitoTipRange: "medium",
    }
  );
} else {
  // Use existing method
  signature = await WalletService.signAndSendTransaction(
    user,
    instructions,
    signers,
    lookupTables,
    options
  );
}
```

### Fee Claiming

```typescript
// For high-priority fee claims
const signature = await WalletService.signAndSendTransactionWithGateway(
  user,
  [claimFeeInstruction],
  [userKeypair],
  [],
  {},
  {
    cuPriceRange: "medium",     // Medium priority sufficient
    deliveryMethodType: "rpc",  // Use RPC for simple transfers
  }
);
```

## Error Handling

Gateway methods include comprehensive error handling:

1. **Configuration Errors**: Logged and fallback to standard methods
2. **API Failures**: Automatic fallback with detailed logging
3. **Invalid Responses**: Proper error messages with codes
4. **Network Issues**: Retry logic in Gateway service

## Monitoring

Gateway integration includes logging at different levels:

```
[Wallet] Starting signAndSendTransactionWithGateway for user {userId}
[SanctumGateway] Building optimized transaction
[SanctumGateway] Sending transaction via Gateway
[SanctumGateway] Transaction sent: {signature}
[Wallet] Gateway transaction sent: {signature}
```

## Benefits

1. **Higher Success Rates**: Gateway routes to optimal delivery methods
2. **Automatic Optimization**: No manual fee/tip management
3. **Real-time Updates**: Change parameters without redeployment
4. **Better Visibility**: Transaction tracking and analytics
5. **Fallback Safety**: Existing methods work if Gateway fails

## Migration Guide

To migrate existing code to use Gateway:

1. **Minimal Change**: Replace method calls with Gateway versions
2. **Add Configuration**: Set environment variables
3. **Test Fallback**: Ensure standard methods still work
4. **Monitor**: Check logs for Gateway usage

### Before
```typescript
const signature = await WalletService.signAndSendTransaction(
  user, instructions, signers, lookupTables, options
);
```

### After
```typescript
const signature = await WalletService.signAndSendTransactionWithGateway(
  user, instructions, signers, lookupTables, options, gatewayOptions
);
```

## Rate Limits

Sanctum Gateway has a rate limit of 30 requests per 10 seconds globally. The service includes:
- Request queuing for high throughput
- Exponential backoff on failures
- Circuit breaker pattern for reliability

## Security

- API keys are stored securely in environment variables
- No sensitive data in logs
- All transactions are signed client-side via Privy
- Gateway cannot access private keys