ALTER TYPE "public"."ClaimType" RENAME TO "claim_type";--> statement-breakpoint
ALTER TYPE "public"."OperationType" RENAME TO "operation_type";--> statement-breakpoint
ALTER TYPE "public"."PendingTransactionStatus" RENAME TO "pending_transaction_status";--> statement-breakpoint
ALTER TYPE "public"."PointType" RENAME TO "point_type";--> statement-breakpoint
ALTER TYPE "public"."PositionStatus" RENAME TO "position_status";--> statement-breakpoint
ALTER TYPE "public"."RebalanceStrategy" RENAME TO "rebalance_strategy";--> statement-breakpoint
ALTER TYPE "public"."SnapshotType" RENAME TO "snapshot_type";--> statement-breakpoint
ALTER TYPE "public"."StrategyType" RENAME TO "strategy_type";--> statement-breakpoint
ALTER TYPE "public"."TransactionStatus" RENAME TO "transaction_status";--> statement-breakpoint
ALTER TYPE "public"."TransactionType" RENAME TO "transaction_type";--> statement-breakpoint
ALTER TABLE "ClaimHistory" RENAME TO "claim_history";--> statement-breakpoint
ALTER TABLE "PendingTransaction" RENAME TO "pending_transactions";--> statement-breakpoint
ALTER TABLE "Points" RENAME TO "points";--> statement-breakpoint
ALTER TABLE "Position" RENAME TO "positions";--> statement-breakpoint
ALTER TABLE "Transaction" RENAME TO "transactions";--> statement-breakpoint
ALTER TABLE "User" RENAME TO "users";--> statement-breakpoint
ALTER TABLE "Wallet" RENAME TO "wallets";--> statement-breakpoint
ALTER TABLE "claim_history" RENAME COLUMN "positionId" TO "position_id";--> statement-breakpoint
ALTER TABLE "claim_history" RENAME COLUMN "segmentId" TO "segment_id";--> statement-breakpoint
ALTER TABLE "claim_history" RENAME COLUMN "claimType" TO "claim_type";--> statement-breakpoint
ALTER TABLE "claim_history" RENAME COLUMN "claimedTokenXAmount" TO "claimed_token_x_amount";--> statement-breakpoint
ALTER TABLE "claim_history" RENAME COLUMN "claimedTokenYAmount" TO "claimed_token_y_amount";--> statement-breakpoint
ALTER TABLE "claim_history" RENAME COLUMN "claimedRewardsOther" TO "claimed_rewards_other";--> statement-breakpoint
ALTER TABLE "claim_history" RENAME COLUMN "claimedUSDValue" TO "claimed_usd_value";--> statement-breakpoint
ALTER TABLE "claim_history" RENAME COLUMN "tokenXPriceUSD" TO "token_x_price_usd";--> statement-breakpoint
ALTER TABLE "claim_history" RENAME COLUMN "tokenYPriceUSD" TO "token_y_price_usd";--> statement-breakpoint
ALTER TABLE "claim_history" RENAME COLUMN "solReceived" TO "sol_received";--> statement-breakpoint
ALTER TABLE "claim_history" RENAME COLUMN "solPriceUSD" TO "sol_price_usd";--> statement-breakpoint
ALTER TABLE "claim_history" RENAME COLUMN "transactionSignature" TO "transaction_signature";--> statement-breakpoint
ALTER TABLE "claim_history" RENAME COLUMN "isDuringRebalance" TO "is_during_rebalance";--> statement-breakpoint
ALTER TABLE "claim_history" RENAME COLUMN "createdAt" TO "created_at";--> statement-breakpoint
ALTER TABLE "pending_transactions" RENAME COLUMN "operationType" TO "operation_type";--> statement-breakpoint
ALTER TABLE "pending_transactions" RENAME COLUMN "userId" TO "user_id";--> statement-breakpoint
ALTER TABLE "pending_transactions" RENAME COLUMN "retryCount" TO "retry_count";--> statement-breakpoint
ALTER TABLE "pending_transactions" RENAME COLUMN "maxRetries" TO "max_retries";--> statement-breakpoint
ALTER TABLE "pending_transactions" RENAME COLUMN "lastProcessedAt" TO "last_processed_at";--> statement-breakpoint
ALTER TABLE "pending_transactions" RENAME COLUMN "errorMessage" TO "error_message";--> statement-breakpoint
ALTER TABLE "pending_transactions" RENAME COLUMN "createdAt" TO "created_at";--> statement-breakpoint
ALTER TABLE "pending_transactions" RENAME COLUMN "updatedAt" TO "updated_at";--> statement-breakpoint
ALTER TABLE "points" RENAME COLUMN "userId" TO "user_id";--> statement-breakpoint
ALTER TABLE "points" RENAME COLUMN "referralId" TO "referral_id";--> statement-breakpoint
ALTER TABLE "points" RENAME COLUMN "createdAt" TO "created_at";--> statement-breakpoint
ALTER TABLE "PositionSegment" RENAME COLUMN "positionId" TO "position_id";--> statement-breakpoint
ALTER TABLE "PositionSegment" RENAME COLUMN "segmentNumber" TO "segment_number";--> statement-breakpoint
ALTER TABLE "PositionSegment" RENAME COLUMN "startTimestamp" TO "start_timestamp";--> statement-breakpoint
ALTER TABLE "PositionSegment" RENAME COLUMN "endTimestamp" TO "end_timestamp";--> statement-breakpoint
ALTER TABLE "PositionSegment" RENAME COLUMN "initialValueUSD" TO "initial_value_usd";--> statement-breakpoint
ALTER TABLE "PositionSegment" RENAME COLUMN "finalValueUSD" TO "final_value_usd";--> statement-breakpoint
ALTER TABLE "PositionSegment" RENAME COLUMN "realizedPnlUSD" TO "realized_pnl_usd";--> statement-breakpoint
ALTER TABLE "PositionSegment" RENAME COLUMN "realizedPnlPercentage" TO "realized_pnl_percentage";--> statement-breakpoint
ALTER TABLE "PositionSegment" RENAME COLUMN "feesClaimedUSD" TO "fees_claimed_usd";--> statement-breakpoint
ALTER TABLE "PositionSegment" RENAME COLUMN "closureReason" TO "closure_reason";--> statement-breakpoint
ALTER TABLE "PositionSegment" RENAME COLUMN "closureSignature" TO "closure_signature";--> statement-breakpoint
ALTER TABLE "PositionSegment" RENAME COLUMN "startPositionAddress" TO "start_position_address";--> statement-breakpoint
ALTER TABLE "PositionSegment" RENAME COLUMN "endPositionAddress" TO "end_position_address";--> statement-breakpoint
ALTER TABLE "PositionSegment" RENAME COLUMN "createdAt" TO "created_at";--> statement-breakpoint
ALTER TABLE "PositionSnapshot" RENAME COLUMN "positionId" TO "position_id";--> statement-breakpoint
ALTER TABLE "PositionSnapshot" RENAME COLUMN "segmentId" TO "segment_id";--> statement-breakpoint
ALTER TABLE "PositionSnapshot" RENAME COLUMN "snapshotTimestamp" TO "snapshot_timestamp";--> statement-breakpoint
ALTER TABLE "PositionSnapshot" RENAME COLUMN "snapshotType" TO "snapshot_type";--> statement-breakpoint
ALTER TABLE "PositionSnapshot" RENAME COLUMN "currentValueUSD" TO "current_value_usd";--> statement-breakpoint
ALTER TABLE "PositionSnapshot" RENAME COLUMN "tokenXAmount" TO "token_x_amount";--> statement-breakpoint
ALTER TABLE "PositionSnapshot" RENAME COLUMN "tokenYAmount" TO "token_y_amount";--> statement-breakpoint
ALTER TABLE "PositionSnapshot" RENAME COLUMN "unclaimedFeesX" TO "unclaimed_fees_x";--> statement-breakpoint
ALTER TABLE "PositionSnapshot" RENAME COLUMN "unclaimedFeesY" TO "unclaimed_fees_y";--> statement-breakpoint
ALTER TABLE "PositionSnapshot" RENAME COLUMN "unclaimedFeesUSD" TO "unclaimed_fees_usd";--> statement-breakpoint
ALTER TABLE "PositionSnapshot" RENAME COLUMN "unrealizedPnlUSD" TO "unrealized_pnl_usd";--> statement-breakpoint
ALTER TABLE "PositionSnapshot" RENAME COLUMN "unrealizedPnlPercentage" TO "unrealized_pnl_percentage";--> statement-breakpoint
ALTER TABLE "PositionSnapshot" RENAME COLUMN "totalPnlUSD" TO "total_pnl_usd";--> statement-breakpoint
ALTER TABLE "PositionSnapshot" RENAME COLUMN "totalPnlPercentage" TO "total_pnl_percentage";--> statement-breakpoint
ALTER TABLE "PositionSnapshot" RENAME COLUMN "tokenXPriceUSD" TO "token_x_price_usd";--> statement-breakpoint
ALTER TABLE "PositionSnapshot" RENAME COLUMN "tokenYPriceUSD" TO "token_y_price_usd";--> statement-breakpoint
ALTER TABLE "PositionSnapshot" RENAME COLUMN "solPriceUSD" TO "sol_price_usd";--> statement-breakpoint
ALTER TABLE "PositionSnapshot" RENAME COLUMN "createdAt" TO "created_at";--> statement-breakpoint
ALTER TABLE "positions" RENAME COLUMN "userId" TO "user_id";--> statement-breakpoint
ALTER TABLE "positions" RENAME COLUMN "positionAddress" TO "position_address";--> statement-breakpoint
ALTER TABLE "positions" RENAME COLUMN "poolAddress" TO "pool_address";--> statement-breakpoint
ALTER TABLE "positions" RENAME COLUMN "strategyType" TO "strategy_type";--> statement-breakpoint
ALTER TABLE "positions" RENAME COLUMN "tokenX" TO "token_x";--> statement-breakpoint
ALTER TABLE "positions" RENAME COLUMN "tokenY" TO "token_y";--> statement-breakpoint
ALTER TABLE "positions" RENAME COLUMN "createdAt" TO "created_at";--> statement-breakpoint
ALTER TABLE "positions" RENAME COLUMN "closedAt" TO "closed_at";--> statement-breakpoint
ALTER TABLE "positions" RENAME COLUMN "initialValueUSD" TO "initial_value_usd";--> statement-breakpoint
ALTER TABLE "positions" RENAME COLUMN "initialValueSOL" TO "initial_value_sol";--> statement-breakpoint
ALTER TABLE "positions" RENAME COLUMN "initialTokenXAmount" TO "initial_token_x_amount";--> statement-breakpoint
ALTER TABLE "positions" RENAME COLUMN "initialTokenYAmount" TO "initial_token_y_amount";--> statement-breakpoint
ALTER TABLE "positions" RENAME COLUMN "initialTokenXPriceUSD" TO "initial_token_x_price_usd";--> statement-breakpoint
ALTER TABLE "positions" RENAME COLUMN "initialTokenYPriceUSD" TO "initial_token_y_price_usd";--> statement-breakpoint
ALTER TABLE "positions" RENAME COLUMN "currentSegmentNumber" TO "current_segment_number";--> statement-breakpoint
ALTER TABLE "positions" RENAME COLUMN "currentSegmentInitialUSD" TO "current_segment_initial_usd";--> statement-breakpoint
ALTER TABLE "positions" RENAME COLUMN "currentSegmentStartAt" TO "current_segment_start_at";--> statement-breakpoint
ALTER TABLE "positions" RENAME COLUMN "totalRealizedPnlUSD" TO "total_realized_pnl_usd";--> statement-breakpoint
ALTER TABLE "positions" RENAME COLUMN "totalFeesClaimedUSD" TO "total_fees_claimed_usd";--> statement-breakpoint
ALTER TABLE "positions" RENAME COLUMN "finalValueUSD" TO "final_value_usd";--> statement-breakpoint
ALTER TABLE "positions" RENAME COLUMN "finalValueSOL" TO "final_value_sol";--> statement-breakpoint
ALTER TABLE "positions" RENAME COLUMN "finalTokenXAmount" TO "final_token_x_amount";--> statement-breakpoint
ALTER TABLE "positions" RENAME COLUMN "finalTokenYAmount" TO "final_token_y_amount";--> statement-breakpoint
ALTER TABLE "positions" RENAME COLUMN "finalTokenXPriceUSD" TO "final_token_x_price_usd";--> statement-breakpoint
ALTER TABLE "positions" RENAME COLUMN "finalTokenYPriceUSD" TO "final_token_y_price_usd";--> statement-breakpoint
ALTER TABLE "positions" RENAME COLUMN "isRebalancingEnabled" TO "is_rebalancing_enabled";--> statement-breakpoint
ALTER TABLE "positions" RENAME COLUMN "rebalanceThreshold" TO "rebalance_threshold";--> statement-breakpoint
ALTER TABLE "positions" RENAME COLUMN "slPercentage" TO "sl_percentage";--> statement-breakpoint
ALTER TABLE "positions" RENAME COLUMN "tpPercentage" TO "tp_percentage";--> statement-breakpoint
ALTER TABLE "positions" RENAME COLUMN "creationSignature" TO "creation_signature";--> statement-breakpoint
ALTER TABLE "positions" RENAME COLUMN "closureSignature" TO "closure_signature";--> statement-breakpoint
ALTER TABLE "positions" RENAME COLUMN "updatedAt" TO "updated_at";--> statement-breakpoint
ALTER TABLE "RebalanceEvent" RENAME COLUMN "positionId" TO "position_id";--> statement-breakpoint
ALTER TABLE "RebalanceEvent" RENAME COLUMN "triggerReason" TO "trigger_reason";--> statement-breakpoint
ALTER TABLE "RebalanceEvent" RENAME COLUMN "oldPositionAddress" TO "old_position_address";--> statement-breakpoint
ALTER TABLE "RebalanceEvent" RENAME COLUMN "newPositionAddress" TO "new_position_address";--> statement-breakpoint
ALTER TABLE "RebalanceEvent" RENAME COLUMN "closedSegmentId" TO "closed_segment_id";--> statement-breakpoint
ALTER TABLE "RebalanceEvent" RENAME COLUMN "segmentInitialUSD" TO "segment_initial_usd";--> statement-breakpoint
ALTER TABLE "RebalanceEvent" RENAME COLUMN "segmentFinalUSD" TO "segment_final_usd";--> statement-breakpoint
ALTER TABLE "RebalanceEvent" RENAME COLUMN "segmentPnlUSD" TO "segment_pnl_usd";--> statement-breakpoint
ALTER TABLE "RebalanceEvent" RENAME COLUMN "segmentPnlPercentage" TO "segment_pnl_percentage";--> statement-breakpoint
ALTER TABLE "RebalanceEvent" RENAME COLUMN "feesCollectedUSD" TO "fees_collected_usd";--> statement-breakpoint
ALTER TABLE "RebalanceEvent" RENAME COLUMN "newSegmentId" TO "new_segment_id";--> statement-breakpoint
ALTER TABLE "RebalanceEvent" RENAME COLUMN "newSegmentInitialUSD" TO "new_segment_initial_usd";--> statement-breakpoint
ALTER TABLE "RebalanceEvent" RENAME COLUMN "closeTransactionSignature" TO "close_transaction_signature";--> statement-breakpoint
ALTER TABLE "RebalanceEvent" RENAME COLUMN "createTransactionSignature" TO "create_transaction_signature";--> statement-breakpoint
ALTER TABLE "RebalanceEvent" RENAME COLUMN "totalGasCostSOL" TO "total_gas_cost_sol";--> statement-breakpoint
ALTER TABLE "RebalanceEvent" RENAME COLUMN "slippageCostUSD" TO "slippage_cost_usd";--> statement-breakpoint
ALTER TABLE "RebalanceEvent" RENAME COLUMN "createdAt" TO "created_at";--> statement-breakpoint
ALTER TABLE "Referral" RENAME COLUMN "referrerId" TO "referrer_id";--> statement-breakpoint
ALTER TABLE "Referral" RENAME COLUMN "referredId" TO "referred_id";--> statement-breakpoint
ALTER TABLE "Referral" RENAME COLUMN "referralCode" TO "referral_code";--> statement-breakpoint
ALTER TABLE "Referral" RENAME COLUMN "feesEarned" TO "fees_earned";--> statement-breakpoint
ALTER TABLE "Referral" RENAME COLUMN "pointsEarned" TO "points_earned";--> statement-breakpoint
ALTER TABLE "Referral" RENAME COLUMN "createdAt" TO "created_at";--> statement-breakpoint
ALTER TABLE "Referral" RENAME COLUMN "updatedAt" TO "updated_at";--> statement-breakpoint
ALTER TABLE "transactions" RENAME COLUMN "positionId" TO "position_id";--> statement-breakpoint
ALTER TABLE "transactions" RENAME COLUMN "tokenAddress" TO "token_address";--> statement-breakpoint
ALTER TABLE "transactions" RENAME COLUMN "txHash" TO "tx_hash";--> statement-breakpoint
ALTER TABLE "transactions" RENAME COLUMN "errorMessage" TO "error_message";--> statement-breakpoint
ALTER TABLE "transactions" RENAME COLUMN "createdAt" TO "created_at";--> statement-breakpoint
ALTER TABLE "transactions" RENAME COLUMN "updatedAt" TO "updated_at";--> statement-breakpoint
ALTER TABLE "users" RENAME COLUMN "telegramId" TO "telegram_id";--> statement-breakpoint
ALTER TABLE "users" RENAME COLUMN "walletId" TO "wallet_id";--> statement-breakpoint
ALTER TABLE "users" RENAME COLUMN "walletAddress" TO "wallet_address";--> statement-breakpoint
ALTER TABLE "users" RENAME COLUMN "autoRebalanceEnabled" TO "auto_rebalance_enabled";--> statement-breakpoint
ALTER TABLE "users" RENAME COLUMN "rebalanceThreshold" TO "rebalance_threshold";--> statement-breakpoint
ALTER TABLE "users" RENAME COLUMN "rebalanceStrategy" TO "rebalance_strategy";--> statement-breakpoint
ALTER TABLE "users" RENAME COLUMN "balancedPositionBinRange" TO "balanced_position_bin_range";--> statement-breakpoint
ALTER TABLE "users" RENAME COLUMN "createdAt" TO "created_at";--> statement-breakpoint
ALTER TABLE "users" RENAME COLUMN "updatedAt" TO "updated_at";--> statement-breakpoint
ALTER TABLE "wallets" RENAME COLUMN "userId" TO "user_id";--> statement-breakpoint
ALTER TABLE "wallets" RENAME COLUMN "privateKeyEncrypted" TO "private_key_encrypted";--> statement-breakpoint
ALTER TABLE "wallets" RENAME COLUMN "isActive" TO "is_active";--> statement-breakpoint
ALTER TABLE "wallets" RENAME COLUMN "createdAt" TO "created_at";--> statement-breakpoint
ALTER TABLE "wallets" RENAME COLUMN "updatedAt" TO "updated_at";--> statement-breakpoint
ALTER TABLE "pending_transactions" DROP CONSTRAINT "PendingTransaction_signature_unique";--> statement-breakpoint
ALTER TABLE "positions" DROP CONSTRAINT "Position_positionAddress_unique";--> statement-breakpoint
ALTER TABLE "users" DROP CONSTRAINT "User_telegramId_unique";--> statement-breakpoint
ALTER TABLE "users" DROP CONSTRAINT "User_walletId_unique";--> statement-breakpoint
ALTER TABLE "users" DROP CONSTRAINT "User_walletAddress_unique";--> statement-breakpoint
ALTER TABLE "claim_history" DROP CONSTRAINT "ClaimHistory_positionId_Position_id_fk";
--> statement-breakpoint
ALTER TABLE "claim_history" DROP CONSTRAINT "ClaimHistory_segmentId_PositionSegment_id_fk";
--> statement-breakpoint
ALTER TABLE "pending_transactions" DROP CONSTRAINT "PendingTransaction_userId_User_id_fk";
--> statement-breakpoint
ALTER TABLE "points" DROP CONSTRAINT "Points_referralId_Referral_id_fk";
--> statement-breakpoint
ALTER TABLE "PositionSegment" DROP CONSTRAINT "PositionSegment_positionId_Position_id_fk";
--> statement-breakpoint
ALTER TABLE "PositionSnapshot" DROP CONSTRAINT "PositionSnapshot_positionId_Position_id_fk";
--> statement-breakpoint
ALTER TABLE "PositionSnapshot" DROP CONSTRAINT "PositionSnapshot_segmentId_PositionSegment_id_fk";
--> statement-breakpoint
ALTER TABLE "positions" DROP CONSTRAINT "Position_userId_User_id_fk";
--> statement-breakpoint
ALTER TABLE "RebalanceEvent" DROP CONSTRAINT "RebalanceEvent_positionId_Position_id_fk";
--> statement-breakpoint
ALTER TABLE "RebalanceEvent" DROP CONSTRAINT "RebalanceEvent_closedSegmentId_PositionSegment_id_fk";
--> statement-breakpoint
ALTER TABLE "RebalanceEvent" DROP CONSTRAINT "RebalanceEvent_newSegmentId_PositionSegment_id_fk";
--> statement-breakpoint
ALTER TABLE "transactions" DROP CONSTRAINT "Transaction_positionId_Position_id_fk";
--> statement-breakpoint
ALTER TABLE "wallets" DROP CONSTRAINT "Wallet_userId_User_id_fk";
--> statement-breakpoint
ALTER TABLE "claim_history" ADD CONSTRAINT "claim_history_position_id_positions_id_fk" FOREIGN KEY ("position_id") REFERENCES "public"."positions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "claim_history" ADD CONSTRAINT "claim_history_segment_id_PositionSegment_id_fk" FOREIGN KEY ("segment_id") REFERENCES "public"."PositionSegment"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pending_transactions" ADD CONSTRAINT "pending_transactions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "points" ADD CONSTRAINT "points_referral_id_Referral_id_fk" FOREIGN KEY ("referral_id") REFERENCES "public"."Referral"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "PositionSegment" ADD CONSTRAINT "PositionSegment_position_id_positions_id_fk" FOREIGN KEY ("position_id") REFERENCES "public"."positions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "PositionSnapshot" ADD CONSTRAINT "PositionSnapshot_position_id_positions_id_fk" FOREIGN KEY ("position_id") REFERENCES "public"."positions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "PositionSnapshot" ADD CONSTRAINT "PositionSnapshot_segment_id_PositionSegment_id_fk" FOREIGN KEY ("segment_id") REFERENCES "public"."PositionSegment"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "positions" ADD CONSTRAINT "positions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "RebalanceEvent" ADD CONSTRAINT "RebalanceEvent_position_id_positions_id_fk" FOREIGN KEY ("position_id") REFERENCES "public"."positions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "RebalanceEvent" ADD CONSTRAINT "RebalanceEvent_closed_segment_id_PositionSegment_id_fk" FOREIGN KEY ("closed_segment_id") REFERENCES "public"."PositionSegment"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "RebalanceEvent" ADD CONSTRAINT "RebalanceEvent_new_segment_id_PositionSegment_id_fk" FOREIGN KEY ("new_segment_id") REFERENCES "public"."PositionSegment"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "transactions" ADD CONSTRAINT "transactions_position_id_positions_id_fk" FOREIGN KEY ("position_id") REFERENCES "public"."positions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "wallets" ADD CONSTRAINT "wallets_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pending_transactions" ADD CONSTRAINT "pending_transactions_signature_unique" UNIQUE("signature");--> statement-breakpoint
ALTER TABLE "positions" ADD CONSTRAINT "positions_position_address_unique" UNIQUE("position_address");--> statement-breakpoint
ALTER TABLE "users" ADD CONSTRAINT "users_telegram_id_unique" UNIQUE("telegram_id");--> statement-breakpoint
ALTER TABLE "users" ADD CONSTRAINT "users_wallet_id_unique" UNIQUE("wallet_id");--> statement-breakpoint
ALTER TABLE "users" ADD CONSTRAINT "users_wallet_address_unique" UNIQUE("wallet_address");