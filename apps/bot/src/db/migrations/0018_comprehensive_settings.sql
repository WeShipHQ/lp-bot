-- Add comprehensive settings to users table
-- Rebalancing settings
ALTER TABLE "users" ADD COLUMN "rebalance_schedule" text NOT NULL DEFAULT '15m';

-- Position configuration
ALTER TABLE "users" ADD COLUMN "default_bin_range" integer NOT NULL DEFAULT 10;

-- Risk management settings
ALTER TABLE "users" ADD COLUMN "stop_loss_percentage" decimal(5, 2) DEFAULT 25.00;
ALTER TABLE "users" ADD COLUMN "take_profit_percentage" decimal(5, 2) DEFAULT 25.00;

-- Trading settings
ALTER TABLE "users" ADD COLUMN "auto_convert_to_sol" boolean NOT NULL DEFAULT true;
ALTER TABLE "users" ADD COLUMN "slippage_percentage" decimal(5, 2) NOT NULL DEFAULT 3.00;

-- Update default rebalance threshold from 5.00 to 20.00
ALTER TABLE "users" ALTER COLUMN "rebalance_threshold" SET DEFAULT 20.00;