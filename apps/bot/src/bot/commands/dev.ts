import { Telegraf } from "telegraf";
import { BotContext } from "@/types/bot.types";
import { FastifyInstance } from "fastify";
import { MeteoraDlmmService } from "@/services/meteora/dlmm.service";
import { createPosition } from "@/db/queries";
import { init } from "@/utils/tx-parser";
import { PublicKey } from "@solana/web3.js";
import { db, pendingTransactions } from "@/db";
import { JobQueueService } from "@/services/job-queue.service";
import { PositionService } from "@/services/position.service";
import { SCENE_IDS } from "../config/scenes";

export function devCommand(
  bot: Telegraf<BotContext>,
  _server: FastifyInstance
) {
  bot.command("dev", async (ctx) => {
    // await init();

    // const createId =
    //   "4yerVcYgjhLoWwNHMJf9NPiEs8ZjzKKsmNp9MfQWSxQwGxjATsAnPi5vcytNRxGfS58YmMpYGqwVKegHriqcD4pX";

    // const closeId =
    //   "3DP1SbuWJbEdJn22gvRiEJzXerpkTAJx5YXrjt3n29PYKw2NnNPr5BzqFkgeQB1iZvkf5hB8AiXNLKa5JkenvdVp";

    // const positionAddress = "3qm8JDpEMqDLut2vyJVe1PnjXy4pYHgYpak8jPwSJVXW";
    // const poolAddress = "GMeANduWzq5MkgaHgDCihHH8HHak8hvRji1FMKCZwt4j";

    const positionService = new PositionService();

    // await positionService.createBalancedPosition(
    //   ctx.user,
    //   poolAddress,
    //   "spot",
    //   10000000
    // );

    // close position
    // const closePosId =
    //   "3DP1SbuWJbEdJn22gvRiEJzXerpkTAJx5YXrjt3n29PYKw2NnNPr5BzqFkgeQB1iZvkf5hB8AiXNLKa5JkenvdVp";
    const posAddress = "G8Rrhq9mNjjPakapTqbT9jC4KoQDHpqrfiJwEMAtgPZg";

    // await positionService.closePositionV2(ctx.user, posAddress, posAddress);

    await ctx.scene.enter(SCENE_IDS.POSITION_DETAIL_SCENE, {
      positionAddress: posAddress,
    });
  });
}
