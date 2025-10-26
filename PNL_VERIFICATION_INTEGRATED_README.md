# Position PnL Verification Tool (Integrated)

This tool helps you verify and analyze the Profit & Loss (PnL) calculations for positions in your Liquidity Bot. It has been **integrated directly into your existing Fastify server** - no additional server needed!

## 📁 Files Created/Modified

### New Files:
- `apps/bot/src/routes/pnl-verification.routes.ts` - API routes for PnL verification
- `apps/bot/src/plugins/pnl-verification.ts` - Plugin to register routes
- `pnl-verification-tool-updated.html` - Standalone HTML tool (for reference)

### Modified Files:
- `apps/bot/src/plugins/index.ts` - Added PnL verification plugin registration

## 🚀 Quick Start (No Setup Required!)

The PnL verification routes are now **integrated into your existing Fastify server**. Just start your bot normally:

```bash
# From your bot directory
npm start
# OR
node apps/bot/src/index.js
```

## 🔍 How to Use

### Step 1: Start Your Bot
Start your bot as usual. The PnL verification routes will be available automatically.

### Step 2: Access the Tool
Open your browser and navigate to:
```
http://localhost:3000/pnl-verification
```
(Adjust port if your bot runs on a different port)

### Step 3: Get a Position ID
Find a position ID from your database or from bot application. Position IDs are UUIDs.

### Step 4: Analyze Position
1. Enter Position ID in the input field
2. Click "Analyze Position"
3. Wait for analysis to complete

## 🔗 Available Endpoints

The PnL verification tool provides these API endpoints:

- `GET /api/pnl/health` - Check database connection
- `GET /api/pnl/position/:id` - Get position overview
- `GET /api/pnl/position/:id/segments` - Get position segments
- `GET /api/pnl/position/:id/claims` - Get claim history
- `GET /api/pnl/position/:id/rebalances` - Get rebalance history
- `GET /api/pnl/position/:id/snapshots` - Get recent snapshots
- `GET /api/pnl/position/:id/verification` - Get PnL verification data
- `GET /pnl-verification` - HTML verification tool

## 📊 What the Tool Shows

### 📊 Position Overview
- Basic position information (ID, pool, DEX, status, creation date)
- Current value and initial investment

### ✅ PnL Verification Results
**Consistency Checks:**
- ✅ Realized PnL matches closed segments
- ✅ Fees claimed matches records  
- ✅ Total PnL calculation is consistent

**Independent Verification:**
- Recalculates PnL using raw data
- Compares with documented formula
- Shows any discrepancies

### 💰 PnL Calculation Breakdown
Shows the exact formula and calculation:
```
Total PnL = Unrealized PnL + Realized PnL + Total Fees Claimed
```

Breakdown includes:
- Initial Investment
- Current Value
- Unrealized PnL (current segment)
- Realized PnL (from closed segments)
- Total Fees Claimed
- Total PnL with percentage

### 🔄 Position Segments History
- Complete history of all position segments
- Each rebalance creates a new segment
- Shows initial/final values, realized PnL, and fees claimed

### 💸 Fee Claim History
- All fee claiming events
- Distinguishes between manual claims and rebalance claims
- Shows USD values and SOL received

### ⚖️ Rebalance History
- All rebalancing events
- Trigger reasons and PnL impact
- Gas costs and slippage

### 📸 Recent Snapshots
- Periodic position state snapshots
- Shows PnL progression over time
- Useful for trend analysis

## 🧮 PnL Formula Verification

According to your documentation, PnL is calculated as:

```
Total PnL = (Current Value - Initial Investment) + Total Fees Claimed

Where:
- Unrealized PnL = Current Value - Current Segment Initial Value
- Realized PnL = Sum of all closed segments' gains
- Total Fees = All claimed fees (manual + rebalance + closure)
```

### Consistency Checks Performed

The tool performs three critical consistency checks:

1. **Realized PnL Match**: 
   - Compares `total_realized_pnl_usd` in positions table
   - With sum of `realized_pnl_usd` from all closed segments
   - Should match exactly (within 0.01 tolerance)

2. **Fees Claimed Match**:
   - Compares `total_fees_claimed_usd` in positions table
   - With sum of fees from claims and rebalances
   - Should match exactly (within 0.01 tolerance)

3. **Total PnL Consistency**:
   - Recalculates total PnL using independent method
   - Compares with documented formula result
   - Should match exactly (within 0.01 tolerance)

## 🐛 Troubleshooting

### Database Connection Issues
- Ensure your bot can connect to the database
- Check that all database migrations are applied
- Verify database credentials in environment variables

### Position Not Found
- Verify that Position ID is correct (UUID format)
- Check that position exists in `positions` table
- Ensure the position belongs to the correct user

### PnL Verification Fails
- Look for data inconsistencies in related tables
- Verify that all foreign key relationships are intact
- Check for missing or incorrect decimal values
- Review your PnL calculation logic in the codebase

## 🔒 Security Considerations

- The PnL verification routes are read-only and don't modify data
- They use the same database connection as your bot
- Consider adding authentication for production use
- The tool is accessible to anyone who can reach your bot server

## 📝 Development Notes

### How It Works
1. **Plugin Registration**: The `pnl-verification.ts` plugin registers all routes
2. **Database Access**: Uses the same Drizzle instance as your bot
3. **Data Aggregation**: Fetches data from multiple related tables
4. **Verification Logic**: Performs independent consistency checks
5. **HTML Interface**: Serves a complete web-based analysis tool

### Adding New Verification Logic
To extend the verification:

1. Add new database queries in `pnl-verification.routes.ts`
2. Update the verification logic in the `/verification` endpoint
3. Enhance the HTML interface to display new data
4. Add new consistency checks as needed

### Database Schema Requirements
The tool expects these tables to exist:
- `positions` - Main position data
- `PositionSegment` - Rebalancing segments
- `claim_history` - Fee claiming events
- `RebalanceEvent` - Rebalancing events
- `PositionSnapshot` - Periodic snapshots

## 🚀 Production Deployment

### Environment Variables
No additional environment variables needed - uses the same database connection as your bot.

### Security Recommendations
1. **Add Authentication**: For production use, consider protecting the routes:
```typescript
// In pnl-verification.routes.ts
fastify.addHook('onRequest', async (request, reply) => {
  if (request.url.startsWith('/api/pnl/')) {
    // Add your authentication logic here
    // Example: Check for API key, JWT token, etc.
  }
});
```

2. **Rate Limiting**: Add rate limiting to prevent abuse:
```typescript
import rateLimit from '@fastify/rate-limit';

fastify.register(rateLimit, {
  max: 100, // 100 requests per window
  timeWindow: '1 minute',
  skipOnError: true,
});
```

3. **CORS**: The routes inherit CORS settings from your main server

## 📞 Support

If you encounter issues:

1. **Check Bot Logs**: Look for errors when starting the server
2. **Browser Console**: Check for JavaScript errors in the verification tool
3. **Database Logs**: Ensure all queries are executing successfully
4. **Test with Known Data**: Start with positions you know are correct

## 🔄 Integration Benefits

### Why This Approach is Better
- **No Additional Infrastructure**: Uses your existing Fastify server
- **Shared Database Connection**: Same credentials, same connection pool
- **Consistent Environment**: Same development/production setup
- **Easy Deployment**: No extra services to manage
- **Unified Logging**: All logs go to your existing logger

### Future Enhancements
- Add real-time PnL updates via WebSocket
- Export PnL reports as CSV/PDF
- Bulk position analysis tools
- Historical PnL trending charts
- Automated PnL anomaly detection

---

**🎉 That's it! Your PnL verification tool is now integrated and ready to use. Just start your bot and navigate to `/pnl-verification` to begin analyzing positions!**
