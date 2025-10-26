/**
 * PnL Verification API Routes
 * 
 * These routes provide endpoints for analyzing and verifying position PnL calculations.
 * Integrate these routes into your existing Fastify server setup.
 */

import { FastifyInstance } from 'fastify';
import { db } from '@/db';
import { eq, sql, desc, and } from 'drizzle-orm';
import * as schema from '@/db/schema';

// Helper function to format decimal values
function formatDecimal(value: any): number {
  return value ? parseFloat(value) : 0;
}

// Helper function to format UUID
function formatUUID(uuid: string): string {
  return uuid ? uuid.substring(0, 8) + '...' : 'N/A';
}

export async function registerPnlVerificationRoutes(fastify: FastifyInstance) {
  
  // Health check endpoint
  fastify.get('/api/pnl/health', async (request, reply) => {
    try {
      await db.execute(sql`SELECT 1`);
      return { 
        status: 'healthy', 
        database: 'connected',
        timestamp: new Date().toISOString()
      };
    } catch (error) {
      fastify.log.error('Database health check failed:', error);
      return reply.status(500).send({ 
        status: 'unhealthy', 
        database: 'disconnected', 
        error: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  });

  // Get position overview
  fastify.get('/api/pnl/position/:id', async (request, reply) => {
    try {
      const { id } = request.params as { id: string };
      
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
      
      const result = await db.execute(sql.raw(query, [id]));
      
      if (result.rows.length === 0) {
        return reply.status(404).send({ error: 'Position not found' });
      }
      
      const position = result.rows[0];
      
      return {
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
      };
      
    } catch (error) {
      fastify.log.error('Error fetching position:', error);
      return reply.status(500).send({ error: error instanceof Error ? error.message : 'Unknown error' });
    }
  });

  // Get position segments
  fastify.get('/api/pnl/position/:id/segments', async (request, reply) => {
    try {
      const { id } = request.params as { id: string };
      
      const segments = await db.query.positionSegments.findMany({
        where: eq(schema.positionSegments.positionId, id),
        orderBy: [schema.positionSegments.segmentNumber]
      });
      
      const formattedSegments = segments.map(segment => ({
        id: segment.id,
        segmentNumber: segment.segmentNumber,
        startTimestamp: segment.startTimestamp,
        endTimestamp: segment.endTimestamp,
        initialValueUSD: formatDecimal(segment.initialValueUsd),
        finalValueUSD: formatDecimal(segment.finalValueUsd),
        realizedPnlUSD: formatDecimal(segment.realizedPnlUsd),
        realizedPnlPercentage: formatDecimal(segment.realizedPnlPercentage),
        feesClaimedUSD: formatDecimal(segment.feesClaimedUsd),
        closureReason: segment.closureReason,
        createdAt: segment.createdAt
      }));
      
      return formattedSegments;
      
    } catch (error) {
      fastify.log.error('Error fetching segments:', error);
      return reply.status(500).send({ error: error instanceof Error ? error.message : 'Unknown error' });
    }
  });

  // Get claim history
  fastify.get('/api/pnl/position/:id/claims', async (request, reply) => {
    try {
      const { id } = request.params as { id: string };
      
      const claims = await db.query.claimHistory.findMany({
        where: eq(schema.claimHistory.positionId, id),
        orderBy: [desc(schema.claimHistory.createdAt)]
      });
      
      const formattedClaims = claims.map(claim => ({
        id: claim.id,
        claimType: claim.claimType,
        claimedTokenXAmount: formatDecimal(claim.claimedTokenXAmount),
        claimedTokenYAmount: formatDecimal(claim.claimedTokenYAmount),
        claimedUSDValue: formatDecimal(claim.claimedUsdValue),
        tokenXPriceUSD: formatDecimal(claim.tokenXPriceUsd),
        tokenYPriceUSD: formatDecimal(claim.tokenYPriceUsd),
        solReceived: formatDecimal(claim.solReceived),
        solPriceUSD: formatDecimal(claim.solPriceUsd),
        transactionSignature: claim.transactionSignature,
        isDuringRebalance: claim.isDuringRebalance,
        notes: claim.notes,
        createdAt: claim.createdAt
      }));
      
      return formattedClaims;
      
    } catch (error) {
      fastify.log.error('Error fetching claims:', error);
      return reply.status(500).send({ error: error instanceof Error ? error.message : 'Unknown error' });
    }
  });

  // Get rebalance history
  fastify.get('/api/pnl/position/:id/rebalances', async (request, reply) => {
    try {
      const { id } = request.params as { id: string };
      
      const rebalances = await db.query.rebalanceEvents.findMany({
        where: eq(schema.rebalanceEvents.positionId, id),
        orderBy: [desc(schema.rebalanceEvents.createdAt)]
      });
      
      const formattedRebalances = rebalances.map(rebalance => ({
        id: rebalance.id,
        triggerReason: rebalance.triggerReason,
        oldPositionAddress: rebalance.oldPositionAddress,
        newPositionAddress: rebalance.newPositionAddress,
        segmentInitialUSD: formatDecimal(rebalance.segmentInitialUsd),
        segmentFinalUSD: formatDecimal(rebalance.segmentFinalUsd),
        segmentPnlUSD: formatDecimal(rebalance.segmentPnlUsd),
        segmentPnlPercentage: formatDecimal(rebalance.segmentPnlPercentage),
        feesCollectedUSD: formatDecimal(rebalance.feesCollectedUsd),
        newSegmentInitialUSD: formatDecimal(rebalance.newSegmentInitialUsd),
        totalGasCostSOL: formatDecimal(rebalance.totalGasCostSol),
        slippageCostUSD: formatDecimal(rebalance.slippageCostUsd),
        closeTransactionSignature: rebalance.closeTransactionSignature,
        createTransactionSignature: rebalance.createTransactionSignature,
        notes: rebalance.notes,
        createdAt: rebalance.createdAt
      }));
      
      return formattedRebalances;
      
    } catch (error) {
      fastify.log.error('Error fetching rebalances:', error);
      return reply.status(500).send({ error: error instanceof Error ? error.message : 'Unknown error' });
    }
  });

  // Get recent snapshots
  fastify.get('/api/pnl/position/:id/snapshots', async (request, reply) => {
    try {
      const { id } = request.params as { id: string };
      const limit = parseInt((request.query as any).limit) || 10;
      
      const snapshots = await db.query.positionSnapshots.findMany({
        where: eq(schema.positionSnapshots.positionId, id),
        orderBy: [desc(schema.positionSnapshots.createdAt)],
        limit
      });
      
      const formattedSnapshots = snapshots.map(snapshot => ({
        id: snapshot.id,
        snapshotType: snapshot.snapshotType,
        currentValueUSD: formatDecimal(snapshot.currentValueUsd),
        tokenXAmount: formatDecimal(snapshot.tokenXAmount),
        tokenYAmount: formatDecimal(snapshot.tokenYAmount),
        unclaimedFeesX: formatDecimal(snapshot.unclaimedFeesX),
        unclaimedFeesY: formatDecimal(snapshot.unclaimedFeesY),
        unclaimedFeesUSD: formatDecimal(snapshot.unclaimedFeesUsd),
        unrealizedPnlUSD: formatDecimal(snapshot.unrealizedPnlUsd),
        unrealizedPnlPercentage: formatDecimal(snapshot.unrealizedPnlPercentage),
        totalPnlUSD: formatDecimal(snapshot.totalPnlUsd),
        totalPnlPercentage: formatDecimal(snapshot.totalPnlPercentage),
        tokenXPriceUSD: formatDecimal(snapshot.tokenXPriceUsd),
        tokenYPriceUSD: formatDecimal(snapshot.tokenYPriceUsd),
        solPriceUSD: formatDecimal(snapshot.solPriceUsd),
        createdAt: snapshot.createdAt
      }));
      
      return formattedSnapshots;
      
    } catch (error) {
      fastify.log.error('Error fetching snapshots:', error);
      return reply.status(500).send({ error: error instanceof Error ? error.message : 'Unknown error' });
    }
  });

  // Comprehensive PnL verification
  fastify.get('/api/pnl/position/:id/verification', async (request, reply) => {
    try {
      const { id } = request.params as { id: string };
      
      // Get all data needed for PnL calculation
      const [positionResult, segmentsResult, claimsResult, rebalancesResult] = await Promise.all([
        db.query.positions.findFirst({
          where: eq(schema.positions.id, id)
        }),
        db.query.positionSegments.findMany({
          where: eq(schema.positionSegments.positionId, id),
          orderBy: [schema.positionSegments.segmentNumber]
        }),
        db.query.claimHistory.findMany({
          where: eq(schema.claimHistory.positionId, id),
          orderBy: [desc(schema.claimHistory.createdAt)]
        }),
        db.query.rebalanceEvents.findMany({
          where: eq(schema.rebalanceEvents.positionId, id),
          orderBy: [desc(schema.rebalanceEvents.createdAt)]
        })
      ]);
      
      if (!positionResult) {
        return reply.status(404).send({ error: 'Position not found' });
      }
      
      const position = positionResult;
      const segments = segmentsResult;
      const claims = claimsResult;
      const rebalances = rebalancesResult;
      
      // Get current position value from latest snapshot
      const snapshotResult = await db.query.positionSnapshots.findFirst({
        where: eq(schema.positionSnapshots.positionId, id),
        orderBy: [desc(schema.positionSnapshots.createdAt)]
      });
      
      const currentValueUSD = formatDecimal(snapshotResult?.currentValueUsd) || formatDecimal(position.currentSegmentInitialUsd);
      
      // PnL Calculation according to documented formula
      const initialValueUSD = formatDecimal(position.initialValueUsd);
      const currentSegmentInitialUSD = formatDecimal(position.currentSegmentInitialUsd);
      const totalRealizedPnlUSD = formatDecimal(position.totalRealizedPnlUsd);
      const totalFeesClaimedUSD = formatDecimal(position.totalFeesClaimedUsd);
      
      // Calculate components
      const unrealizedPnlUSD = currentValueUSD - currentSegmentInitialUSD;
      const totalPnlUSD = unrealizedPnlUSD + totalRealizedPnlUSD + totalFeesClaimedUSD;
      const totalPnlPercentage = initialValueUSD > 0 ? (totalPnlUSD / initialValueUSD) * 100 : 0;
      
      // Verification calculations
      const closedSegmentsPnL = segments
        .filter(s => s.realizedPnlUsd)
        .reduce((sum, s) => sum + formatDecimal(s.realizedPnlUsd), 0);
      
      const totalFeesFromClaims = claims
        .reduce((sum, c) => sum + formatDecimal(c.claimedUsdValue), 0);
      
      const totalFeesFromRebalances = rebalances
        .reduce((sum, r) => sum + formatDecimal(r.feesCollectedUsd), 0);
      
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
      
      return verification;
      
    } catch (error) {
      fastify.log.error('Error in PnL verification:', error);
      return reply.status(500).send({ error: error instanceof Error ? error.message : 'Unknown error' });
    }
  });

  // Serve the HTML verification tool
  fastify.get('/pnl-verification', async (request, reply) => {
    const htmlContent = `
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Position PnL Verification Tool</title>
    <script src="https://cdn.jsdelivr.net/npm/chart.js"></script>
    <style>
        * { margin: 0; padding: 0; box-sizing: border-box; }
        body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background: #f5f5f5; color: #333; }
        .container { max-width: 1400px; margin: 0 auto; padding: 20px; }
        .header { background: white; padding: 20px; border-radius: 12px; box-shadow: 0 2px 10px rgba(0,0,0,0.1); margin-bottom: 20px; }
        .input-section { display: flex; gap: 10px; align-items: center; margin-bottom: 20px; }
        .input-section input { flex: 1; padding: 12px; border: 2px solid #e0e0e0; border-radius: 8px; font-size: 16px; }
        .input-section button { padding: 12px 24px; background: #007bff; color: white; border: none; border-radius: 8px; cursor: pointer; font-size: 16px; }
        .input-section button:hover { background: #0056b3; }
        .card { background: white; padding: 20px; border-radius: 12px; box-shadow: 0 2px 10px rgba(0,0,0,0.1); margin-bottom: 20px; }
        .card h2 { margin-bottom: 15px; color: #333; border-bottom: 2px solid #007bff; padding-bottom: 10px; }
        .metric { display: flex; justify-content: space-between; padding: 10px 0; border-bottom: 1px solid #f0f0f0; }
        .metric:last-child { border-bottom: none; }
        .metric-label { font-weight: 500; color: #666; }
        .metric-value { font-weight: 600; font-size: 18px; }
        .positive { color: #28a745; }
        .negative { color: #dc3545; }
        .neutral { color: #6c757d; }
        .history-table { width: 100%; border-collapse: collapse; margin-top: 15px; }
        .history-table th, .history-table td { padding: 12px; text-align: left; border-bottom: 1px solid #e0e0e0; }
        .history-table th { background: #f8f9fa; font-weight: 600; }
        .calculation-step { background: #f8f9fa; padding: 15px; border-radius: 8px; margin: 10px 0; border-left: 4px solid #007bff; }
        .formula { font-family: 'Courier New', monospace; background: #f0f0f0; padding: 10px; border-radius: 4px; margin: 10px 0; }
        .chart-container { position: relative; height: 300px; margin: 20px 0; }
        .error { background: #f8d7da; color: #721c24; padding: 15px; border-radius: 8px; margin: 10px 0; }
        .info { background: #d1ecf1; color: #0c5460; padding: 15px; border-radius: 8px; margin: 10px 0; }
        .loading { text-align: center; padding: 40px; font-size: 18px; color: #666; }
        .hidden { display: none; }
        .badge { padding: 4px 8px; border-radius: 4px; font-size: 12px; font-weight: 600; }
        .badge-success { background: #d4edda; color: #155724; }
        .badge-warning { background: #fff3cd; color: #856404; }
        .badge-danger { background: #f8d7da; color: #721c24; }
        .verification-section { background: #e7f3ff; border: 2px solid #0056b3; border-radius: 8px; padding: 15px; margin: 20px 0; }
        .check-item { display: flex; justify-content: space-between; align-items: center; padding: 10px 0; border-bottom: 1px solid #dee2e6; }
        .check-item:last-child { border-bottom: none; }
        .check-status { font-weight: 600; font-size: 18px; }
        .check-pass { color: #28a745; }
        .check-fail { color: #dc3545; }
    </style>
</head>
<body>
    <div class="container">
        <div class="header">
            <h1>🔍 Position PnL Verification Tool</h1>
            <p>Enter a position ID to analyze and verify PnL calculations</p>
            
            <div class="input-section">
                <input type="text" id="positionId" placeholder="Enter Position ID (UUID)">
                <button onclick="analyzePosition()">Analyze Position</button>
                <button onclick="clearResults()">Clear</button>
            </div>
            
            <div id="statusSection" class="info hidden"></div>
        </div>

        <div id="loadingSection" class="loading hidden">
            Analyzing position... Please wait.
        </div>

        <div id="errorSection" class="error hidden"></div>

        <div id="resultsSection" class="hidden">
            <!-- Position Overview -->
            <div class="card">
                <h2>📊 Position Overview</h2>
                <div id="positionOverview"></div>
            </div>

            <!-- PnL Verification -->
            <div class="card">
                <h2>✅ PnL Verification Results</h2>
                <div id="pnlVerification"></div>
            </div>

            <!-- PnL Breakdown -->
            <div class="card">
                <h2>💰 PnL Calculation Breakdown</h2>
                <div id="pnlBreakdown"></div>
                <div class="chart-container">
                    <canvas id="pnlChart"></canvas>
                </div>
            </div>

            <!-- Current PnL -->
            <div class="card">
                <h2>📈 Current PnL Status</h2>
                <div id="currentPnl"></div>
            </div>

            <!-- Segments History -->
            <div class="card">
                <h2>🔄 Position Segments History</h2>
                <div id="segmentsHistory"></div>
            </div>

            <!-- Claim History -->
            <div class="card">
                <h2>💸 Fee Claim History</h2>
                <div id="claimHistory"></div>
            </div>

            <!-- Rebalance History -->
            <div class="card">
                <h2>⚖️ Rebalance History</h2>
                <div id="rebalanceHistory"></div>
            </div>

            <!-- Recent Snapshots -->
            <div class="card">
                <h2>📸 Recent Snapshots</h2>
                <div id="snapshotsHistory"></div>
            </div>
        </div>
    </div>

    <script>
        let currentPosition = null;
        const API_BASE = window.location.origin;

        // Check database connection
        document.addEventListener('DOMContentLoaded', function() {
            checkDatabaseConnection();
        });

        async function checkDatabaseConnection() {
            try {
                const response = await fetch(\`\${API_BASE}/api/pnl/health\`);
                const result = await response.json();
                
                if (result.status === 'healthy') {
                    showStatus('✅ Database connected successfully', 'success');
                } else {
                    showStatus('❌ Database connection failed', 'error');
                }
            } catch (error) {
                showStatus('❌ Cannot connect to PnL verification API', 'error');
            }
        }

        // Main analysis function
        window.analyzePosition = async function() {
            const positionId = document.getElementById('positionId').value.trim();
            if (!positionId) {
                showError('Please enter a Position ID');
                return;
            }

            showLoading(true);
            hideError();

            try {
                // Fetch all data from API
                const [position, segments, claims, rebalances, snapshots, verification] = await Promise.all([
                    fetchWithErrorHandling(\`\${API_BASE}/api/pnl/position/\${positionId}\`),
                    fetchWithErrorHandling(\`\${API_BASE}/api/pnl/position/\${positionId}/segments\`),
                    fetchWithErrorHandling(\`\${API_BASE}/api/pnl/position/\${positionId}/claims\`),
                    fetchWithErrorHandling(\`\${API_BASE}/api/pnl/position/\${positionId}/rebalances\`),
                    fetchWithErrorHandling(\`\${API_BASE}/api/pnl/position/\${positionId}/snapshots\`),
                    fetchWithErrorHandling(\`\${API_BASE}/api/pnl/position/\${positionId}/verification\`)
                ]);

                currentPosition = position;
                
                displayPositionOverview(position);
                displayPnlVerification(verification);
                displayPnlBreakdown(position, segments);
                displayCurrentPnl(position, segments);
                displaySegmentsHistory(segments);
                displayClaimHistory(claims);
                displayRebalanceHistory(rebalances);
                displaySnapshotsHistory(snapshots);
                
                document.getElementById('resultsSection').classList.remove('hidden');
            } catch (error) {
                if (error.message?.includes('404')) {
                    showError('Position not found. Please check the Position ID.');
                } else {
                    showError(\`Analysis failed: \${error.message}\`);
                }
            } finally {
                showLoading(false);
            }
        };

        // Helper function for fetch with error handling
        async function fetchWithErrorHandling(url) {
            const response = await fetch(url);
            if (!response.ok) {
                throw new Error(\`HTTP \${response.status}: \${response.statusText}\`);
            }
            return response.json();
        }

        // Display functions (simplified for space)
        function displayPositionOverview(position) {
            const html = \`
                <div class="metric">
                    <span class="metric-label">Position ID:</span>
                    <span class="metric-value">\${position.id.substring(0, 8)}...</span>
                </div>
                <div class="metric">
                    <span class="metric-label">Pool:</span>
                    <span class="metric-value">\${position.tokenX?.symbol || 'TokenX'}-\${position.tokenY?.symbol || 'TokenY'}</span>
                </div>
                <div class="metric">
                    <span class="metric-label">DEX:</span>
                    <span class="metric-value">\${position.dex?.toUpperCase() || 'Unknown'}</span>
                </div>
                <div class="metric">
                    <span class="metric-label">Status:</span>
                    <span class="metric-value">
                        <span class="badge badge-\${position.status === 'ACTIVE' ? 'success' : 'warning'}">
                            \${position.status || 'Unknown'}
                        </span>
                    </span>
                </div>
                <div class="metric">
                    <span class="metric-label">Created:</span>
                    <span class="metric-value">\${position.createdAt ? new Date(position.createdAt).toLocaleDateString() : 'N/A'}</span>
                </div>
            \`;
            document.getElementById('positionOverview').innerHTML = html;
        }

        function displayPnlVerification(verification) {
            if (!verification || !verification.consistencyChecks) {
                document.getElementById('pnlVerification').innerHTML = '<p>Verification data not available</p>';
                return;
            }

            const checks = verification.consistencyChecks;
            const html = \`
                <div class="verification-section">
                    <h3>🔍 Consistency Checks</h3>
                    <div class="check-item">
                        <span>Realized PnL matches closed segments:</span>
                        <span class="check-status \${checks.realizedPnLMatches ? 'check-pass' : 'check-fail'}">
                            \${checks.realizedPnLMatches ? '✅ PASS' : '❌ FAIL'}
                        </span>
                    </div>
                    <div class="check-item">
                        <span>Fees claimed matches records:</span>
                        <span class="check-status \${checks.feesClaimedMatches ? 'check-pass' : 'check-fail'}">
                            \${checks.feesClaimedMatches ? '✅ PASS' : '❌ FAIL'}
                        </span>
                    </div>
                    <div class="check-item">
                        <span>Total PnL calculation consistent:</span>
                        <span class="check-status \${checks.totalPnLMatches ? 'check-pass' : 'check-fail'}">
                            \${checks.totalPnLMatches ? '✅ PASS' : '❌ FAIL'}
                        </span>
                    </div>
                </div>

                <div class="calculation-step">
                    <h4>📊 Independent Verification</h4>
                    <div class="formula">
                        Documented Total PnL: $\${verification.documentedCalculation?.totalPnlUSD?.toFixed(2) || '0.00'}
                    </div>
                    <div class="formula">
                        Verified Total PnL: $\${verification.independentVerification?.verifiedTotalPnl?.toFixed(2) || '0.00'}
                    </div>
                    <div class="formula">
                        Difference: $\${Math.abs((verification.documentedCalculation?.totalPnlUSD || 0) - (verification.independentVerification?.verifiedTotalPnl || 0)).toFixed(2)}
                    </div>
                </div>
            \`;
            document.getElementById('pnlVerification').innerHTML = html;
        }

        function displayPnlBreakdown(position, segments) {
            const currentValueUSD = position.currentValueUSD || 0;
            const currentSegmentInitialUSD = position.currentSegmentInitialUSD || 0;
            const totalRealizedPnlUSD = position.totalRealizedPnlUSD || 0;
            const totalFeesClaimedUSD = position.totalFeesClaimedUSD || 0;
            const initialValueUSD = position.initialValueUSD || 0;

            const unrealizedPnl = currentValueUSD - currentSegmentInitialUSD;
            const totalPnl = unrealizedPnl + totalRealizedPnlUSD + totalFeesClaimedUSD;
            const totalPnlPercentage = initialValueUSD > 0 ? (totalPnl / initialValueUSD) * 100 : 0;

            const html = \`
                <div class="calculation-step">
                    <strong>PnL Formula:</strong>
                    <div class="formula">
                        Total PnL = Unrealized PnL + Realized PnL + Total Fees Claimed
                    </div>
                    <div class="formula">
                        Total PnL = (\${currentValueUSD.toFixed(2)} - \${currentSegmentInitialUSD.toFixed(2)}) + \${totalRealizedPnlUSD.toFixed(2)} + \${totalFeesClaimedUSD.toFixed(2)}
                    </div>
                    <div class="formula">
                        Total PnL = \${unrealizedPnl.toFixed(2)} + \${totalRealizedPnlUSD.toFixed(2)} + \${totalFeesClaimedUSD.toFixed(2)} = \${totalPnl.toFixed(2)}
                    </div>
                </div>

                <div class="metric">
                    <span class="metric-label">Initial Investment:</span>
                    <span class="metric-value">$\${initialValueUSD.toFixed(2)}</span>
                </div>
                <div class="metric">
                    <span class="metric-label">Current Value:</span>
                    <span class="metric-value">$\${currentValueUSD.toFixed(2)}</span>
                </div>
                <div class="metric">
                    <span class="metric-label">Unrealized PnL:</span>
                    <span class="metric-value \${unrealizedPnl >= 0 ? 'positive' : 'negative'}">
                        $\${unrealizedPnl.toFixed(2)}
                    </span>
                </div>
                <div class="metric">
                    <span class="metric-label">Realized PnL (Closed Segments):</span>
                    <span class="metric-value \${totalRealizedPnlUSD >= 0 ? 'positive' : 'negative'}">
                        $\${totalRealizedPnlUSD.toFixed(2)}
                    </span>
                </div>
                <div class="metric">
                    <span class="metric-label">Total Fees Claimed:</span>
                    <span class="metric-value positive">$\${totalFeesClaimedUSD.toFixed(2)}</span>
                </div>
                <div class="metric" style="border-top: 2px solid #007bff; padding-top: 15px;">
                    <span class="metric-label"><strong>Total PnL:</strong></span>
                    <span class="metric-value \${totalPnl >= 0 ? 'positive' : 'negative'}">
                        <strong>$\${totalPnl.toFixed(2)} (\${totalPnlPercentage.toFixed(2)}%)</strong>
                    </span>
                </div>
            \`;
            document.getElementById('pnlBreakdown').innerHTML = html;

            // Create PnL chart
            createPnlChart(unrealizedPnl, totalRealizedPnlUSD, totalFeesClaimedUSD);
        }

        function createPnlChart(unrealized, realized, fees) {
            const ctx = document.getElementById('pnlChart').getContext('2d');
            new Chart(ctx, {
                type: 'doughnut',
                data: {
                    labels: ['Unrealized PnL', 'Realized PnL', 'Fees Claimed'],
                    datasets: [{
                        data: [unrealized, realized, fees],
                        backgroundColor: [
                            unrealized >= 0 ? '#28a745' : '#dc3545',
                            realized >= 0 ? '#17a2b8' : '#dc3545',
                            '#ffc107'
                        ],
                        borderWidth: 2,
                        borderColor: '#fff'
                    }]
                },
                options: {
                    responsive: true,
                    maintainAspectRatio: false,
                    plugins: {
                        legend: { position: 'bottom' },
                        tooltip: {
                            callbacks: {
                                label: function(context) {
                                    return context.label + ': $' + context.parsed.toFixed(2);
                                }
                            }
                        }
                    }
                }
            });
        }

        // Utility functions
        function showLoading(show) {
            document.getElementById('loadingSection').classList.toggle('hidden', !show);
        }

        function showError(message) {
            const errorSection = document.getElementById('errorSection');
            errorSection.textContent = message;
            errorSection.className = 'error';
            errorSection.classList.remove('hidden');
        }

        function hideError() {
            document.getElementById('errorSection').classList.add('hidden');
        }

        function showStatus(message, type) {
            const statusSection = document.getElementById('statusSection');
            statusSection.textContent = message;
            statusSection.className = '\${type} hidden';
            statusSection.classList.remove('hidden');
        }

        window.clearResults = function() {
            document.getElementById('positionId').value = '';
            document.getElementById('resultsSection').classList.add('hidden');
            hideError();
            currentPosition = null;
        };
    </script>
</body>
</html>`;
    
    reply.type('text/html');
    return htmlContent;
  });

  fastify.log.info('✅ PnL verification routes registered');
}
