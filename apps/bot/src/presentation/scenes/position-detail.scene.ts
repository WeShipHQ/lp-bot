import { Scenes } from "telegraf";
import type { InlineKeyboardMarkup } from "@telegraf/types";
import type { BotContext } from "@/types/bot.types";
import { SCENE_IDS } from "../config/scenes";
import { container, DI_TOKENS } from "@/infrastructure/di/container";
import { GetPositionUseCase } from "@/application/position/get-position.use-case";
import { PositionDetailFormatter } from "../formatters/position-detail.formatter";
import {
  getPositionDetailKeyboard,
  getPositionCloseConfirmKeyboard,
  getClaimFeesConfirmKeyboard,
  getRebalanceConfirmKeyboard,
} from "../keyboards/position-detail-menu";
import {
  PositionDetailCallbacks,
  PositionDetailCallbackPatterns,
} from "../keyboards/position-detail.actions";
import { DISABLE_LINK_PREVIEW } from "../constants/base.constants";
import { divider, loading } from "@/utils/misc";
import { ClosePositionUseCase } from "@/application/position/close-position.use-case";
import { ClaimFeesUseCase } from "@/application/position/claim-fees.use-case";
import { RebalancePositionUseCase } from "@/application/position/rebalance-position.use-case";
import { getSolscanLink } from "@/utils/link";
import type { PositionStatus } from "@/domain/position/position.entity";

interface SceneState {
  positionId?: string;
  positionAddress?: string;
  pairLabel?: string;
  positionStatus?: PositionStatus;
  messageId?: number;
}

interface PositionDetailData {
  text: string;
  pairLabel: string;
  positionId: string;
  positionAddress: string;
  status: PositionStatus;
  keyboard: InlineKeyboardMarkup;
}

type PositionIdentifiers = {
  positionId?: string;
  positionAddress?: string;
};

export const positionDetailScene = new Scenes.BaseScene<BotContext>(
  SCENE_IDS.POSITION_DETAIL_SCENE
);

function getSceneState(ctx: BotContext): SceneState {
  if (!ctx.scene.state || typeof ctx.scene.state !== "object") {
    ctx.scene.state = {};
  }

  const state = ctx.scene.state as SceneState & {
    position?: { id?: string; positionAddress?: string };
  };

  if (state.position && typeof state.position === "object") {
    state.positionId = state.positionId ?? state.position.id;
    state.positionAddress =
      state.positionAddress ?? state.position.positionAddress;
    delete state.position;
  }

  if (!state.positionAddress && (state as any).positionAddress) {
    state.positionAddress = (state as any).positionAddress;
    delete (state as any).positionAddress;
  }

  return state;
}

function buildPositionKeyboard(
  positionId: string,
  status: PositionStatus
): InlineKeyboardMarkup {
  if (status !== "ACTIVE") {
    return {
      inline_keyboard: [
        [
          {
            text: "Refresh",
            callback_data: PositionDetailCallbacks.REFRESH(positionId),
          },
        ],
      ],
    };
  }

  return getPositionDetailKeyboard(positionId);
}

async function loadPositionDetail(
  ctx: BotContext,
  identifiers: PositionIdentifiers
): Promise<PositionDetailData> {
  const useCase = container.get(GetPositionUseCase);
  
  // Determine positionId - fallback to looking it up if only address provided
  let positionId = identifiers.positionId;
  if (!positionId && identifiers.positionAddress) {
    const { IPositionRepository } = await import("@/domain/position/position.repository");
    const posRepo = container.get<IPositionRepository>(DI_TOKENS.PositionRepo);
    const pos = await posRepo.findByPositionAddress(identifiers.positionAddress);
    if (!pos) throw new Error("Position not found");
    positionId = pos.id;
  }
  
  if (!positionId) throw new Error("Position identifier missing");

  const result = await useCase.execute({ positionId });

  if (!result.success || !result.position) {
    throw new Error(result.error ?? "Position not found");
  }

  const userPosition = result.position;

  const view = PositionDetailFormatter.formatUserPosition(userPosition);
  const status = userPosition.status;

  return {
    text: view.text,
    pairLabel: view.pairLabel,
    positionId: userPosition.id,
    positionAddress: userPosition.address,
    status,
    keyboard: buildPositionKeyboard(userPosition.id, status),
  };
}

async function renderPositionDetail(
  ctx: BotContext,
  options: { messageId?: number; chatId?: number } = {}
): Promise<PositionDetailData> {
  const state = getSceneState(ctx);
  const identifiers: PositionIdentifiers = {
    positionId: state.positionId,
    positionAddress: state.positionAddress,
  };

  if (!identifiers.positionId && !identifiers.positionAddress) {
    throw new Error("Position identifier missing");
  }

  const detail = await loadPositionDetail(ctx, identifiers);
  const messageOptions = {
    parse_mode: "Markdown" as const,
    reply_markup: detail.keyboard,
    ...DISABLE_LINK_PREVIEW,
  };

  if (options.messageId && options.chatId) {
    await ctx.telegram.editMessageText(
      options.chatId,
      options.messageId,
      undefined,
      detail.text,
      messageOptions
    );
  } else if (ctx.callbackQuery?.message) {
    await ctx.editMessageText(detail.text, messageOptions);
    options.messageId = ctx.callbackQuery.message.message_id;
    options.chatId = ctx.callbackQuery.message.chat.id;
  } else {
    const sent = await ctx.reply(detail.text, messageOptions);
    options.messageId = sent.message_id;
    options.chatId = sent.chat.id;
  }

  ctx.scene.state = {
    positionId: detail.positionId,
    positionAddress: detail.positionAddress,
    pairLabel: detail.pairLabel,
    positionStatus: detail.status,
    messageId: options.messageId,
  } satisfies SceneState;

  return detail;
}

async function updateMainMessage(ctx: BotContext) {
  const state = getSceneState(ctx);
  const chatId = ctx.chat?.id ?? ctx.callbackQuery?.message?.chat.id;
  if (!state.messageId || !chatId) {
    return;
  }

  try {
    await renderPositionDetail(ctx, {
      messageId: state.messageId,
      chatId,
    });
  } catch (error) {
    console.error("Failed to refresh position detail view", error);
  }
}

positionDetailScene.enter(async (ctx) => {
  const state = getSceneState(ctx);
  if (!state.positionId && !state.positionAddress) {
    await ctx.reply("Position identifier not provided");
    return ctx.scene.leave();
  }

  const chatId = ctx.chat?.id;
  if (!chatId) {
    await ctx.reply("Unable to determine chat context");
    return ctx.scene.leave();
  }

  const loadingMsg = await ctx.reply(loading("Loading position..."), {
    parse_mode: "Markdown",
  });

  try {
    await renderPositionDetail(ctx, {
      messageId: loadingMsg.message_id,
      chatId,
    });
  } catch (error) {
    console.error("Failed to load position details", error);
    await ctx.telegram.editMessageText(
      chatId,
      loadingMsg.message_id,
      undefined,
      "Failed to load position details",
      { parse_mode: "Markdown" }
    );
    return ctx.scene.leave();
  }
});

positionDetailScene.action(
  PositionDetailCallbacks.CLOSE_CONFIRM,
  async (ctx) => {
    const state = getSceneState(ctx);
    if (state.positionStatus && state.positionStatus !== "ACTIVE") {
      await ctx.answerCbQuery("Position is not active", { show_alert: true });
      return;
    }

    await ctx.answerCbQuery();

    if (!state.positionId) {
      await ctx.reply("Position not loaded. Please reopen details.");
      return ctx.scene.leave();
    }

    // const pairLabel = state.pairLabel ?? "this position";
    // const addressLine = state.positionAddress
    //   ? `Position address: \`${state.positionAddress}\`\n\n`
    //   : "\n";

    // const confirmationMessage =
    //   `🔍 *Confirm Position Closure*\n\n` +
    //   `Are you sure you want to close position "${pairLabel}"?\n` +
    //   addressLine +
    //   `This action cannot be undone.`;

    const lines = [
      "❌ Close Position",
      divider(),
      "⚠️ WARNING: This action cannot be undone\n",
      "Are you sure you want to close this position?",
    ];

    await ctx.reply(lines.join("\n"), {
      parse_mode: "Markdown",
      reply_markup: getPositionCloseConfirmKeyboard(),
    });
  }
);

positionDetailScene.action(
  PositionDetailCallbacks.CLOSE_APPROVE,
  async (ctx) => {
    await ctx.answerCbQuery();
    const state = getSceneState(ctx);

    if (!state.positionId) {
      await ctx.reply("Position not loaded. Please reopen details.");
      return ctx.scene.leave();
    }

    if (!ctx.user.walletAddress) {
      await ctx.reply(
        "Wallet not connected. Please connect your wallet first."
      );
      return;
    }

    try {
      await ctx.deleteMessage();
    } catch (error) {
      console.warn("Could not delete confirmation message", error);
    }

    const loadingMsg = await ctx.reply("⏳ Closing position...", {
      parse_mode: "Markdown",
    });

    try {
      const uc = container.get(ClosePositionUseCase);
      const res = await uc.execute({
        userId: ctx.user.id,
        positionId: state.positionId,
        userAddress: ctx.user.walletAddress,
        walletId: ctx.user.walletId,
        closureReason: "user_close",
      });

      if (!res.success) {
        await ctx.telegram.editMessageText(
          loadingMsg.chat.id,
          loadingMsg.message_id,
          undefined,
          res.error ?? "Failed to close position",
          { parse_mode: "Markdown" }
        );
        return;
      }

      const successMessage =
        `✅ *Position Close Initiated*\n\n` +
        `${state.pairLabel ?? "Your position"} close transaction has been submitted to the blockchain.\n\n` +
        `Transaction: [View on Solscan](${getSolscanLink("tx", res.signature ?? "")})\n\n` +
        `⏳ You'll receive a notification with final PnL after confirmation.`;

      await ctx.telegram.editMessageText(
        loadingMsg.chat.id,
        loadingMsg.message_id,
        undefined,
        successMessage,
        {
          parse_mode: "Markdown",
          ...DISABLE_LINK_PREVIEW,
        }
      );

      const nextState = getSceneState(ctx);
      nextState.positionStatus = "CLOSED";
      await updateMainMessage(ctx);
    } catch (error) {
      console.error("Error closing position", error);
      await ctx.telegram.editMessageText(
        loadingMsg.chat.id,
        loadingMsg.message_id,
        undefined,
        "Failed to close position",
        { parse_mode: "Markdown" }
      );
    }
  }
);

positionDetailScene.action(
  PositionDetailCallbacks.CLOSE_DECLINE,
  async (ctx) => {
    await ctx.answerCbQuery();
    try {
      await ctx.deleteMessage();
    } catch (error) {
      console.warn("Could not delete confirmation message", error);
    }
  }
);

positionDetailScene.action(
  PositionDetailCallbacks.CLAIM_CONFIRM,
  async (ctx) => {
    const state = getSceneState(ctx);
    if (state.positionStatus && state.positionStatus !== "ACTIVE") {
      await ctx.answerCbQuery("Position is not active", { show_alert: true });
      return;
    }

    await ctx.answerCbQuery();

    if (!state.positionId) {
      await ctx.reply("Position not loaded. Please reopen details.");
      return ctx.scene.leave();
    }

    // const pairLabel = state.pairLabel ?? "this position";
    // const addressLine = state.positionAddress
    //   ? `Position address: \`${state.positionAddress}\`\n\n`
    //   : "\n";

    // const confirmationMessage =
    //   `💰 *Claim LP Fees*\n\n` +
    //   `Claim all available fees for "${pairLabel}" and swap to SOL?\n` +
    //   addressLine +
    //   `This action will claim all available fees and convert them to SOL.`;

    const lines = [
      "*💸 Claim Position Fees*",
      divider(),
      "This action will claim all available fees and convert them to SOL.",
    ];

    await ctx.reply(lines.join("\n"), {
      parse_mode: "Markdown",
      reply_markup: getClaimFeesConfirmKeyboard(state.positionId),
    });
  }
);

positionDetailScene.action(
  PositionDetailCallbackPatterns.CLAIM_APPROVE,
  async (ctx) => {
    await ctx.answerCbQuery();
    const state = getSceneState(ctx);
    const positionId = ctx.match[1];
    state.positionId = positionId;

    if (!ctx.user.walletAddress) {
      await ctx.reply(
        "Wallet not connected. Please connect your wallet first."
      );
      return;
    }

    try {
      await ctx.deleteMessage();
    } catch (error) {
      console.warn("Could not delete confirmation message", error);
    }

    const loadingMsg = await ctx.reply(loading("Claiming fees..."), {
      parse_mode: "Markdown",
    });

    try {
      const uc = container.get(ClaimFeesUseCase);
      const res = await uc.execute({
        userId: ctx.user.id,
        positionId,
        walletAddress: ctx.user.walletAddress,
        walletId: ctx.user.walletId,
      });

      if (!res.success) {
        await ctx.telegram.editMessageText(
          loadingMsg.chat.id,
          loadingMsg.message_id,
          undefined,
          res.error ?? "Failed to claim fees",
          { parse_mode: "Markdown" }
        );
        return;
      }

      const successMessage =
        `✅ *Fees claimed!*\n\n` +
        `Transaction: [View on Solscan](${getSolscanLink("tx", res.signature ?? "")})`;

      await ctx.telegram.editMessageText(
        loadingMsg.chat.id,
        loadingMsg.message_id,
        undefined,
        successMessage,
        {
          parse_mode: "Markdown",
          ...DISABLE_LINK_PREVIEW,
        }
      );

      await updateMainMessage(ctx);
    } catch (error) {
      console.error("Error claiming fees", error);
      await ctx.telegram.editMessageText(
        loadingMsg.chat.id,
        loadingMsg.message_id,
        undefined,
        "Failed to claim fees",
        { parse_mode: "Markdown" }
      );
    }
  }
);

positionDetailScene.action(
  PositionDetailCallbacks.CLAIM_DECLINE,
  async (ctx) => {
    await ctx.answerCbQuery();
    try {
      await ctx.deleteMessage();
    } catch (error) {
      console.warn("Could not delete confirmation message", error);
    }
  }
);

positionDetailScene.action(
  PositionDetailCallbacks.REBALANCE_CONFIRM,
  async (ctx) => {
    const state = getSceneState(ctx);
    if (state.positionStatus && state.positionStatus !== "ACTIVE") {
      await ctx.answerCbQuery("Position is not active", { show_alert: true });
      return;
    }

    await ctx.answerCbQuery();

    if (!state.positionId) {
      await ctx.reply("Position not loaded. Please reopen details.");
      return ctx.scene.leave();
    }

    const lines = [
      "⚖️ *Rebalance Position*",
      divider("-", 50),
      "Rebalancing Plan:",
      "• Close current position",
      "• Claim fees",
      "• Create new position centered at current price\n",
      "Expected Benefit:",
      "• Return to optimal range",
      "• Resume fee earnings",
      "• Minimize impermanent loss\n",
      "⚠️ Position will be inactive briefly during rebalancing",
    ];

    await ctx.reply(lines.join("\n"), {
      parse_mode: "Markdown",
      reply_markup: getRebalanceConfirmKeyboard(state.positionId),
    });
  }
);

positionDetailScene.action(
  PositionDetailCallbackPatterns.REBALANCE_APPROVE,
  async (ctx) => {
    await ctx.answerCbQuery();
    const state = getSceneState(ctx);
    const positionId = ctx.match[1];
    state.positionId = positionId;

    if (!ctx.user.walletAddress) {
      await ctx.reply(
        "Wallet not connected. Please connect your wallet first."
      );
      return;
    }

    try {
      await ctx.deleteMessage();
    } catch (error) {
      console.warn("Could not delete confirmation message", error);
    }

    const loadingMsg = await ctx.reply(loading("Rebalancing position..."), {
      parse_mode: "Markdown",
    });

    try {
      const uc = container.get(RebalancePositionUseCase);
      const res = await uc.execute({
        userId: ctx.user.id,
        positionId,
        userAddress: ctx.user.walletAddress,
        walletId: ctx.user.walletId,
        metadata: {
          trigger: "manual",
          rangeInterval: ctx.user.getPreferences().balancedPositionBinRange,
        },
      });

      if (!res.success) {
        await ctx.telegram.editMessageText(
          loadingMsg.chat.id,
          loadingMsg.message_id,
          undefined,
          `❌ *Rebalance Failed*\n\n${res.error ?? "Unknown error"}`,
          { parse_mode: "Markdown" }
        );
        return;
      }

      const successMessage =
        `✅ *Position Rebalance Initiated*\n\n` +
        `Transaction: [View on Solscan](${getSolscanLink("tx", res.signature ?? "")})\n\n` +
        `⏳ You'll receive a notification once rebalance completes.`;

      await ctx.telegram.editMessageText(
        loadingMsg.chat.id,
        loadingMsg.message_id,
        undefined,
        successMessage,
        {
          parse_mode: "Markdown",
          ...DISABLE_LINK_PREVIEW,
        }
      );

      const nextState = getSceneState(ctx);
      nextState.positionStatus = "REBALANCING";
      await updateMainMessage(ctx);
    } catch (error) {
      console.error("Error rebalancing position", error);
      await ctx.telegram.editMessageText(
        loadingMsg.chat.id,
        loadingMsg.message_id,
        undefined,
        "❌ Failed to rebalance position. Please try again.",
        { parse_mode: "Markdown" }
      );
    }
  }
);

positionDetailScene.action(
  PositionDetailCallbacks.REBALANCE_DECLINE,
  async (ctx) => {
    await ctx.answerCbQuery();
    try {
      await ctx.deleteMessage();
    } catch (error) {
      console.warn("Could not delete confirmation message", error);
    }
  }
);

positionDetailScene.action(
  PositionDetailCallbackPatterns.SETTINGS,
  async (ctx) => {
    await ctx.answerCbQuery();
    const positionId = ctx.match[1];
    const state = getSceneState(ctx);
    state.positionId = positionId;
    await ctx.reply(
      `⚙️ Rebalancing settings for position ${positionId} are coming soon.`
    );
  }
);

positionDetailScene.action(
  PositionDetailCallbackPatterns.TAKE_PROFIT,
  async (ctx) => {
    await ctx.answerCbQuery();
    const positionId = ctx.match[1];
    const state = getSceneState(ctx);
    state.positionId = positionId;
    await ctx.reply(
      `📈 Take-profit configuration for position ${positionId} is coming soon.`
    );
  }
);

positionDetailScene.action(
  PositionDetailCallbackPatterns.STOP_LOSS,
  async (ctx) => {
    await ctx.answerCbQuery();
    const positionId = ctx.match[1];
    const state = getSceneState(ctx);
    state.positionId = positionId;
    await ctx.reply(
      `📉 Stop-loss configuration for position ${positionId} is coming soon.`
    );
  }
);

positionDetailScene.action(
  PositionDetailCallbackPatterns.REFRESH,
  async (ctx) => {
    const positionId = ctx.match[1];
    const state = getSceneState(ctx);
    state.positionId = positionId;

    await ctx.answerCbQuery("Refreshing position…");

    try {
      const message = ctx.callbackQuery?.message;
      await renderPositionDetail(ctx, {
        messageId: message?.message_id,
        chatId: message?.chat.id,
      });
    } catch (error) {
      console.error("Failed to refresh position details", error);
      await ctx.reply("Failed to refresh position details. Please try again.");
    }
  }
);
