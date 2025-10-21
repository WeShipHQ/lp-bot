import { BotContext } from "@/types/bot.types";
import { FastifyInstance } from "fastify";
import { SettingsFormatter } from "../formatters/settings.formatter";
import { getSettingsKeyboard } from "../keyboards/settings-menu";
import { container } from "@/infrastructure/di/container";
import { GetUserSettingsUseCase } from "@/application/settings/get-user-settings.use-case";
import { UpdateUserSettingUseCase } from "@/application/settings/update-user-setting.use-case";
import { ST_CALLBACKS, ST_PATTERNS, GasPriority } from "../constants/settings.constants";

export async function settingsHandler(
  ctx: BotContext,
  _server: FastifyInstance
) {
  const telegramId = ctx.user.telegramId;
  const getter = container.get(GetUserSettingsUseCase);
  const settings = await getter.execute(telegramId);

  const message = SettingsFormatter.formatOverview({
    vaultAddress: settings.vaultAddress || undefined,
    gasPriority: settings.gasPriority,
    rebalancingSchedule: String(settings.rebalancingSchedule),
  });

  await ctx.reply(message, {
    reply_markup: getSettingsKeyboard({
      vaultAddress: settings.vaultAddress || undefined,
      gasPriority: settings.gasPriority,
      rebalancingSchedule: String(settings.rebalancingSchedule),
    }),
  });
}

export async function handleSettingsCallback(
  ctx: BotContext,
  _server: FastifyInstance
) {
  const data =
    ctx.callbackQuery && "data" in ctx.callbackQuery
      ? String(ctx.callbackQuery.data ?? "")
      : "";

  if (!data) {
    await ctx.answerCbQuery();
    return;
  }

  try {
    if (ST_PATTERNS.refresh.test(data)) {
      const getter = container.get(GetUserSettingsUseCase);
      const s = await getter.execute(ctx.user.telegramId);
      const text = SettingsFormatter.formatOverview({
        vaultAddress: s.vaultAddress || undefined,
        gasPriority: s.gasPriority,
        rebalancingSchedule: String(s.rebalancingSchedule),
      });
      const keyboard = getSettingsKeyboard({
        vaultAddress: s.vaultAddress || undefined,
        gasPriority: s.gasPriority,
        rebalancingSchedule: String(s.rebalancingSchedule),
      });

      const messageId = ctx.callbackQuery?.message?.message_id;
      const chatId = ctx.chat?.id;
      if (messageId && chatId) {
        try {
          await ctx.telegram.editMessageText(chatId, messageId, undefined, text, {
            reply_markup: keyboard,
          });
          await ctx.answerCbQuery("🔄 Refreshed");
          return;
        } catch {}
      }

      await ctx.reply(text, { reply_markup: keyboard });
      await ctx.answerCbQuery();
      return;
    }

    if (ST_PATTERNS.vaultSet.test(data)) {
      await ctx.answerCbQuery();
      ctx.session = { ...ctx.session, settingsState: { step: "vault_input" } };
      await ctx.reply(SettingsFormatter.promptVaultAddress(), {
        reply_markup: { force_reply: true },
      });
      return;
    }

    const gasMatch = data.match(ST_PATTERNS.gasSet);
    if (gasMatch) {
      const level = data.split(":").pop() as GasPriority;
      const updater = container.get(UpdateUserSettingUseCase);
      await updater.setGasPriority(ctx.user.telegramId, level);

      const getter = container.get(GetUserSettingsUseCase);
      const s = await getter.execute(ctx.user.telegramId);
      const text = SettingsFormatter.formatOverview({
        vaultAddress: s.vaultAddress || undefined,
        gasPriority: s.gasPriority,
        rebalancingSchedule: String(s.rebalancingSchedule),
      });

      await ctx.answerCbQuery("⛽ Gas priority updated");
      const messageId = ctx.callbackQuery?.message?.message_id;
      const chatId = ctx.chat?.id;
      try {
        if (messageId && chatId) {
          await ctx.telegram.editMessageText(chatId, messageId, undefined, text, {
            reply_markup: getSettingsKeyboard(s as any),
          });
          return;
        }
      } catch {}

      await ctx.reply(text, { reply_markup: getSettingsKeyboard(s as any) });
      return;
    }

    const scheduleMatch = data.match(ST_PATTERNS.scheduleSet);
    if (scheduleMatch) {
      const value = data.split(":").pop() as string;
      if (value === "custom") {
        await ctx.answerCbQuery();
        ctx.session = { ...ctx.session, settingsState: { step: "schedule_input" } };
        await ctx.reply(SettingsFormatter.promptCustomSchedule(), {
          reply_markup: { force_reply: true },
        });
        return;
      }

      const updater = container.get(UpdateUserSettingUseCase);
      await updater.setRebalancingSchedule(ctx.user.telegramId, value);

      const getter = container.get(GetUserSettingsUseCase);
      const s = await getter.execute(ctx.user.telegramId);
      const text = SettingsFormatter.formatOverview({
        vaultAddress: s.vaultAddress || undefined,
        gasPriority: s.gasPriority,
        rebalancingSchedule: String(s.rebalancingSchedule),
      });

      await ctx.answerCbQuery("🕒 Schedule updated");
      const messageId = ctx.callbackQuery?.message?.message_id;
      const chatId = ctx.chat?.id;
      try {
        if (messageId && chatId) {
          await ctx.telegram.editMessageText(chatId, messageId, undefined, text, {
            reply_markup: getSettingsKeyboard(s as any),
          });
          return;
        }
      } catch {}

      await ctx.reply(text, { reply_markup: getSettingsKeyboard(s as any) });
      return;
    }

    await ctx.answerCbQuery("❌ Unknown action");
  } catch (error: any) {
    console.error("Settings callback error:", error);
    await ctx.answerCbQuery(
      error?.message ? `❌ ${error.message}` : "❌ Failed to process request"
    );
  }
}

export async function handleSettingsInput(
  ctx: BotContext,
  _server: FastifyInstance
) {
  const messageText = ctx.message && "text" in ctx.message ? ctx.message.text : undefined;
  const state = ctx.session?.settingsState;
  if (!state) return false;
  if (!messageText) return true; // ignore non-text within settings flow

  try {
    if (state.step === "vault_input") {
      const addr = messageText.trim();
      const updater = container.get(UpdateUserSettingUseCase);
      await updater.setVaultAddress(ctx.user.telegramId, addr);

      delete ctx.session?.settingsState;
      await ctx.reply(SettingsFormatter.updated("Vault address updated."));

      const getter = container.get(GetUserSettingsUseCase);
      const s = await getter.execute(ctx.user.telegramId);
      const text = SettingsFormatter.formatOverview({
        vaultAddress: s.vaultAddress || undefined,
        gasPriority: s.gasPriority,
        rebalancingSchedule: String(s.rebalancingSchedule),
      });
      await ctx.reply(text, { reply_markup: getSettingsKeyboard(s as any) });
      return true;
    }

    if (state.step === "schedule_input") {
      const raw = messageText.trim();
      const m = /^(\d+)\s*(m|h|d)$/i.exec(raw);
      if (!m) {
        await ctx.reply(
          "❌ Invalid schedule. Please enter values like 30m, 2h, or 1d, or type /cancel to exit."
        );
        return true;
      }

      const value = `${m[1]}${m[2].toLowerCase()}`;
      const updater = container.get(UpdateUserSettingUseCase);
      await updater.setRebalancingSchedule(ctx.user.telegramId, value);

      delete ctx.session?.settingsState;
      await ctx.reply(SettingsFormatter.updated("Rebalancing schedule updated."));

      const getter = container.get(GetUserSettingsUseCase);
      const s = await getter.execute(ctx.user.telegramId);
      const text = SettingsFormatter.formatOverview({
        vaultAddress: s.vaultAddress || undefined,
        gasPriority: s.gasPriority,
        rebalancingSchedule: String(s.rebalancingSchedule),
      });
      await ctx.reply(text, { reply_markup: getSettingsKeyboard(s as any) });
      return true;
    }

    return false;
  } catch (error: any) {
    console.error("Settings input error:", error);
    await ctx.reply(
      error?.message ? `❌ ${error.message}` : "❌ Failed to update settings"
    );
    delete ctx.session?.settingsState;
    return true;
  }
}
