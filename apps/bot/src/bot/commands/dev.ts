import { Telegraf } from "telegraf";
import { BotContext } from "@/types/bot.types";
import { FastifyInstance } from "fastify";
import { MeteoraDlmmService } from "@/services/meteora/dlmm.service";
import { createPosition } from "@/db/queries";
import { init } from "@/utils/tx-parser";
import { PublicKey } from "@solana/web3.js";
import { db, pendingTransactions } from "@/db";
import { JobQueueService } from "@/services/job-queue.service";

export function devCommand(
  bot: Telegraf<BotContext>,
  _server: FastifyInstance
) {
  bot.command("dev", async (ctx) => {
    // await init();

    const createId =
      "4yerVcYgjhLoWwNHMJf9NPiEs8ZjzKKsmNp9MfQWSxQwGxjATsAnPi5vcytNRxGfS58YmMpYGqwVKegHriqcD4pX";

    const closeId =
      "3DP1SbuWJbEdJn22gvRiEJzXerpkTAJx5YXrjt3n29PYKw2NnNPr5BzqFkgeQB1iZvkf5hB8AiXNLKa5JkenvdVp";

    const positionAddress = "3qm8JDpEMqDLut2vyJVe1PnjXy4pYHgYpak8jPwSJVXW";
    const poolAddress = "GMeANduWzq5MkgaHgDCihHH8HHak8hvRji1FMKCZwt4j";

    const jobService = new JobQueueService();

    // create
    const createMetadata = JSON.stringify({
      positionAddress,
      poolAddress,
    });

    await db.insert(pendingTransactions).values({
      signature: createId,
      operationType: "CREATE_POSITION",
      userId: ctx.user.id,
      metadata: createMetadata,
      status: "PENDING",
    });

    await jobService.queueTransactionProcessingJob(
      {
        signature: createId,
        operationType: "CREATE_POSITION",
        userId: ctx.user.id,
      },
      0
    );

    return ctx.reply("dev");
  });
}
