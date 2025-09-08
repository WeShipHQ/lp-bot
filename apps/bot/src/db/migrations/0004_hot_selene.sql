CREATE TYPE "public"."PointType" AS ENUM('REFERRAL_BONUS', 'FEE_EARNING', 'ACTIVITY_REWARD');--> statement-breakpoint
CREATE TABLE "Points" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"userId" text NOT NULL,
	"amount" integer NOT NULL,
	"type" "PointType" NOT NULL,
	"description" text,
	"referralId" uuid,
	"createdAt" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "Referral" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"referrerId" text NOT NULL,
	"referredId" text NOT NULL,
	"referralCode" text NOT NULL,
	"status" text DEFAULT 'ACTIVE' NOT NULL,
	"feesEarned" numeric(20, 8) DEFAULT '0' NOT NULL,
	"pointsEarned" integer DEFAULT 0 NOT NULL,
	"createdAt" timestamp DEFAULT now() NOT NULL,
	"updatedAt" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "Position" RENAME COLUMN "tokenAddress" TO "positionAddress";--> statement-breakpoint
ALTER TABLE "User" ALTER COLUMN "walletAddress" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "Position" ADD COLUMN "tokenXAmount" numeric(20, 8) NOT NULL;--> statement-breakpoint
ALTER TABLE "Position" ADD COLUMN "tokenYAmount" numeric(20, 8) NOT NULL;--> statement-breakpoint
ALTER TABLE "Points" ADD CONSTRAINT "Points_referralId_Referral_id_fk" FOREIGN KEY ("referralId") REFERENCES "public"."Referral"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "Position" DROP COLUMN "initialAmount";--> statement-breakpoint
ALTER TABLE "User" ADD CONSTRAINT "User_walletAddress_unique" UNIQUE("walletAddress");