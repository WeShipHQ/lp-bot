# Position Stop Loss & Take Profit Implementation

## Overview

This document describes the implementation of Stop Loss and Take Profit features for the Meteora Liquidity Bot. These features allow users to automatically close positions when price movements reach predefined thresholds, providing automated risk management.

## Features Summary

### Stop Loss (SL)
- **Purpose**: Automatically close position when price drops X% below entry price
- **Protection**: Limits downside risk and prevents further losses
- **Configuration**: User sets percentage during position creation (5%, 10%, 20%, or custom)
- **Trigger**: When current price ≤ (entry_price × (1 - SL%))

### Take Profit (TP)
- **Purpose**: Automatically close position when price rises X% above entry price
- **Benefit**: Secures gains at predefined target levels
- **Configuration**: User sets percentage during position creation (10%, 25%, 50%, or custom)
- **Trigger**: When current price ≥ (entry_price × (1 + TP%))

## Architecture

### System Design Alignment

The implementation follows the established system architecture:

```
User Interface (Scene) → Application Layer (Use Case) → Infrastructure Layer (Workers/Services)
                                    ↓
                              Database Layer (Schema/Persistence)
                                    ↓
                              DEX Layer (Adapters)
```

### Key Components

1. **Presentation Layer**: Enhanced position creation wizard with SL/TP configuration steps
2. **Application Layer**: Extended use cases to handle SL/TP parameters
3. **Infrastructure Layer**: Enhanced monitoring and rebalancing workers
4. **Database Layer**: Existing schema supports SL/TP fields
5. **Background Processing**: Job queue for automated position monitoring

## Implementation Details

### 1. Database Schema

The existing database schema already supports SL/TP:

```sql
-- In positions table
slPercentage decimal(5, 2),    -- Stop loss percentage
tpPercentage decimal(5, 2),    -- Take profit percentage
```

No schema changes required.

### 2. Position Creation Flow Enhancement

#### New Wizard Steps

**Step 7: Risk Management (8/9)**
- Location: After auto-rebalancing configuration
- Options: Set Stop Loss, Set Take Profit, Skip Risk Management
- UI: Clear explanation of SL/TP concepts with examples

**Step 7a: Stop Loss Configuration**
- Triggered when user selects "Set Stop Loss"
- Preset options: 5%, 10%, 20% (conservative to aggressive)
- Custom input: User can enter custom percentage (1-100%)
- Validation: Input validation with error messages

**Step 7b: Take Profit Configuration**
- Triggered when user selects "Set Take Profit"
- Preset options: 10%, 25%, 50% (conservative to aggressive)
- Custom input: User can enter custom percentage (1-1000% for TP)
- Validation: Input validation with error messages

#### Enhanced Summary Display

Position summary now includes configured SL/TP:
```
🛡️ Stop Loss: 10%
🎯 Take Profit: 25%
```

### 3. Application Layer Changes

#### CreatePositionUseCase Updates

**Interface Extensions**:
```typescript
interface CreatePositionCommand {
  // ... existing fields
  slPercentage?: number;     // Stop loss percentage
  tpPercentage?: number;     // Take profit percentage
}

interface PositionCreationContext {
  // ... existing fields
  slPercentage?: number;     // Stop loss percentage
  tpPercentage?: number;     // Take profit percentage
}
```

**Parameter Handling**:
- SL/TP parameters passed through entire creation pipeline
- Stored in database with position record
- Used by monitoring worker for trigger detection

### 4. Enhanced Position Monitoring

#### PositionMonitorWorker Updates

**Price Calculation**:
```typescript
// Calculate entry price from initial position value
const initialPriceUSD = Number(position.initialValueUSD) / Number(position.initialValueSOL) * (onchain?.metadata?.solPrice || 0);

// Calculate current price change percentage
const priceChangePercentage = ((currentPrice - initialPriceUSD) / initialPriceUSD) * 100;

// Check trigger conditions
const stopLossTriggered = position.slPercentage && priceChangePercentage <= -(position.slPercentage);
const takeProfitTriggered = position.tpPercentage && priceChangePercentage >= position.tpPercentage;
```

**Trigger Detection Logic**:
- Stop Loss: Price drops to or below SL threshold
- Take Profit: Price rises to or above TP threshold
- Both conditions checked every monitoring cycle (5 minutes)

**Notification System**:
```typescript
// Stop Loss Notification
await this.notificationService.sendNotification(userId, {
  type: "position",
  title: "🛡️ Stop Loss Triggered",
  message: `Your position ${positionAddress.slice(0, 6)}... has hit stop loss at ${Math.abs(priceChangePercentage).toFixed(2)}%. Auto-closing position to limit losses.`,
});

// Take Profit Notification
await this.notificationService.sendNotification(userId, {
  type: "position",
  title: "🎯 Take Profit Triggered", 
  message: `Your position ${positionAddress.slice(0, 6)}... has hit take profit at ${priceChangePercentage.toFixed(2)}%. Auto-closing position to secure gains.`,
});
```

**Auto-Close Integration**:
- When SL/TP triggered, enqueues close position job
- Uses existing rebalancing infrastructure
- Trigger reason: `stop_loss_triggered` or `take_profit_triggered`

### 5. Rebalancing Worker Enhancement

#### RebalanceWorker Updates

**Trigger Reason Handling**:
```typescript
// Enhanced notification logic based on trigger reason
let title = 'Rebalance Executed';
let message = `Rebalance successful for position ${positionId}. Tx: ${result.signature ?? ''}`;

if (reason === 'stop_loss_triggered') {
  title = '🛡️ Stop Loss Executed';
  message = `Stop loss executed for position ${positionId}. Position closed at ${result.signature ?? ''} to limit losses.`;
} else if (reason === 'take_profit_triggered') {
  title = '🎯 Take Profit Executed';
  message = `Take profit executed for position ${positionId}. Position closed at ${result.signature ?? ''} to secure gains.`;
}
```

**Consistent Job Processing**:
- Uses existing rebalancing infrastructure
- Enhanced notifications for SL/TP triggers
- Maintains existing error handling patterns

### 6. User Experience Flow

#### Complete User Journey

1. **Position Creation**:
   ```
   User selects pool → Strategy → Deposit method → Amount → 
   Auto-rebalancing → Risk Management (SL/TP) → Confirmation
   ```

2. **Position Monitoring**:
   ```
   Background monitoring (5min intervals) → Price change calculation → 
   SL/TP trigger detection → User notification → Auto-close job
   ```

3. **Position Closure**:
   ```
   Auto-close triggered → Position closed → Fees claimed → 
   SOL conversion → Final P&L → User notification
   ```

#### Error Handling

- **Input Validation**: Clear error messages for invalid percentages
- **Transaction Failures**: Retry logic with user notifications
- **Monitoring Failures**: Graceful degradation with retry mechanisms
- **User Communication**: Proactive notifications for all SL/TP events

## Configuration Options

### Stop Loss Presets

| Option | Use Case | Risk Level | Description |
|---------|-----------|------------|-------------|
| 5%      | Conservative | Low risk tolerance, protects against small drops |
| 10%     | Moderate | Balanced protection for normal volatility |
| 20%     | Aggressive | Higher risk tolerance, protects against larger drops |

### Take Profit Presets

| Option | Use Case | Target | Description |
|---------|-----------|---------|-------------|
| 10%     | Conservative | Secure modest gains with high probability |
| 25%     | Moderate | Balanced target for normal market conditions |
| 50%     | Aggressive | Target significant gains with lower probability |

## Technical Implementation

### Code Changes Summary

1. **Wizard State Extension**: Added SL/TP steps and state management
2. **UI Components**: New keyboard layouts and message formatters
3. **Use Case Enhancement**: Parameter passing and persistence
4. **Monitoring Logic**: Price calculation and trigger detection
5. **Notification System**: Enhanced messaging for SL/TP events
6. **Job Processing**: Extended rebalancing for auto-close scenarios

### Validation Rules

#### Input Validation
- Stop Loss: 1-100% (reasonable downside protection)
- Take Profit: 1-1000% (allows for significant upside potential)
- Custom values: Numeric validation with clear error messages
- Edge cases: Zero and negative values rejected

#### Business Logic Validation
- SL/TP cannot both be zero (must have at least one)
- TP percentage can be higher than SL (asymmetric risk tolerance)
- Configuration validated before position creation
- Database constraints enforced at persistence level

## Monitoring & Observability

### Key Metrics

1. **SL/TP Trigger Rate**: Percentage of positions hitting SL/TP
2. **Price Accuracy**: Difference between calculated and actual trigger prices
3. **Auto-Close Success Rate**: Successful automated closures
4. **User Satisfaction**: Feedback on SL/TP feature usage

### Logging Strategy

```typescript
// Structured logging for SL/TP events
logger.info("[PositionMonitorWorker] Stop loss triggered", {
  positionId,
  slPercentage: position.slPercentage,
  currentPrice,
  triggerPrice: calculatedTriggerPrice,
  priceChangePercentage: Math.abs(priceChangePercentage),
  userId,
});

logger.info("[PositionMonitorWorker] Take profit triggered", {
  positionId,
  tpPercentage: position.tpPercentage,
  currentPrice,
  triggerPrice: calculatedTriggerPrice,
  priceChangePercentage,
  userId,
});
```

### Error Categories

1. **Configuration Errors**: Invalid user inputs during setup
2. **Monitoring Failures**: Issues with price fetching or calculation
3. **Trigger Failures**: Problems with auto-close job execution
4. **Notification Failures**: Issues sending user alerts

## Future Enhancements

### Planned Improvements

1. **Trailing Stop Loss**: Dynamic SL that adjusts upward with price
2. **Partial Position Closure**: Close partial position on SL/TP trigger
3. **SL/TP History**: Track trigger history for user analytics
4. **Advanced Notifications**: Rich notifications with price charts
5. **Risk Analytics**: SL/TP effectiveness analysis and recommendations

### Multi-DEX Support

The implementation is designed to be DEX-agnostic:
- SL/TP stored in database (DEX-agnostic)
- Price calculation uses generic price data
- Trigger logic applies to any DEX position
- Monitoring works across all supported DEXes

## Testing Strategy

### Unit Testing

1. **Wizard Flow**: Test all SL/TP configuration paths
2. **Price Calculation**: Verify trigger detection accuracy
3. **Notification Logic**: Test message formatting and delivery
4. **Edge Cases**: Invalid inputs, boundary conditions
5. **Integration**: End-to-end SL/TP trigger and close flow

### Integration Testing

1. **Position Creation**: Create positions with SL/TP configurations
2. **Price Monitoring**: Simulate price movements and verify triggers
3. **Auto-Close**: Test complete SL/TP triggered closure flow
4. **Error Scenarios**: Test failure modes and recovery
5. **Performance**: Load testing with multiple monitored positions

## Security Considerations

### Data Validation

- All user inputs sanitized and validated
- Percentage ranges enforced server-side
- Database constraints prevent invalid data
- Transaction simulation before execution

### Access Control

- SL/TP configuration requires position ownership
- Auto-close jobs validate user permissions
- Notifications sent only to position owners
- Audit trail maintained for all SL/TP actions

## Conclusion

The Stop Loss and Take Profit implementation provides users with automated risk management tools while maintaining the existing system architecture and patterns. The features integrate seamlessly with the current position management flow and enhance the bot's value proposition by offering protection against downside risk and automation of profit-taking.

### Key Benefits

1. **Risk Management**: Automated protection against significant losses
2. **Profit Automation**: Systematic approach to securing gains
3. **24/7 Monitoring**: Continuous position monitoring without user intervention
4. **User Control**: Configurable thresholds to match risk tolerance
5. **Peace of Mind**: Automated execution reduces emotional trading decisions

The implementation maintains backward compatibility and follows established patterns, ensuring reliable operation while adding powerful new risk management capabilities.