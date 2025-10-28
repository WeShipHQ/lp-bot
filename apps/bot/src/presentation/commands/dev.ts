import { Telegraf } from "telegraf";
import { BotContext } from "@/types/bot.types";
import { FastifyInstance } from "fastify";
import { DISABLE_LINK_PREVIEW } from "../constants/base.constants";
import { MeteoraDlmmService } from "@/adapters/dex/meteora";
import { container } from "@/infrastructure/di/container";
import { JobQueueService } from "@/infrastructure/jobs/job-queue.service";
import { JOB_NOTIFICATION } from "@/infrastructure/jobs/job-definitions";
import { getPositionDeeplink, link } from "@/utils/misc";
import { logger } from "@/utils/logger";
// import { SCENE_IDS } from "../config/scenes";
// import { init } from "@/utils/tx-parser";
// import { LAMPORTS_PER_SOL, PublicKey, SystemProgram } from "@solana/web3.js";
// import { WalletService } from "@/services/wallet.service";
// import { MeteoraAdapter } from "@/adapters/dex/meteora.adapter";
// import { container } from "@/infrastructure/di/container";

export function devCommand(
  bot: Telegraf<BotContext>,
  _server: FastifyInstance
) {
  bot.command("dev", async (ctx) => {
    logger.info(
      {
        segmentId: "currentSegment.id",
        segmentPnlUSD: "123",
        segmentPnlPercentage: "234",
      },
      "hello"
    );

    return ctx.replyWithMarkdown(`Dev command`, DISABLE_LINK_PREVIEW);

    // return ctx.scene.enter(SCENE_IDS.CREATE_POSITION_SCENE, {
    //   poolAddress: "5rCf1DM8LjKTw4YqhnoLcngyZYeNnQqztScTogYHAS6",
    //   dex: "meteora",
    // });

    // return ctx.scene.enter(SCENE_IDS.POSITION_DETAIL_SCENE, {
    //   positionId: "44c66c3a-7c87-4a4c-aabb-535a98e8996e",
    //   // positionAddress: "HNpsi26Am2ZsW94sfkAoM8onqkQsXkkCxYDsPLSUECJe",
    // });
  });
}
