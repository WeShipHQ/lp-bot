CREATE TYPE "public"."claim_type" AS ENUM('manual', 'rebalance', 'closure');--> statement-breakpoint
CREATE TYPE "public"."operation_type" AS ENUM('CREATE_POSITION', 'CLOSE_POSITION', 'ADD_LIQUIDITY', 'REMOVE_LIQUIDITY', 'CLAIM_FEES', 'REBALANCE', 'SOL_TO_TOKEN_SWAP');--> statement-breakpoint
CREATE TYPE "public"."pending_transaction_status" AS ENUM('PENDING', 'PROCESSING', 'COMPLETED', 'FAILED', 'RETRY');--> statement-breakpoint
CREATE TYPE "public"."point_type" AS ENUM('REFERRAL_BONUS', 'FEE_EARNING', 'ACTIVITY_REWARD');--> statement-breakpoint
CREATE TYPE "public"."position_status" AS ENUM('ACTIVE', 'CLOSED', 'REBALANCING');--> statement-breakpoint
CREATE TYPE "public"."rebalance_strategy" AS ENUM('STANDARD', 'DIP_PROTECTION');--> statement-breakpoint
CREATE TYPE "public"."snapshot_type" AS ENUM('creation', 'claim', 'rebalance', 'closure', 'periodic');--> statement-breakpoint
CREATE TYPE "public"."strategy_type" AS ENUM('DLMM', 'DAMM', 'CONCENTRATED');--> statement-breakpoint
CREATE TYPE "public"."transaction_status" AS ENUM('PENDING', 'PENDING_SWAPS', 'CONFIRMED', 'FAILED');--> statement-breakpoint
CREATE TYPE "public"."transaction_type" AS ENUM('DEPOSIT', 'WITHDRAW', 'REBALANCE', 'FEE_COLLECTION');--> statement-breakpoint
CREATE TABLE "claim_history" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"position_id" uuid NOT NULL,
	"segment_id" uuid,
	"claim_type" "claim_type" DEFAULT 'manual' NOT NULL,
	"claimed_token_x_amount" numeric(28, 9) NOT NULL,
	"claimed_token_y_amount" numeric(28, 9) NOT NULL,
	"claimed_rewards_other" jsonb,
	"claimed_usd_value" numeric(18, 6) NOT NULL,
	"token_x_price_usd" numeric(18, 9) NOT NULL,
	"token_y_price_usd" numeric(18, 9) NOT NULL,
	"sol_received" numeric(18, 9),
	"sol_price_usd" numeric(18, 9),
	"transaction_signature" text NOT NULL,
	"is_during_rebalance" boolean DEFAULT false,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT (now() AT TIME ZONE 'utc'::text) NOT NULL,
	"updated_at" timestamp with time zone DEFAULT (now() AT TIME ZONE 'utc'::text) NOT NULL
);
--> statement-breakpoint
CREATE TABLE "pending_transactions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"signature" text NOT NULL,
	"user_id" uuid NOT NULL,
	"status" "pending_transaction_status" DEFAULT 'PENDING' NOT NULL,
	"metadata" jsonb,
	"group" varchar,
	"retry_count" integer DEFAULT 0 NOT NULL,
	"max_retries" integer DEFAULT 3 NOT NULL,
	"last_processed_at" timestamp with time zone,
	"error_message" text,
	"created_at" timestamp with time zone DEFAULT (now() AT TIME ZONE 'utc'::text) NOT NULL,
	"updated_at" timestamp with time zone DEFAULT (now() AT TIME ZONE 'utc'::text) NOT NULL,
	CONSTRAINT "pending_transactions_signature_unique" UNIQUE("signature")
);
--> statement-breakpoint
CREATE TABLE "points" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" text NOT NULL,
	"amount" integer NOT NULL,
	"type" "point_type" NOT NULL,
	"description" text,
	"referral_id" uuid,
	"created_at" timestamp with time zone DEFAULT (now() AT TIME ZONE 'utc'::text) NOT NULL,
	"updated_at" timestamp with time zone DEFAULT (now() AT TIME ZONE 'utc'::text) NOT NULL
);
--> statement-breakpoint
CREATE TABLE "PositionSegment" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"position_id" uuid NOT NULL,
	"segment_number" integer NOT NULL,
	"start_timestamp" timestamp with time zone NOT NULL,
	"end_timestamp" timestamp with time zone,
	"initial_value_usd" numeric(18, 6) NOT NULL,
	"final_value_usd" numeric(18, 6),
	"realized_pnl_usd" numeric(18, 6),
	"realized_pnl_percentage" numeric(10, 4),
	"fees_claimed_usd" numeric(18, 6) DEFAULT '0',
	"closure_reason" text,
	"closure_signature" text,
	"start_position_address" text NOT NULL,
	"end_position_address" text,
	"created_at" timestamp with time zone DEFAULT (now() AT TIME ZONE 'utc'::text) NOT NULL,
	"updated_at" timestamp with time zone DEFAULT (now() AT TIME ZONE 'utc'::text) NOT NULL
);
--> statement-breakpoint
CREATE TABLE "PositionSnapshot" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"position_id" uuid NOT NULL,
	"segment_id" uuid,
	"snapshot_type" "snapshot_type" NOT NULL,
	"current_value_usd" numeric(18, 6) NOT NULL,
	"token_x_amount" numeric(28, 9) NOT NULL,
	"token_y_amount" numeric(28, 9) NOT NULL,
	"unclaimed_fees_x" numeric(28, 9) NOT NULL,
	"unclaimed_fees_y" numeric(28, 9) NOT NULL,
	"unclaimed_fees_usd" numeric(18, 6) NOT NULL,
	"unrealized_pnl_usd" numeric(18, 6) NOT NULL,
	"unrealized_pnl_percentage" numeric(10, 4) NOT NULL,
	"total_pnl_usd" numeric(18, 6) NOT NULL,
	"total_pnl_percentage" numeric(10, 4) NOT NULL,
	"token_x_price_usd" numeric(18, 9) NOT NULL,
	"token_y_price_usd" numeric(18, 9) NOT NULL,
	"sol_price_usd" numeric(18, 9) NOT NULL,
	"created_at" timestamp with time zone DEFAULT (now() AT TIME ZONE 'utc'::text) NOT NULL,
	"updated_at" timestamp with time zone DEFAULT (now() AT TIME ZONE 'utc'::text) NOT NULL
);
--> statement-breakpoint
CREATE TABLE "positions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"position_address" text NOT NULL,
	"pool_address" text NOT NULL,
	"dex" text DEFAULT 'meteora' NOT NULL,
	"strategy_type" "strategy_type" NOT NULL,
	"token_x" jsonb NOT NULL,
	"token_y" jsonb NOT NULL,
	"status" "position_status" DEFAULT 'ACTIVE' NOT NULL,
	"closed_at" timestamp with time zone,
	"initial_value_usd" numeric(18, 6) NOT NULL,
	"initial_value_sol" numeric(18, 9) NOT NULL,
	"initial_token_x_amount" numeric(28, 9) NOT NULL,
	"initial_token_y_amount" numeric(28, 9) NOT NULL,
	"initial_token_x_price_usd" numeric(18, 9) NOT NULL,
	"initial_token_y_price_usd" numeric(18, 9) NOT NULL,
	"current_segment_number" integer DEFAULT 1 NOT NULL,
	"current_segment_initial_usd" numeric(18, 6) NOT NULL,
	"current_segment_start_at" timestamp with time zone DEFAULT now() NOT NULL,
	"total_realized_pnl_usd" numeric(18, 6) DEFAULT '0' NOT NULL,
	"total_fees_claimed_usd" numeric(18, 6) DEFAULT '0' NOT NULL,
	"final_value_usd" numeric(18, 6),
	"final_value_sol" numeric(18, 9),
	"final_token_x_amount" numeric(28, 9),
	"final_token_y_amount" numeric(28, 9),
	"final_token_x_price_usd" numeric(18, 9),
	"final_token_y_price_usd" numeric(18, 9),
	"is_rebalancing_enabled" boolean DEFAULT false,
	"rebalance_threshold" numeric(5, 2) DEFAULT '20.0',
	"sl_percentage" numeric(5, 2),
	"tp_percentage" numeric(5, 2),
	"creation_signature" text NOT NULL,
	"closure_signature" text,
	"created_at" timestamp with time zone DEFAULT (now() AT TIME ZONE 'utc'::text) NOT NULL,
	"updated_at" timestamp with time zone DEFAULT (now() AT TIME ZONE 'utc'::text) NOT NULL,
	CONSTRAINT "positions_position_address_unique" UNIQUE("position_address")
);
--> statement-breakpoint
CREATE TABLE "RebalanceEvent" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"position_id" uuid NOT NULL,
	"trigger_reason" text NOT NULL,
	"old_position_address" text NOT NULL,
	"new_position_address" text NOT NULL,
	"closed_segment_id" uuid,
	"segment_initial_usd" numeric(18, 6) NOT NULL,
	"segment_final_usd" numeric(18, 6) NOT NULL,
	"segment_pnl_usd" numeric(18, 6) NOT NULL,
	"segment_pnl_percentage" numeric(10, 4) NOT NULL,
	"fees_collected_usd" numeric(18, 6) DEFAULT '0',
	"new_segment_id" uuid,
	"new_segment_initial_usd" numeric(18, 6) NOT NULL,
	"close_transaction_signature" text,
	"create_transaction_signature" text,
	"total_gas_cost_sol" numeric(18, 9),
	"slippage_cost_usd" numeric(18, 6),
	"notes" text,
	"created_at" timestamp with time zone DEFAULT (now() AT TIME ZONE 'utc'::text) NOT NULL,
	"updated_at" timestamp with time zone DEFAULT (now() AT TIME ZONE 'utc'::text) NOT NULL
);
--> statement-breakpoint
CREATE TABLE "Referral" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"referrer_id" text NOT NULL,
	"referred_id" text NOT NULL,
	"referral_code" text NOT NULL,
	"status" text DEFAULT 'ACTIVE' NOT NULL,
	"fees_earned" numeric(20, 8) DEFAULT '0' NOT NULL,
	"points_earned" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT (now() AT TIME ZONE 'utc'::text) NOT NULL,
	"updated_at" timestamp with time zone DEFAULT (now() AT TIME ZONE 'utc'::text) NOT NULL
);
--> statement-breakpoint
CREATE TABLE "transactions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"position_id" uuid NOT NULL,
	"type" "transaction_type" NOT NULL,
	"amount" numeric(20, 8) NOT NULL,
	"token_address" text NOT NULL,
	"tx_hash" text,
	"error_message" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"telegram_id" text NOT NULL,
	"wallet_id" text NOT NULL,
	"privy_user_id" text NOT NULL,
	"username" text,
	"wallet_address" text NOT NULL,
	"auto_rebalance_enabled" boolean DEFAULT true NOT NULL,
	"rebalance_threshold" numeric(5, 2) DEFAULT '20.00' NOT NULL,
	"rebalance_strategy" "rebalance_strategy" DEFAULT 'STANDARD' NOT NULL,
	"rebalance_schedule" text DEFAULT '15m' NOT NULL,
	"default_bin_range" integer DEFAULT 10 NOT NULL,
	"balanced_position_bin_range" integer DEFAULT 10 NOT NULL,
	"stop_loss_percentage" numeric(5, 2) DEFAULT '25.00',
	"take_profit_percentage" numeric(5, 2) DEFAULT '25.00',
	"auto_convert_to_sol" boolean DEFAULT true NOT NULL,
	"slippage_percentage" numeric(5, 2) DEFAULT '3.00' NOT NULL,
	"created_at" timestamp with time zone DEFAULT (now() AT TIME ZONE 'utc'::text) NOT NULL,
	"updated_at" timestamp with time zone DEFAULT (now() AT TIME ZONE 'utc'::text) NOT NULL,
	CONSTRAINT "users_telegram_id_unique" UNIQUE("telegram_id"),
	CONSTRAINT "users_wallet_id_unique" UNIQUE("wallet_id"),
	CONSTRAINT "users_privy_user_id_unique" UNIQUE("privy_user_id"),
	CONSTRAINT "users_wallet_address_unique" UNIQUE("wallet_address")
);
--> statement-breakpoint
CREATE TABLE "wallets" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"address" text NOT NULL,
	"private_key_encrypted" text NOT NULL,
	"is_active" boolean DEFAULT false NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
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
ALTER TABLE "wallets" ADD CONSTRAINT "wallets_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;