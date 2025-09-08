CREATE TYPE "public"."OperationType" AS ENUM('CREATE_POSITION', 'CLOSE_POSITION', 'ADD_LIQUIDITY', 'REMOVE_LIQUIDITY', 'CLAIM_FEES', 'REBALANCE');--> statement-breakpoint
CREATE TYPE "public"."PendingTransactionStatus" AS ENUM('PENDING', 'PROCESSING', 'COMPLETED', 'FAILED', 'RETRY');--> statement-breakpoint
CREATE TABLE "PendingTransaction" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"signature" text NOT NULL,
	"operationType" "OperationType" NOT NULL,
	"userId" uuid NOT NULL,
	"status" "PendingTransactionStatus" DEFAULT 'PENDING' NOT NULL,
	"metadata" text,
	"retryCount" integer DEFAULT 0 NOT NULL,
	"maxRetries" integer DEFAULT 3 NOT NULL,
	"lastProcessedAt" timestamp,
	"errorMessage" text,
	"createdAt" timestamp DEFAULT now() NOT NULL,
	"updatedAt" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "PendingTransaction_signature_unique" UNIQUE("signature")
);
--> statement-breakpoint
ALTER TABLE "Position" ADD COLUMN "creationSignature" text;--> statement-breakpoint
ALTER TABLE "Position" ADD COLUMN "closureSignature" text;--> statement-breakpoint
ALTER TABLE "PendingTransaction" ADD CONSTRAINT "PendingTransaction_userId_User_id_fk" FOREIGN KEY ("userId") REFERENCES "public"."User"("id") ON DELETE cascade ON UPDATE no action;