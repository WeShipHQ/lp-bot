ALTER TABLE "User" ADD COLUMN "walletId" text NOT NULL;--> statement-breakpoint
ALTER TABLE "User" ADD CONSTRAINT "User_walletId_unique" UNIQUE("walletId");