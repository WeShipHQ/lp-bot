# Position PnL Verification Tool

This tool helps you verify and analyze the Profit & Loss (PnL) calculations for positions in your Liquidity Bot. It provides a comprehensive breakdown of how PnL is calculated and validates the accuracy of your current implementation.

## 📁 Files

- `pnl-api-server.js` - Node.js API server that connects to your PostgreSQL database
- `pnl-verification-tool-updated.html` - HTML interface for visualizing PnL data
- `pnl-verification-tool.html` - Original HTML file (for reference)

## 🚀 Quick Start

### 1. Install Dependencies

```bash
npm install pg cors express
```

### 2. Set Database Connection

Set your database URL as an environment variable:

```bash
export DATABASE_URL="postgresql://username:password@localhost:5432/your_database"
```

Or for Railway/Render deployment, the environment variable is typically already set.

### 3. Start the API Server

```bash
node pnl-api-server.js
```

The server will start on port 3001 (or use PORT env var to customize).

### 4. Open the Verification Tool

Open your browser and navigate to:
```
http://localhost:3001/pnl-verification-tool-updated.html
```

## 🔍 How to Use

### Step 1: Get a Position ID
Find a position ID from your database or from the bot application. Position IDs are UUIDs.

### Step 2: Analyze Position
1. Enter the Position ID in the input field
2. Click "Analyze Position"
3. Wait for the analysis to complete

### Step 3: Review Results
The tool displays several sections:

#### 📊 Position Overview
- Basic position information (ID, pool, DEX, status, creation date)
- Quick summary of the position

#### ✅ PnL Verification Results
- **Consistency Checks**: Validates that your PnL calculations are mathematically correct
  - Realized PnL matches closed segments
  - Fees claimed matches records
  - Total PnL calculation is consistent
- **Independent Verification**: Recalculates PnL using raw data to verify accuracy

#### 💰 PnL Calculation Breakdown
Shows the exact PnL formula and calculation:
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

#### 📈 Current PnL Status
- Information about the currently active segment
- Segment start date and initial value
- Whether position is in range

#### 🔄 Position Segments History
- Complete history of all position segments
- Each rebalance creates a new segment
- Shows initial/final values, realized PnL, and fees claimed

#### 💸 Fee Claim History
- All fee claiming events
- Distinguishes between manual claims and rebalance claims
- Shows USD values and SOL received

#### ⚖️ Rebalance History
- All rebalancing events
- Trigger reasons and PnL impact
- Gas costs and slippage

#### 📸 Recent Snapshots
- Periodic position state snapshots
- Shows PnL progression over time
- Useful for trend analysis

## 🧮 PnL Formula Explained

According to your documentation, the PnL is calculated as:

```
Total PnL = (Current Value - Initial Investment) + Total Fees Claimed

Where:
- Unrealized PnL = Current Value - Current Segment Initial Value
- Realized PnL = Sum of all closed segments' gains
- Total Fees = All claimed fees (manual + rebalance + closure)
```

## 🔧 API Endpoints

The server provides the following endpoints:

- `GET /api/health` - Check database connection
- `GET /api/position/:id` - Get position overview
- `GET /api/position/:id/segments` - Get position segments
- `GET /api/position/:id/claims` - Get claim history
- `GET /api/position/:id/rebalances` - Get rebalance history
- `GET /api/position/:id/snapshots` - Get recent snapshots
- `GET /api/position/:id/pnl-verification` - Get PnL verification data

## 🐛 Troubleshooting

### Database Connection Issues
- Ensure `DATABASE_URL` is set correctly
- Check that the database is accessible
- Verify SSL settings if using a remote database

### Position Not Found
- Verify the Position ID is correct (UUID format)
- Check that the position exists in the database
- Ensure the position ID is not truncated

### PnL Verification Fails
- Check for data inconsistencies in related tables
- Verify that all foreign key relationships are intact
- Look for missing or incorrect decimal values

### Performance Issues
- The tool queries multiple tables with joins
- Consider adding database indexes for better performance
- Use pagination for positions with long histories

## 📊 Understanding the Verification

### Consistency Checks

The tool performs three key consistency checks:

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

### What to Do If Verification Fails

1. **Realized PnL Mismatch**:
   - Check position segments table for incorrect `realized_pnl_usd`
   - Verify segment closure logic in rebalancing
   - Ensure all segment PnL is properly summed

2. **Fees Claimed Mismatch**:
   - Check claim_history table for missing records
   - Verify rebalance events include all fees
   - Ensure fee claiming logic updates position totals

3. **Total PnL Mismatch**:
   - Review the PnL calculation formula
   - Check for rounding errors in decimal operations
   - Verify current value calculation from snapshots

## 🔒 Security Considerations

- The API server connects directly to your database
- Don't expose this server to the public internet
- Use environment variables for database credentials
- Consider adding authentication for production use

## 🚀 Deployment

### Local Development
```bash
export DATABASE_URL="postgresql://user:pass@localhost:5432/db"
node pnl-api-server.js
```

### Railway/Render
1. Set `DATABASE_URL` environment variable
2. Deploy the `pnl-api-server.js` file
3. Access the HTML tool via the deployed URL

### Docker (Optional)
```dockerfile
FROM node:18-alpine
WORKDIR /app
COPY package*.json ./
RUN npm install
COPY . .
EXPOSE 3001
CMD ["node", "pnl-api-server.js"]
```

## 📝 Notes

- This tool is read-only and won't modify your data
- All decimal values are formatted to 2 decimal places for display
- The tool handles null/undefined values gracefully
- Large datasets may take a few seconds to load

## 🤝 Contributing

To extend this tool:

1. Add new API endpoints in `pnl-api-server.js`
2. Update the HTML interface to display new data
3. Add new visualization charts as needed
4. Enhance verification logic for additional consistency checks

## 📞 Support

If you encounter issues:

1. Check the browser console for JavaScript errors
2. Review the API server logs for database errors
3. Verify your database schema matches the expected structure
4. Test with known good position IDs first
