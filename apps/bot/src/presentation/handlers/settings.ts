import { BotContext } from "@/types/bot.types";
import { FastifyInstance } from "fastify";
import { SettingsFormatter } from "../formatters/settings.formatter";
import { 
  getSettingsKeyboard, 
  getScheduleKeyboard,
  getBinRangeKeyboard,
  getRebalanceThresholdKeyboard,
  getStopLossKeyboard,
  getTakeProfitKeyboard,
  getSlippageKeyboard
} from "../keyboards/settings-menu";
import { container } from "@/infrastructure/di/container";
import { GetUserSettingsUseCase } from "@/application/settings/get-user-settings.use-case";
import { UpdateUserSettingUseCase } from "@/application/settings/update-user-setting.use-case";
import { 
  ST_CALLBACKS, 
  ST_PATTERNS,
  RebalanceSchedule,
  BinRange,
  RiskPercentage,
  SlippageBps
} from "../constants/settings.constants";

export async function settingsHandler(
  ctx: BotContext,
  _server: FastifyInstance
) {
  const telegramId = ctx.user.telegramId;
  const getter = container.get(GetUserSettingsUseCase);
  const settings = await getter.execute(telegramId);

  const message = SettingsFormatter.formatOverview(settings);

  await ctx.reply(message, {
    reply_markup: getSettingsKeyboard(settings),
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
    // Handle menu navigation
    if (data === 'schedule_menu') {
      const getter = container.get(GetUserSettingsUseCase);
      const settings = await getter.execute(ctx.user.telegramId);
      const keyboard = getScheduleKeyboard(settings.rebalancingSchedule as RebalanceSchedule);
      
      await ctx.answerCbQuery();
      await ctx.reply("⏰ **Rebalancing Schedule**\n\nChoose how often to check for rebalancing:", {
        reply_markup: keyboard
      });
      return;
    }

    if (data === 'threshold_menu') {
      const getter = container.get(GetUserSettingsUseCase);
      const settings = await getter.execute(ctx.user.telegramId);
      const keyboard = getRebalanceThresholdKeyboard(settings.rebalanceThreshold);
      
      await ctx.answerCbQuery();
      await ctx.reply("🔄 **Rebalance Threshold**\n\nSet the percentage that triggers rebalancing:", {
        reply_markup: keyboard
      });
      return;
    }

    if (data === 'bin_menu') {
      const getter = container.get(GetUserSettingsUseCase);
      const settings = await getter.execute(ctx.user.telegramId);
      const keyboard = getBinRangeKeyboard(settings.defaultBinRange as BinRange | number);
      
      await ctx.answerCbQuery();
      await ctx.reply("📊 **Default Bin Range**\n\nSet the default bin range for DLMM positions:", {
        reply_markup: keyboard
      });
      return;
    }

    if (data === 'sl_menu') {
      const getter = container.get(GetUserSettingsUseCase);
      const settings = await getter.execute(ctx.user.telegramId);
      const keyboard = getStopLossKeyboard(settings.stopLossPercentage as RiskPercentage | number | null);
      
      await ctx.answerCbQuery();
      await ctx.reply("⚠️ **Stop Loss**\n\nSet automatic position closure on price drop:", {
        reply_markup: keyboard
      });
      return;
    }

    if (data === 'tp_menu') {
      const getter = container.get(GetUserSettingsUseCase);
      const settings = await getter.execute(ctx.user.telegramId);
      const keyboard = getTakeProfitKeyboard(settings.takeProfitPercentage as RiskPercentage | number | null);
      
      await ctx.answerCbQuery();
      await ctx.reply("🎯 **Take Profit**\n\nSet automatic position closure on price rise:", {
        reply_markup: keyboard
      });
      return;
    }

    if (data === 'slippage_menu') {
      const getter = container.get(GetUserSettingsUseCase);
      const settings = await getter.execute(ctx.user.telegramId);
      const keyboard = getSlippageKeyboard(settings.slippagePercentage as SlippageBps | number);
      
      await ctx.answerCbQuery();
      await ctx.reply("💰 **Slippage Tolerance**\n\nSet maximum price change during trades:", {
        reply_markup: keyboard
      });
      return;
    }

    if (data === 'back_to_main') {
      const getter = container.get(GetUserSettingsUseCase);
      const settings = await getter.execute(ctx.user.telegramId);
      const message = SettingsFormatter.formatOverview(settings);
      const keyboard = getSettingsKeyboard(settings);

      await ctx.answerCbQuery();
      await ctx.reply(message, { reply_markup: keyboard });
      return;
    }

    // Handle refresh
    if (ST_PATTERNS.refresh.test(data)) {
      const getter = container.get(GetUserSettingsUseCase);
      const s = await getter.execute(ctx.user.telegramId);
      const text = SettingsFormatter.formatOverview(s);
      const keyboard = getSettingsKeyboard(s);

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

    // Handle legacy settings
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
      const level = data.split(":").pop() as "low" | "medium" | "high";
      const updater = container.get(UpdateUserSettingUseCase);
      await updater.setGasPriority(ctx.user.telegramId, level);

      const getter = container.get(GetUserSettingsUseCase);
      const s = await getter.execute(ctx.user.telegramId);
      const text = SettingsFormatter.formatOverview(s);

      await ctx.answerCbQuery("⛽ Gas priority updated");
      await updateSettingsMessage(ctx, text, s);
      return;
    }

    // Handle toggle auto rebalance
    if (ST_PATTERNS.toggleRebalance.test(data)) {
      const updater = container.get(UpdateUserSettingUseCase);
      const newState = await updater.toggleAutoRebalance(ctx.user.telegramId);

      const getter = container.get(GetUserSettingsUseCase);
      const s = await getter.execute(ctx.user.telegramId);
      const text = SettingsFormatter.formatOverview(s);

      await ctx.answerCbQuery(`🔄 Auto rebalance ${newState ? 'enabled' : 'disabled'}`);
      await updateSettingsMessage(ctx, text, s);
      return;
    }

    // Handle toggle auto convert
    if (ST_PATTERNS.toggleAutoConvert.test(data)) {
      const updater = container.get(UpdateUserSettingUseCase);
      const newState = await updater.toggleAutoConvertToSol(ctx.user.telegramId);

      const getter = container.get(GetUserSettingsUseCase);
      const s = await getter.execute(ctx.user.telegramId);
      const text = SettingsFormatter.formatOverview(s);

      await ctx.answerCbQuery(`💰 Auto convert ${newState ? 'enabled' : 'disabled'}`);
      await updateSettingsMessage(ctx, text, s);
      return;
    }

    // Handle rebalance schedule
    const scheduleMatch = data.match(ST_PATTERNS.scheduleSet);
    if (scheduleMatch) {
      const value = data.split(":").pop() as RebalanceSchedule | string;
      
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
      const text = SettingsFormatter.formatOverview(s);

      await ctx.answerCbQuery("⏰ Schedule updated");
      await updateSettingsMessage(ctx, text, s);
      return;
    }

    // Handle rebalance threshold
    const thresholdMatch = data.match(ST_PATTERNS.rebalanceThreshold);
    if (thresholdMatch) {
      const value = data.split(":").pop() as string;
      
      if (value === "custom") {
        await ctx.answerCbQuery();
        ctx.session = { ...ctx.session, settingsState: { step: "threshold_input" } };
        await ctx.reply(SettingsFormatter.promptCustomRebalanceThreshold(), {
          reply_markup: { force_reply: true },
        });
        return;
      }

      const updater = container.get(UpdateUserSettingUseCase);
      await updater.setRebalanceThreshold(ctx.user.telegramId, value);

      const getter = container.get(GetUserSettingsUseCase);
      const s = await getter.execute(ctx.user.telegramId);
      const text = SettingsFormatter.formatOverview(s);

      await ctx.answerCbQuery("🔄 Threshold updated");
      await updateSettingsMessage(ctx, text, s);
      return;
    }

    // Handle bin range
    const binMatch = data.match(ST_PATTERNS.binRange);
    if (binMatch) {
      const value = data.split(":").pop() as BinRange | string;
      
      if (value === "custom") {
        await ctx.answerCbQuery();
        ctx.session = { ...ctx.session, settingsState: { step: "bin_range_input" } };
        await ctx.reply(SettingsFormatter.promptCustomBinRange(), {
          reply_markup: { force_reply: true },
        });
        return;
      }

      const updater = container.get(UpdateUserSettingUseCase);
      await updater.setDefaultBinRange(ctx.user.telegramId, parseInt(value));

      const getter = container.get(GetUserSettingsUseCase);
      const s = await getter.execute(ctx.user.telegramId);
      const text = SettingsFormatter.formatOverview(s);

      await ctx.answerCbQuery("📊 Bin range updated");
      await updateSettingsMessage(ctx, text, s);
      return;
    }

    // Handle stop loss
    const slMatch = data.match(ST_PATTERNS.stopLoss);
    if (slMatch) {
      const value = data.split(":").pop() as RiskPercentage | string;
      
      if (value === "custom") {
        await ctx.answerCbQuery();
        ctx.session = { ...ctx.session, settingsState: { step: "stop_loss_input" } };
        await ctx.reply(SettingsFormatter.promptCustomStopLoss(), {
          reply_markup: { force_reply: true },
        });
        return;
      }

      const updater = container.get(UpdateUserSettingUseCase);
      await updater.setStopLossPercentage(ctx.user.telegramId, value === "disabled" ? "disabled" : value);

      const getter = container.get(GetUserSettingsUseCase);
      const s = await getter.execute(ctx.user.telegramId);
      const text = SettingsFormatter.formatOverview(s);

      await ctx.answerCbQuery("⚠️ Stop loss updated");
      await updateSettingsMessage(ctx, text, s);
      return;
    }

    // Handle take profit
    const tpMatch = data.match(ST_PATTERNS.takeProfit);
    if (tpMatch) {
      const value = data.split(":").pop() as RiskPercentage | string;
      
      if (value === "custom") {
        await ctx.answerCbQuery();
        ctx.session = { ...ctx.session, settingsState: { step: "take_profit_input" } };
        await ctx.reply(SettingsFormatter.promptCustomTakeProfit(), {
          reply_markup: { force_reply: true },
        });
        return;
      }

      const updater = container.get(UpdateUserSettingUseCase);
      await updater.setTakeProfitPercentage(ctx.user.telegramId, value === "disabled" ? "disabled" : value);

      const getter = container.get(GetUserSettingsUseCase);
      const s = await getter.execute(ctx.user.telegramId);
      const text = SettingsFormatter.formatOverview(s);

      await ctx.answerCbQuery("🎯 Take profit updated");
      await updateSettingsMessage(ctx, text, s);
      return;
    }

    // Handle slippage
    const slippageMatch = data.match(ST_PATTERNS.slippage);
    if (slippageMatch) {
      const value = data.split(":").pop() as SlippageBps | string;
      
      if (value === "custom") {
        await ctx.answerCbQuery();
        ctx.session = { ...ctx.session, settingsState: { step: "slippage_input" } };
        await ctx.reply(SettingsFormatter.promptCustomSlippage(), {
          reply_markup: { force_reply: true },
        });
        return;
      }

      const updater = container.get(UpdateUserSettingUseCase);
      await updater.setSlippagePercentage(ctx.user.telegramId, parseInt(value));

      const getter = container.get(GetUserSettingsUseCase);
      const s = await getter.execute(ctx.user.telegramId);
      const text = SettingsFormatter.formatOverview(s);

      await ctx.answerCbQuery("💰 Slippage updated");
      await updateSettingsMessage(ctx, text, s);
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
      const text = SettingsFormatter.formatOverview(s);
      await ctx.reply(text, { reply_markup: getSettingsKeyboard(s) });
      return true;
    }

    if (state.step === "schedule_input") {
      const raw = messageText.trim();
      const m = /^(\d+)\s*(m|h|d)$/i.exec(raw);
      if (!m) {
        await ctx.reply(
          "❌ Invalid schedule. Please enter values like 5m, 15m, 1h, 3h, or type /cancel to exit."
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
      const text = SettingsFormatter.formatOverview(s);
      await ctx.reply(text, { reply_markup: getSettingsKeyboard(s) });
      return true;
    }

    if (state.step === "threshold_input") {
      const raw = messageText.trim();
      const updater = container.get(UpdateUserSettingUseCase);
      await updater.setCustomRebalanceThreshold(ctx.user.telegramId, raw);

      delete ctx.session?.settingsState;
      await ctx.reply(SettingsFormatter.updated("Rebalance threshold updated."));

      const getter = container.get(GetUserSettingsUseCase);
      const s = await getter.execute(ctx.user.telegramId);
      const text = SettingsFormatter.formatOverview(s);
      await ctx.reply(text, { reply_markup: getSettingsKeyboard(s) });
      return true;
    }

    if (state.step === "bin_range_input") {
      const raw = messageText.trim();
      const updater = container.get(UpdateUserSettingUseCase);
      await updater.setCustomBinRange(ctx.user.telegramId, raw);

      delete ctx.session?.settingsState;
      await ctx.reply(SettingsFormatter.updated("Default bin range updated."));

      const getter = container.get(GetUserSettingsUseCase);
      const s = await getter.execute(ctx.user.telegramId);
      const text = SettingsFormatter.formatOverview(s);
      await ctx.reply(text, { reply_markup: getSettingsKeyboard(s) });
      return true;
    }

    if (state.step === "stop_loss_input") {
      const raw = messageText.trim();
      const updater = container.get(UpdateUserSettingUseCase);
      await updater.setCustomStopLoss(ctx.user.telegramId, raw);

      delete ctx.session?.settingsState;
      await ctx.reply(SettingsFormatter.updated("Stop loss updated."));

      const getter = container.get(GetUserSettingsUseCase);
      const s = await getter.execute(ctx.user.telegramId);
      const text = SettingsFormatter.formatOverview(s);
      await ctx.reply(text, { reply_markup: getSettingsKeyboard(s) });
      return true;
    }

    if (state.step === "take_profit_input") {
      const raw = messageText.trim();
      const updater = container.get(UpdateUserSettingUseCase);
      await updater.setCustomTakeProfit(ctx.user.telegramId, raw);

      delete ctx.session?.settingsState;
      await ctx.reply(SettingsFormatter.updated("Take profit updated."));

      const getter = container.get(GetUserSettingsUseCase);
      const s = await getter.execute(ctx.user.telegramId);
      const text = SettingsFormatter.formatOverview(s);
      await ctx.reply(text, { reply_markup: getSettingsKeyboard(s) });
      return true;
    }

    if (state.step === "slippage_input") {
      const raw = messageText.trim();
      const updater = container.get(UpdateUserSettingUseCase);
      await updater.setCustomSlippage(ctx.user.telegramId, raw);

      delete ctx.session?.settingsState;
      await ctx.reply(SettingsFormatter.updated("Slippage updated."));

      const getter = container.get(GetUserSettingsUseCase);
      const s = await getter.execute(ctx.user.telegramId);
      const text = SettingsFormatter.formatOverview(s);
      await ctx.reply(text, { reply_markup: getSettingsKeyboard(s) });
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

// Helper function to update settings message
async function updateSettingsMessage(ctx: BotContext, text: string, settings: any) {
  const messageId = ctx.callbackQuery?.message?.message_id;
  const chatId = ctx.chat?.id;
  if (messageId && chatId) {
    try {
      await ctx.telegram.editMessageText(chatId, messageId, undefined, text, {
        reply_markup: getSettingsKeyboard(settings),
      });
    } catch {
      // If edit fails, send new message
      await ctx.reply(text, { reply_markup: getSettingsKeyboard(settings) });
    }
  } else {
    await ctx.reply(text, { reply_markup: getSettingsKeyboard(settings) });
  }
}