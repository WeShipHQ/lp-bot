/**
 * PnL Verification API Routes
 *
 * These routes provide endpoints for analyzing and verifying position PnL calculations.
 * Integrate these routes into your existing Fastify server setup.
 */

import { FastifyInstance } from "fastify";
import { db } from "@/db";
import { eq, sql, desc, and } from "drizzle-orm";
import * as schema from "@/db/schema";
import { readFileSync } from "fs";
import { join } from "path";

// Helper function to format decimal values
function formatDecimal(value: any): number {
  return value ? parseFloat(value) : 0;
}

// Helper function to format UUID
function formatUUID(uuid: string): string {
  return uuid ? uuid.substring(0, 8) + "..." : "N/A";
}

export async function registerPnlVerificationRoutes(fastify: FastifyInstance) {
  // Health check endpoint
  fastify.get("/api/pnl/health", async (request, reply) => {
    try {
      await db.execute(sql`SELECT 1`);
      return {
        status: "healthy",
        database: "connected",
        timestamp: new Date().toISOString(),
      };
    } catch (error) {
      fastify.log.error("Database health check failed:", error);
      return reply.status(500).send({
        status: "unhealthy",
        database: "disconnected",
        error: error instanceof Error ? error.message : "Unknown error",
      });
    }
  });

  // Get position overview
  fastify.get("/api/pnl/position/:id", async (request, reply) => {
    try {
      const { id } = request.params as { id: string };

      // Get position data using Drizzle ORM
      const position = await db.query.positions.findFirst({
        where: eq(schema.positions.id, id),
      });

      if (!position) {
        return reply.status(404).send({ error: "Position not found" });
      }

      // Get current position value from latest snapshot
      const latestSnapshot = await db.query.positionSnapshots.findFirst({
        where: eq(schema.positionSnapshots.positionId, id),
        orderBy: [desc(schema.positionSnapshots.createdAt)],
      });

      const currentValueUSD =
        latestSnapshot?.currentValueUSD || position.currentSegmentInitialUSD;

      return {
        id: position.id,
        positionAddress: position.positionAddress,
        poolAddress: position.poolAddress,
        dex: position.dex,
        status: position.status,
        initialValueUSD: formatDecimal(position.initialValueUSD),
        currentValueUSD: formatDecimal(currentValueUSD),
        currentSegmentInitialUSD: formatDecimal(
          position.currentSegmentInitialUSD
        ),
        totalRealizedPnlUSD: formatDecimal(position.totalRealizedPnlUSD),
        totalFeesClaimedUSD: formatDecimal(position.totalFeesClaimedUSD),
        createdAt: position.createdAt,
        tokenX: position.tokenX,
        tokenY: position.tokenY,
      };
    } catch (error) {
      // fastify.log.error("Error fetching position:", error);
      return reply.status(500).send({
        error: error instanceof Error ? error.message : "Unknown error",
      });
    }
  });

  // Get position segments
  fastify.get("/api/pnl/position/:id/segments", async (request, reply) => {
    try {
      const { id } = request.params as { id: string };

      const segments = await db.query.positionSegments.findMany({
        where: eq(schema.positionSegments.positionId, id),
        orderBy: [schema.positionSegments.segmentNumber],
      });

      const formattedSegments = segments.map((segment) => ({
        id: segment.id,
        segmentNumber: segment.segmentNumber,
        startTimestamp: segment.startTimestamp,
        endTimestamp: segment.endTimestamp,
        initialValueUSD: formatDecimal(segment.initialValueUSD),
        finalValueUSD: formatDecimal(segment.finalValueUSD),
        realizedPnlUSD: formatDecimal(segment.realizedPnlUSD),
        realizedPnlPercentage: formatDecimal(segment.realizedPnlPercentage),
        feesClaimedUSD: formatDecimal(segment.feesClaimedUSD),
        closureReason: segment.closureReason,
        createdAt: segment.createdAt,
      }));

      return formattedSegments;
    } catch (error) {
      fastify.log.error("Error fetching segments:", error);
      return reply.status(500).send({
        error: error instanceof Error ? error.message : "Unknown error",
      });
    }
  });

  // Get claim history
  fastify.get("/api/pnl/position/:id/claims", async (request, reply) => {
    try {
      const { id } = request.params as { id: string };

      const claims = await db.query.claimHistory.findMany({
        where: eq(schema.claimHistory.positionId, id),
        orderBy: [desc(schema.claimHistory.createdAt)],
      });

      const formattedClaims = claims.map((claim) => ({
        id: claim.id,
        claimType: claim.claimType,
        claimedTokenXAmount: formatDecimal(claim.claimedTokenXAmount),
        claimedTokenYAmount: formatDecimal(claim.claimedTokenYAmount),
        claimedUSDValue: formatDecimal(claim.claimedUSDValue),
        tokenXPriceUSD: formatDecimal(claim.tokenXPriceUSD),
        tokenYPriceUSD: formatDecimal(claim.tokenYPriceUSD),
        solReceived: formatDecimal(claim.solReceived),
        solPriceUSD: formatDecimal(claim.solPriceUSD),
        transactionSignature: claim.transactionSignature,
        isDuringRebalance: claim.isDuringRebalance,
        notes: claim.notes,
        createdAt: claim.createdAt,
      }));

      return formattedClaims;
    } catch (error) {
      fastify.log.error("Error fetching claims:", error);
      return reply.status(500).send({
        error: error instanceof Error ? error.message : "Unknown error",
      });
    }
  });

  // Get rebalance history
  fastify.get("/api/pnl/position/:id/rebalances", async (request, reply) => {
    try {
      const { id } = request.params as { id: string };

      const rebalances = await db.query.rebalanceEvents.findMany({
        where: eq(schema.rebalanceEvents.positionId, id),
        orderBy: [desc(schema.rebalanceEvents.createdAt)],
      });

      const formattedRebalances = rebalances.map((rebalance) => ({
        id: rebalance.id,
        triggerReason: rebalance.triggerReason,
        oldPositionAddress: rebalance.oldPositionAddress,
        newPositionAddress: rebalance.newPositionAddress,
        segmentInitialUSD: formatDecimal(rebalance.segmentInitialUSD),
        segmentFinalUSD: formatDecimal(rebalance.segmentFinalUSD),
        segmentPnlUSD: formatDecimal(rebalance.segmentPnlUSD),
        segmentPnlPercentage: formatDecimal(rebalance.segmentPnlPercentage),
        feesCollectedUSD: formatDecimal(rebalance.feesCollectedUSD),
        newSegmentInitialUSD: formatDecimal(rebalance.newSegmentInitialUSD),
        totalGasCostSOL: formatDecimal(rebalance.totalGasCostSOL),
        slippageCostUSD: formatDecimal(rebalance.slippageCostUSD),
        closeTransactionSignature: rebalance.closeTransactionSignature,
        createTransactionSignature: rebalance.createTransactionSignature,
        notes: rebalance.notes,
        createdAt: rebalance.createdAt,
      }));

      return formattedRebalances;
    } catch (error) {
      fastify.log.error("Error fetching rebalances:", error);
      return reply.status(500).send({
        error: error instanceof Error ? error.message : "Unknown error",
      });
    }
  });

  // Get recent snapshots
  fastify.get("/api/pnl/position/:id/snapshots", async (request, reply) => {
    try {
      const { id } = request.params as { id: string };
      const limit = parseInt((request.query as any).limit) || 10;

      const snapshots = await db.query.positionSnapshots.findMany({
        where: eq(schema.positionSnapshots.positionId, id),
        orderBy: [desc(schema.positionSnapshots.createdAt)],
        limit,
      });

      const formattedSnapshots = snapshots.map((snapshot) => ({
        id: snapshot.id,
        snapshotType: snapshot.snapshotType,
        currentValueUSD: formatDecimal(snapshot.currentValueUSD),
        tokenXAmount: formatDecimal(snapshot.tokenXAmount),
        tokenYAmount: formatDecimal(snapshot.tokenYAmount),
        unclaimedFeesX: formatDecimal(snapshot.unclaimedFeesX),
        unclaimedFeesY: formatDecimal(snapshot.unclaimedFeesY),
        unclaimedFeesUSD: formatDecimal(snapshot.unclaimedFeesUSD),
        unrealizedPnlUSD: formatDecimal(snapshot.unrealizedPnlUSD),
        unrealizedPnlPercentage: formatDecimal(
          snapshot.unrealizedPnlPercentage
        ),
        totalPnlUSD: formatDecimal(snapshot.totalPnlUSD),
        totalPnlPercentage: formatDecimal(snapshot.totalPnlPercentage),
        tokenXPriceUSD: formatDecimal(snapshot.tokenXPriceUSD),
        tokenYPriceUSD: formatDecimal(snapshot.tokenYPriceUSD),
        solPriceUSD: formatDecimal(snapshot.solPriceUSD),
        createdAt: snapshot.createdAt,
      }));

      return formattedSnapshots;
    } catch (error) {
      fastify.log.error("Error fetching snapshots:", error);
      return reply.status(500).send({
        error: error instanceof Error ? error.message : "Unknown error",
      });
    }
  });

  // Comprehensive PnL verification
  fastify.get("/api/pnl/position/:id/verification", async (request, reply) => {
    try {
      const { id } = request.params as { id: string };

      // Get all data needed for PnL calculation
      const [positionResult, segmentsResult, claimsResult, rebalancesResult] =
        await Promise.all([
          db.query.positions.findFirst({
            where: eq(schema.positions.id, id),
          }),
          db.query.positionSegments.findMany({
            where: eq(schema.positionSegments.positionId, id),
            orderBy: [schema.positionSegments.segmentNumber],
          }),
          db.query.claimHistory.findMany({
            where: eq(schema.claimHistory.positionId, id),
            orderBy: [desc(schema.claimHistory.createdAt)],
          }),
          db.query.rebalanceEvents.findMany({
            where: eq(schema.rebalanceEvents.positionId, id),
            orderBy: [desc(schema.rebalanceEvents.createdAt)],
          }),
        ]);

      if (!positionResult) {
        return reply.status(404).send({ error: "Position not found" });
      }

      const position = positionResult;
      const segments = segmentsResult;
      const claims = claimsResult;
      const rebalances = rebalancesResult;

      // Get current position value from latest snapshot
      const snapshotResult = await db.query.positionSnapshots.findFirst({
        where: eq(schema.positionSnapshots.positionId, id),
        orderBy: [desc(schema.positionSnapshots.createdAt)],
      });

      const currentValueUSD =
        formatDecimal(snapshotResult?.currentValueUSD) ||
        formatDecimal(position.currentSegmentInitialUSD);

      // PnL Calculation according to documented formula
      const initialValueUSD = formatDecimal(position.initialValueUSD);
      const currentSegmentInitialUSD = formatDecimal(
        position.currentSegmentInitialUSD
      );
      const totalRealizedPnlUSD = formatDecimal(position.totalRealizedPnlUSD);
      const totalFeesClaimedUSD = formatDecimal(position.totalFeesClaimedUSD);

      // Calculate components
      const unrealizedPnlUSD = currentValueUSD - currentSegmentInitialUSD;
      const totalPnlUSD =
        unrealizedPnlUSD + totalRealizedPnlUSD + totalFeesClaimedUSD;
      const totalPnlPercentage =
        initialValueUSD > 0 ? (totalPnlUSD / initialValueUSD) * 100 : 0;

      // Verification calculations
      const closedSegmentsPnL = segments
        .filter((s) => s.realizedPnlUSD)
        .reduce((sum, s) => sum + formatDecimal(s.realizedPnlUSD), 0);

      const totalFeesFromClaims = claims.reduce(
        (sum, c) => sum + formatDecimal(c.claimedUSDValue),
        0
      );

      const totalFeesFromRebalances = rebalances.reduce(
        (sum, r) => sum + formatDecimal(r.feesCollectedUSD),
        0
      );

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
          totalPnlPercentage,
        },

        // Independent verification
        independentVerification: {
          initialValueUSD,
          currentValueUSD,
          closedSegmentsPnL,
          totalFeesCalculated,
          verifiedTotalPnl:
            currentValueUSD -
            initialValueUSD +
            closedSegmentsPnL +
            totalFeesCalculated,
          totalFeesFromClaims,
          totalFeesFromRebalances,
        },

        // Consistency checks
        consistencyChecks: {
          realizedPnLMatches:
            Math.abs(totalRealizedPnlUSD - closedSegmentsPnL) < 0.01,
          feesClaimedMatches:
            Math.abs(totalFeesClaimedUSD - totalFeesCalculated) < 0.01,
          totalPnLMatches:
            Math.abs(
              totalPnlUSD -
                (currentValueUSD -
                  initialValueUSD +
                  closedSegmentsPnL +
                  totalFeesCalculated)
            ) < 0.01,
        },

        // Raw data for inspection
        rawData: {
          position,
          segments,
          claims,
          rebalances,
        },
      };

      return verification;
    } catch (error) {
      fastify.log.error("Error in PnL verification:", error);
      return reply.status(500).send({
        error: error instanceof Error ? error.message : "Unknown error",
      });
    }
  });

  // Serve the HTML verification tool
  fastify.get("/pnl-verification", async (request, reply) => {
    try {
      // Read HTML content from external file
      const { readFileSync } = await import("fs");
      const { join } = await import("path");
      console.log("process.cwd()", process.cwd());
      const htmlFilePath = join(
        process.cwd(),
        "../../",
        "pnl-verification-tool-updated.html"
      );
      const htmlContent = readFileSync(htmlFilePath, "utf-8");

      reply.type("text/html");
      return htmlContent;
    } catch (error) {
      fastify.log.error("Failed to read HTML file:", error);
      reply.code(500);
      return { error: "Failed to load verification tool" };
    }
  });

  fastify.log.info("✅ PnL verification routes registered");
}
