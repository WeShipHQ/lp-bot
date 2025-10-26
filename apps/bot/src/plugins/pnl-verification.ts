import { FastifyInstance } from "fastify";
import { registerPnlVerificationRoutes } from "@/routes/pnl-verification.routes";

export async function registerPnlVerificationPlugin(app: FastifyInstance) {
  // Register all PnL verification routes
  await registerPnlVerificationRoutes(app);
  
  app.log.info("✅ PnL verification plugin registered");
  
  // PnL verification routes registered:
  // GET /api/pnl/health - Database health check
  // GET /api/pnl/position/:id - Position overview
  // GET /api/pnl/position/:id/segments - Position segments
  // GET /api/pnl/position/:id/claims - Claim history
  // GET /api/pnl/position/:id/rebalances - Rebalance history
  // GET /api/pnl/position/:id/snapshots - Recent snapshots
  // GET /api/pnl/position/:id/verification - Comprehensive PnL verification
  // GET /pnl-verification - HTML verification tool
}
