CREATE TYPE "public"."PositionStatus" AS ENUM('ACTIVE', 'CLOSED', 'REBALANCING');--> statement-breakpoint
CREATE TYPE "public"."StrategyType" AS ENUM('DLMM', 'DAMM', 'CONCENTRATED');--> statement-breakpoint
CREATE TYPE "public"."TransactionStatus" AS ENUM('PENDING', 'CONFIRMED', 'FAILED');--> statement-breakpoint
CREATE TYPE "public"."TransactionType" AS ENUM('DEPOSIT', 'WITHDRAW', 'REBALANCE', 'FEE_COLLECTION');--> statement-breakpoint
CREATE TABLE "Position" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"userId" uuid NOT NULL,
	"tokenAddress" text NOT NULL,
	"poolAddress" text NOT NULL,
	"strategyType" "StrategyType" NOT NULL,
	"initialAmount" numeric(20, 8) NOT NULL,
	"currentValue" numeric(20, 8) NOT NULL,
	"feesEarned" numeric(20, 8) DEFAULT '0' NOT NULL,
	"status" "PositionStatus" DEFAULT 'ACTIVE' NOT NULL,
	"lastRebalanceAt" timestamp,
	"createdAt" timestamp DEFAULT now() NOT NULL,
	"updatedAt" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "RebalanceEvent" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"positionId" uuid NOT NULL,
	"oldValue" numeric(20, 8) NOT NULL,
	"newValue" numeric(20, 8) NOT NULL,
	"feesCollected" numeric(20, 8) DEFAULT '0' NOT NULL,
	"reason" text NOT NULL,
	"txHash" text,
	"createdAt" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "Transaction" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"positionId" uuid NOT NULL,
	"type" "TransactionType" NOT NULL,
	"amount" numeric(20, 8) NOT NULL,
	"tokenAddress" text NOT NULL,
	"txHash" text,
	"status" "TransactionStatus" DEFAULT 'PENDING' NOT NULL,
	"errorMessage" text,
	"createdAt" timestamp DEFAULT now() NOT NULL,
	"updatedAt" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "User" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"telegramId" text NOT NULL,
	"username" text,
	"walletAddress" text,
	"autoRebalanceEnabled" boolean DEFAULT true NOT NULL,
	"rebalanceThreshold" numeric(5, 2) DEFAULT '5.00' NOT NULL,
	"createdAt" timestamp DEFAULT now() NOT NULL,
	"updatedAt" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "User_telegramId_unique" UNIQUE("telegramId")
);
--> statement-breakpoint
CREATE TABLE "Wallet" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"userId" uuid NOT NULL,
	"address" text NOT NULL,
	"privateKeyEncrypted" text NOT NULL,
	"isActive" boolean DEFAULT false NOT NULL,
	"createdAt" timestamp DEFAULT now() NOT NULL,
	"updatedAt" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "Position" ADD CONSTRAINT "Position_userId_User_id_fk" FOREIGN KEY ("userId") REFERENCES "public"."User"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "RebalanceEvent" ADD CONSTRAINT "RebalanceEvent_positionId_Position_id_fk" FOREIGN KEY ("positionId") REFERENCES "public"."Position"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "Transaction" ADD CONSTRAINT "Transaction_positionId_Position_id_fk" FOREIGN KEY ("positionId") REFERENCES "public"."Position"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "Wallet" ADD CONSTRAINT "Wallet_userId_User_id_fk" FOREIGN KEY ("userId") REFERENCES "public"."User"("id") ON DELETE cascade ON UPDATE no action;