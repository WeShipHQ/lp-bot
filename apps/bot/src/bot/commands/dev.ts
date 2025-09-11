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
import { getSolscanLink } from "@/utils/link";
import { link } from "../utils/text-formatters";
import { escapers } from "@telegraf/entity";
import { DISABLE_LINK_PREVIEW } from "../handlers";

export function devCommand(
  bot: Telegraf<BotContext>,
  _server: FastifyInstance
) {
  bot.command("dev", async (ctx) => {
    // await ctx.scene.enter(SCENE_IDS.CREATE_POSITION_SCENE, {
    //   poolAddress: "BGm1tav58oGcsQJehL9WXBFXF7D27vZsKefj4xJKD5Y",
    // });

    await ctx.scene.enter(SCENE_IDS.POSITION_DETAIL_SCENE, {
      positionAddress: "gwSUe1nAfV752b7ihfXPxQVHKvCQW9nKyWHdekArFCW",
    });

    // await positionService.checkClaimFeeTx(
    //   "2YUKK6Hy6VZcDQr7ZZh52uCV95Skncs8UR4XFU6Pbhe8ddgBDCASQct4UMKq2YpwgmUizwLCqBMFxBQPr36whb7Z"
    // );

    // const meteoraUrl = link(
    //   "Meteora",
    //   getSolscanLink(
    //     "tx",
    //     "2YUKK6Hy6VZcDQr7ZZh52uCV95Skncs8UR4XFU6Pbhe8ddgBDCASQct4UMKq2YpwgmUizwLCqBMFxBQPr36whb7Z"
    //   )
    // );

    // return ctx.replyWithMarkdown(
    //   `Dev command  ${meteoraUrl}`,
    //   DISABLE_LINK_PREVIEW
    // );
  });
}
