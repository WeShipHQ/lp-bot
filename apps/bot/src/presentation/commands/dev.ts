import { Telegraf } from "telegraf";
import { BotContext } from "@/types/bot.types";
import { FastifyInstance } from "fastify";
import { DISABLE_LINK_PREVIEW } from "../constants/base.constants";
import { SCENE_IDS } from "../config/scenes";
import { init } from "@/utils/tx-parser";

export function devCommand(
  bot: Telegraf<BotContext>,
  _server: FastifyInstance
) {
  bot.command("dev", async (ctx) => {
    init();
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
