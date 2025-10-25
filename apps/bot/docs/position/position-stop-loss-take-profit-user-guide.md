# Stop Loss & Take Profit User Guide

## Overview

Stop Loss and Take Profit are advanced risk management features that automatically close your liquidity positions when price movements reach predefined thresholds. This helps protect your investments from significant losses and secure gains automatically.

## Key Concepts

### Stop Loss (SL)
- **What it does**: Automatically closes your position if the price drops by a set percentage from your entry price
- **Why use it**: Protect against sudden market crashes and limit downside risk
- **When it triggers**: Position is closed and all liquidity is returned to your wallet

### Take Profit (TP)
- **What it does**: Automatically closes your position if the price rises by a set percentage from your entry price
- **Why use it**: Secure gains at predefined targets without manual intervention
- **When it triggers**: Position is closed and all liquidity plus fees are returned to your wallet

## How to Configure

### During Position Creation

1. **Create Position**: Start from any trending pool or use `/create`
2. **Select Strategy**: Choose Spot, Curve, or Bid-Ask strategy
3. **Select Deposit Method**: Choose SOL Auto-convert (recommended)
4. **Enter Amount**: Specify how much SOL to deposit
5. **Configure Auto-Rebalancing**: Choose whether to enable automatic rebalancing
6. **Set Risk Management**: Configure Stop Loss and/or Take Profit
7. **Confirm**: Review all settings and create position

### Risk Management Options

#### Stop Loss Settings
- **5%**: Conservative protection against small price drops
- **10%**: Moderate protection for normal market conditions
- **20%**: Aggressive protection against larger price movements
- **Custom**: Set your own percentage (1-100%)

#### Take Profit Settings
- **10%**: Conservative target, high probability of hitting
- **25%**: Moderate target, balanced risk/reward
- **50%**: Aggressive target, lower probability but higher returns
- **Custom**: Set your own percentage (1-1000%)

#### Skip Option
- Choose to skip risk management if you prefer manual position control

## How It Works

### Price Monitoring
- System monitors your position every 5 minutes
- Current price is compared to your entry price
- Price change percentage is calculated continuously

### Trigger Detection
- **Stop Loss**: Triggered when `current_price ≤ entry_price × (1 - sl_percentage)`
- **Take Profit**: Triggered when `current_price ≥ entry_price × (1 + tp_percentage)`

### Automatic Closure
- When triggered, system automatically:
  1. Claims all accumulated fees
  2. Closes the position on-chain
  3. Converts all tokens back to SOL
  4. Calculates final P&L
  5. Sends you a notification with transaction details

### Notifications
- **Trigger Alert**: Immediate notification when SL/TP is triggered
- **Execution Update**: Follow-up notification when position is successfully closed
- **Transaction Details**: Links to view transactions on Solscan

## Examples

### Example 1: Conservative Setup
- **Pool**: SOL-USDC
- **Entry Price**: $100 per SOL
- **Stop Loss**: 10% (triggers at $90 or lower)
- **Take Profit**: 25% (triggers at $125 or higher)
- **Result**: Position auto-closes if SOL drops to $90 or rises to $125

### Example 2: Aggressive Setup
- **Pool**: RAY-SOL
- **Entry Price**: $1.00 per RAY
- **Stop Loss**: 20% (triggers at $0.80 or lower)
- **Take Profit**: 50% (triggers at $1.50 or higher)
- **Result**: Position auto-closes if RAY drops to $0.80 or rises to $1.50

## Best Practices

### Setting Percentages
- **Stop Loss**: Typically 5-15% for most liquidity positions
- **Take Profit**: Typically 25-100% depending on market conditions
- **Volatility Consideration**: Use wider ranges for volatile pairs
- **Time Horizon**: Consider how long you plan to hold the position

### Risk Management Tips
1. **Start Small**: Use lower percentages when first starting
2. **Monitor Market**: Adjust SL/TP based on current market conditions
3. **Diversify**: Don't put all capital in one position
4. **Regular Review**: Check position performance and adjust settings
5. **Stay Informed**: Keep track of market news and events

### Common Scenarios

### Flash Crash Protection
- **Setup**: 10% Stop Loss
- **Event**: Sudden market crash drops price by 30%
- **Result**: Position closes at 10% loss, protecting against 30% loss

### Gradual Rise Capture
- **Setup**: 25% Take Profit
- **Event**: Price gradually rises 25% over several days
- **Result**: Position closes at 25% gain, securing profits

### Volatile Market Strategy
- **Setup**: 15% Stop Loss, 50% Take Profit
- **Event**: High volatility with large price swings
- **Result**: Protected from downside while capturing large upside moves

## Managing Active Positions

### Viewing Current Settings
- Go to **Portfolio** → Select position → **View Details**
- SL/TP settings displayed in position summary
- Can see current price and distance from triggers

### Modifying Settings
- Currently: SL/TP cannot be modified after position creation
- **Workaround**: Close position and create new one with updated settings
- **Future**: Position modification feature planned for updates

### Monitoring Status
- **Active Monitoring**: All positions checked every 5 minutes
- **Trigger Alerts**: Immediate notifications for SL/TP events
- **Execution Reports**: Detailed transaction confirmations

## Troubleshooting

### Position Not Closing
- **Check**: Is price monitoring active? (5-minute intervals)
- **Verify**: SL/TP percentages are set correctly
- **Network**: Ensure no network connectivity issues
- **Gas**: Check if you have sufficient SOL for transaction fees

### Unexpected Triggers
- **Price Data**: Verify price sources are accurate
- **Calculation**: Check entry price calculation method
- **Percentage**: Confirm trigger calculation is correct
- **Contact Support**: Report any suspected calculation errors

### Notifications Not Received
- **Check**: Telegram notifications are enabled
- **Verify**: Your Telegram username is correct
- **Network**: Ensure bot has message sending permissions
- **Spam**: Check if notifications are going to spam folder

## Advanced Features

### Combining with Auto-Rebalancing
- **Both Active**: SL/TP and auto-rebalancing can work together
- **Priority**: SL/TP triggers take precedence over rebalancing
- **Logic**: Auto-close executes if either condition is met first

### Multiple Positions
- **Independent**: Each position has its own SL/TP settings
- **Portfolio**: Manage risk across multiple positions separately
- **Monitoring**: All positions monitored simultaneously

### Market Conditions
- **High Volatility**: Consider wider SL/TP ranges
- **Trending Markets**: Adjust TP targets for strong trends
- **Sideways Markets**: May need tighter SL for choppy action

## Security Considerations

### Private Keys
- **Safe**: Your private keys never leave your wallet
- **Automated**: SL/TP triggers use secure transaction signing
- **Confirmation**: All closures require your wallet's confirmation

### Transaction Security
- **Validation**: All transactions simulated before execution
- **Slippage**: Protected with reasonable slippage settings
- **Monitoring**: Full transaction tracking and confirmation

### Data Privacy
- **Your Data**: SL/TP settings are stored privately
- **Encryption**: All sensitive data encrypted at rest
- **Access**: Only you can view and modify your position settings

## Getting Help

### Common Questions
- **Q**: Can I change SL/TP after creating a position?
- **A**: Currently, you need to close and recreate the position with new settings

- **Q**: What happens to fees when SL/TP triggers?
- **A**: All accumulated fees are automatically claimed and returned to you

- **Q**: Are there additional fees for SL/TP?
- **A**: No extra fees - standard transaction fees apply

- **Q**: Can I use SL/TP with single-sided positions?
- **A**: Currently only supported with SOL auto-convert positions

### Support Channels
- **In-App**: Use the help command `/help` for guidance
- **Community**: Join our Telegram group for user discussions
- **Issues**: Report bugs or feature requests via `/settings` → Contact Support

### Documentation
- **Technical**: See implementation documentation for developers
- **API**: Review our API documentation for integrations
- **Updates**: Follow our announcement channel for feature updates

## Conclusion

Stop Loss and Take Profit features provide automated risk management while maintaining control over your liquidity positions. Start with conservative settings and adjust based on your experience and market conditions. Remember that these tools are designed to help you manage risk, not guarantee profits.