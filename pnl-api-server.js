/**
 * Position PnL Verification API Server
 * 
 * This is a simple standalone server that connects to your PostgreSQL database
 * and provides API endpoints for the PnL verification HTML tool.
 * 
 * Usage:
 * 1. Install dependencies: npm install pg cors express
 * 2. Set DATABASE_URL environment variable
 * 3. Run: node pnl-api-server.js
 * 4. Open pnl-verification-tool.html in browser
 */

const express = require('express');
const { Pool } = require('pg');
const cors = require('cors');

const app = express();
app.use(cors());
app.use(express.json());

// Database connection
const pool = new Pool({
  connectionString: process.env.DATABASE_URL || 'postgresql://username:password@localhost:5432/database',
  ssl: process.env.DATABASE_URL?.includes('sslmode=require') ? { rejectUnauthorized: false } : false
});

// Helper function to format decimal values
function formatDecimal(value) {
  return value ? parseFloat(value) : 0;
}

// Helper function to format UUID
function formatUUID(uuid) {
  return uuid ? uuid.substring(0, 8) + '...' : 'N/A';
}

// API endpoint to get position overview
app.get('/api/position/:id', async (req, res) => {
  try {
    const { id } = req.params;
    
    const query = `
      SELECT 
        p.id,
        p.position_address,
        p.pool_address,
        p.dex,
        p.status,
        p.initial_value_usd,
        p.current_segment_initial_usd,
        p.total_realized_pnl_usd,
        p.total_fees_claimed_usd,
        p.created_at,
        p.updated_at,
        p.token_x,
        p.token_y,
        -- Get current position value from latest snapshot
        (SELECT ps.current_value_usd 
         FROM "PositionSnapshot" ps 
         WHERE ps.position_id = p.id 
         ORDER BY ps.created_at DESC 
         LIMIT 1) as current_value_usd
      FROM "positions" p
      WHERE p.id = $1
    `;
    
    const result = await pool.query(query, [id]);
    
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Position not found' });
    }
    
    const position = result.rows[0];
    
    res.json({
      id: position.id,
      positionAddress: position.position_address,
      poolAddress: position.pool_address,
      dex: position.dex,
      status: position.status,
      initialValueUSD: formatDecimal(position.initial_value_usd),
      currentValueUSD: formatDecimal(position.current_value_usd) || formatDecimal(position.current_segment_initial_usd),
      currentSegmentInitialUSD: formatDecimal(position.current_segment_initial_usd),
      totalRealizedPnlUSD: formatDecimal(position.total_realized_pnl_usd),
      totalFeesClaimedUSD: formatDecimal(position.total_fees_claimed_usd),
      createdAt: position.created_at,
      tokenX: position.token_x,
      tokenY: position.token_y
    });
    
  } catch (error) {
    console.error('Error fetching position:', error);
    res.status(500).json({ error: error.message });
  }
});

// API endpoint to get position segments
app.get('/api/position/:id/segments', async (req, res) => {
  try {
    const { id } = req.params;
    
    const query = `
      SELECT 
        ps.id,
        ps.segment_number,
        ps.start_timestamp,
        ps.end_timestamp,
        ps.initial_value_usd,
        ps.final_value_usd,
        ps.realized_pnl_usd,
        ps.realized_pnl_percentage,
        ps.fees_claimed_usd,
        ps.closure_reason,
        ps.created_at
      FROM "PositionSegment" ps
      WHERE ps.position_id = $1
      ORDER BY ps.segment_number ASC
    `;
    
    const result = await pool.query(query, [id]);
    
    const segments = result.rows.map(row => ({
      id: row.id,
      segmentNumber: row.segment_number,
      startTimestamp: row.start_timestamp,
      endTimestamp: row.end_timestamp,
      initialValueUSD: formatDecimal(row.initial_value_usd),
      finalValueUSD: formatDecimal(row.final_value_usd),
      realizedPnlUSD: formatDecimal(row.realized_pnl_usd),
      realizedPnlPercentage: formatDecimal(row.realized_pnl_percentage),
      feesClaimedUSD: formatDecimal(row.fees_claimed_usd),
      closureReason: row.closure_reason,
      createdAt: row.created_at
    }));
    
    res.json(segments);
    
  } catch (error) {
    console.error('Error fetching segments:', error);
    res.status(500).json({ error: error.message });
  }
});

// API endpoint to get claim history
app.get('/api/position/:id/claims', async (req, res) => {
  try {
    const { id } = req.params;
    
    const query = `
      SELECT 
        ch.id,
        ch.claim_type,
        ch.claimed_token_x_amount,
        ch.claimed_token_y_amount,
        ch.claimed_usd_value,
        ch.token_x_price_usd,
        ch.token_y_price_usd,
        ch.sol_received,
        ch.sol_price_usd,
        ch.transaction_signature,
        ch.is_during_rebalance,
        ch.notes,
        ch.created_at
      FROM "claim_history" ch
      WHERE ch.position_id = $1
      ORDER BY ch.created_at DESC
    `;
    
    const result = await pool.query(query, [id]);
    
    const claims = result.rows.map(row => ({
      id: row.id,
      claimType: row.claim_type,
      claimedTokenXAmount: formatDecimal(row.claimed_token_x_amount),
      claimedTokenYAmount: formatDecimal(row.claimed_token_y_amount),
      claimedUSDValue: formatDecimal(row.claimed_usd_value),
      tokenXPriceUSD: formatDecimal(row.token_x_price_usd),
      tokenYPriceUSD: formatDecimal(row.token_y_price_usd),
      solReceived: formatDecimal(row.sol_received),
      solPriceUSD: formatDecimal(row.sol_price_usd),
      transactionSignature: row.transaction_signature,
      isDuringRebalance: row.is_during_rebalance,
      notes: row.notes,
      createdAt: row.created_at
    }));
    
    res.json(claims);
    
  } catch (error) {
    console.error('Error fetching claims:', error);
    res.status(500).json({ error: error.message });
  }
});

// API endpoint to get rebalance history
app.get('/api/position/:id/rebalances', async (req, res) => {
  try {
    const { id } = req.params;
    
    const query = `
      SELECT 
        re.id,
        re.trigger_reason,
        re.old_position_address,
        re.new_position_address,
        re.segment_initial_usd,
        re.segment_final_usd,
        re.segment_pnl_usd,
        re.segment_pnl_percentage,
        re.fees_collected_usd,
        re.new_segment_initial_usd,
        re.total_gas_cost_sol,
        re.slippage_cost_usd,
        re.close_transaction_signature,
        re.create_transaction_signature,
        re.notes,
        re.created_at
      FROM "RebalanceEvent" re
      WHERE re.position_id = $1
      ORDER BY re.created_at DESC
    `;
    
    const result = await pool.query(query, [id]);
    
    const rebalances = result.rows.map(row => ({
      id: row.id,
      triggerReason: row.trigger_reason,
      oldPositionAddress: row.old_position_address,
      newPositionAddress: row.new_position_address,
      segmentInitialUSD: formatDecimal(row.segment_initial_usd),
      segmentFinalUSD: formatDecimal(row.segment_final_usd),
      segmentPnlUSD: formatDecimal(row.segment_pnl_usd),
      segmentPnlPercentage: formatDecimal(row.segment_pnl_percentage),
      feesCollectedUSD: formatDecimal(row.fees_collected_usd),
      newSegmentInitialUSD: formatDecimal(row.new_segment_initial_usd),
      totalGasCostSOL: formatDecimal(row.total_gas_cost_sol),
      slippageCostUSD: formatDecimal(row.slippage_cost_usd),
      closeTransactionSignature: row.close_transaction_signature,
      createTransactionSignature: row.create_transaction_signature,
      notes: row.notes,
      createdAt: row.created_at
    }));
    
    res.json(rebalances);
    
  } catch (error) {
    console.error('Error fetching rebalances:', error);
    res.status(500).json({ error: error.message });
  }
});

// API endpoint to get recent snapshots
app.get('/api/position/:id/snapshots', async (req, res) => {
  try {
    const { id } = req.params;
    const limit = parseInt(req.query.limit) || 10;
    
    const query = `
      SELECT 
        ps.id,
        ps.snapshot_type,
        ps.current_value_usd,
        ps.token_x_amount,
        ps.token_y_amount,
        ps.unclaimed_fees_x,
        ps.unclaimed_fees_y,
        ps.unclaimed_fees_usd,
        ps.unrealized_pnl_usd,
        ps.unrealized_pnl_percentage,
        ps.total_pnl_usd,
        ps.total_pnl_percentage,
        ps.token_x_price_usd,
        ps.token_y_price_usd,
        ps.sol_price_usd,
        ps.created_at
      FROM "PositionSnapshot" ps
      WHERE ps.position_id = $1
      ORDER BY ps.created_at DESC
      LIMIT $2
    `;
    
    const result = await pool.query(query, [id, limit]);
    
    const snapshots = result.rows.map(row => ({
      id: row.id,
      snapshotType: row.snapshot_type,
      currentValueUSD: formatDecimal(row.current_value_usd),
      tokenXAmount: formatDecimal(row.token_x_amount),
      tokenYAmount: formatDecimal(row.token_y_amount),
      unclaimedFeesX: formatDecimal(row.unclaimed_fees_x),
      unclaimedFeesY: formatDecimal(row.unclaimed_fees_y),
      unclaimedFeesUSD: formatDecimal(row.unclaimed_fees_usd),
      unrealizedPnlUSD: formatDecimal(row.unrealized_pnl_usd),
      unrealizedPnlPercentage: formatDecimal(row.unrealized_pnl_percentage),
      totalPnlUSD: formatDecimal(row.total_pnl_usd),
      totalPnlPercentage: formatDecimal(row.total_pnl_percentage),
      tokenXPriceUSD: formatDecimal(row.token_x_price_usd),
      tokenYPriceUSD: formatDecimal(row.token_y_price_usd),
      solPriceUSD: formatDecimal(row.sol_price_usd),
      createdAt: row.created_at
    }));
    
    res.json(snapshots);
    
  } catch (error) {
    console.error('Error fetching snapshots:', error);
    res.status(500).json({ error: error.message });
  }
});

// API endpoint to calculate PnL verification
app.get('/api/position/:id/pnl-verification', async (req, res) => {
  try {
    const { id } = req.params;
    
    // Get all data needed for PnL calculation
    const [positionResult, segmentsResult, claimsResult, rebalancesResult] = await Promise.all([
      pool.query('SELECT * FROM "positions" WHERE id = $1', [id]),
      pool.query('SELECT * FROM "PositionSegment" WHERE position_id = $1 ORDER BY segment_number', [id]),
      pool.query('SELECT * FROM "claim_history" WHERE position_id = $1 ORDER BY created_at', [id]),
      pool.query('SELECT * FROM "RebalanceEvent" WHERE position_id = $1 ORDER BY created_at', [id])
    ]);
    
    if (positionResult.rows.length === 0) {
      return res.status(404).json({ error: 'Position not found' });
    }
    
    const position = positionResult.rows[0];
    const segments = segmentsResult.rows;
    const claims = claimsResult.rows;
    const rebalances = rebalancesResult.rows;
    
    // Get current position value from latest snapshot
    const snapshotResult = await pool.query(
      'SELECT current_value_usd FROM "PositionSnapshot" WHERE position_id = $1 ORDER BY created_at DESC LIMIT 1',
      [id]
    );
    
    const currentValueUSD = formatDecimal(snapshotResult.rows[0]?.current_value_usd) || formatDecimal(position.current_segment_initial_usd);
    
    // PnL Calculation according to documented formula
    const initialValueUSD = formatDecimal(position.initial_value_usd);
    const currentSegmentInitialUSD = formatDecimal(position.current_segment_initial_usd);
    const totalRealizedPnlUSD = formatDecimal(position.total_realized_pnl_usd);
    const totalFeesClaimedUSD = formatDecimal(position.total_fees_claimed_usd);
    
    // Calculate components
    const unrealizedPnlUSD = currentValueUSD - currentSegmentInitialUSD;
    const totalPnlUSD = unrealizedPnlUSD + totalRealizedPnlUSD + totalFeesClaimedUSD;
    const totalPnlPercentage = (totalPnlUSD / initialValueUSD) * 100;
    
    // Verification calculations
    const closedSegmentsPnL = segments
      .filter(s => s.realized_pnl_usd)
      .reduce((sum, s) => sum + formatDecimal(s.realized_pnl_usd), 0);
    
    const totalFeesFromClaims = claims
      .reduce((sum, c) => sum + formatDecimal(c.claimed_usd_value), 0);
    
    const totalFeesFromRebalances = rebalances
      .reduce((sum, r) => sum + formatDecimal(r.fees_collected_usd), 0);
    
    const totalFeesCalculated = totalFeesFromClaims + totalFeesFromRebalances;
    
    const verification = {
      // Documented formula calculation
      documentedCalculation: {
        initialValueUSD,
        currentValueUSD,
        currentSegmentInitialUSD,
        unrealizedPnlUSD,
        realizedPnlUSD: totalRealizedPnlUSD,
        totalFeesClaimedUSD,
        totalPnlUSD,
        totalPnlPercentage
      },
      
      // Independent verification
      independentVerification: {
        initialValueUSD,
        currentValueUSD,
        closedSegmentsPnL,
        totalFeesCalculated,
        verifiedTotalPnl: (currentValueUSD - initialValueUSD) + closedSegmentsPnL + totalFeesCalculated,
        totalFeesFromClaims,
        totalFeesFromRebalances
      },
      
      // Consistency checks
      consistencyChecks: {
        realizedPnLMatches: Math.abs(totalRealizedPnlUSD - closedSegmentsPnL) < 0.01,
        feesClaimedMatches: Math.abs(totalFeesClaimedUSD - totalFeesCalculated) < 0.01,
        totalPnLMatches: Math.abs(totalPnlUSD - ((currentValueUSD - initialValueUSD) + closedSegmentsPnL + totalFeesCalculated)) < 0.01
      },
      
      // Raw data for inspection
      rawData: {
        position,
        segments,
        claims,
        rebalances
      }
    };
    
    res.json(verification);
    
  } catch (error) {
    console.error('Error in PnL verification:', error);
    res.status(500).json({ error: error.message });
  }
});

// Health check endpoint
app.get('/api/health', async (req, res) => {
  try {
    await pool.query('SELECT 1');
    res.json({ status: 'healthy', database: 'connected' });
  } catch (error) {
    res.status(500).json({ status: 'unhealthy', database: 'disconnected', error: error.message });
  }
});

// Serve static files (for the HTML tool)
app.use(express.static(__dirname));

const PORT = process.env.PORT || 3001;
app.listen(PORT, () => {
  console.log(`🔍 PnL Verification API Server running on port ${PORT}`);
  console.log(`📊 Open http://localhost:${PORT}/pnl-verification-tool.html in your browser`);
  console.log(`🔗 API endpoints available at http://localhost:${PORT}/api/`);
  console.log(`💾 Make sure DATABASE_URL environment variable is set`);
});

// Graceful shutdown
process.on('SIGINT', async () => {
  console.log('\n🔄 Shutting down gracefully...');
  await pool.end();
  process.exit(0);
});
