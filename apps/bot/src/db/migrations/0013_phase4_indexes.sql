-- Phase 4: Add missing indexes for performance

-- Positions indexes
CREATE INDEX IF NOT EXISTS idx_position_user_status ON "Position" ("userId", "status");
CREATE INDEX IF NOT EXISTS idx_position_address ON "Position" ("positionAddress");
CREATE INDEX IF NOT EXISTS idx_position_pool_dex ON "Position" ("poolAddress", "dex");
CREATE INDEX IF NOT EXISTS idx_position_created_at ON "Position" ("createdAt");

-- Users indexes (note: unique constraints may already exist)
CREATE INDEX IF NOT EXISTS idx_user_telegram_id ON "User" ("telegramId");
CREATE INDEX IF NOT EXISTS idx_user_wallet_address ON "User" ("walletAddress");

-- PositionSnapshot indexes
CREATE INDEX IF NOT EXISTS idx_positionsnapshot_pos_time ON "PositionSnapshot" ("positionId", "snapshotTimestamp");

-- PendingTransaction indexes
CREATE INDEX IF NOT EXISTS idx_pendingtx_status_created ON "PendingTransaction" ("status", "createdAt");
