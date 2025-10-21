import { FastifyInstance } from "fastify";
import { BotContext } from "@/types/bot.types";
import { MessageService } from "@/services/message.service";
import { userService } from "@/services/user.service";
import { twoFactorAuthService } from "@/services/two-factor-auth.service";
import { WalletService } from "@/services/wallet.service";
import { WALLET_CALLBACKS } from "@/presentation/constants/wallet.callbacks";

export async function handleTwoFactorInput(ctx: BotContext, _server: FastifyInstance) {
  try {
    const messageText = ctx.message && 'text' in ctx.message ? ctx.message.text : undefined;

    if (ctx.session?.twoFactorVerification?.step !== "waiting_for_code") {
      return false;
    }

    if (!messageText) {
      await ctx.reply(MessageService.getErrorMessage("Please enter your 6-digit authentication code or type /cancel to cancel."));
      return true;
    }

    if (messageText.toLowerCase() === '/cancel') {
      delete ctx.session?.twoFactorVerification;
      await ctx.reply("✅ 2FA verification cancelled.");
      return true;
    }

    const verificationState = ctx.session?.twoFactorVerification;
    if (!verificationState) return false;

    const isValid = await verifyTwoFactorCode(ctx, messageText.trim());
    if (isValid && verificationState.action === "export_private_key") {
      await handleWalletExport(ctx);
    }

    return true;
  } catch (error) {
    await ctx.reply(MessageService.getErrorMessage("Error verifying 2FA code. Please try again."));
    return true;
  }
}

async function verifyTwoFactorCode(ctx: BotContext, code: string): Promise<boolean> {
  const verificationState = ctx.session?.twoFactorVerification;
  if (!verificationState) return false;

  const userInfo = await userService.getUserByTelegramId(ctx.user.telegramId as string);
  if (!userInfo?.twoFactorSecret) {
    await ctx.reply(MessageService.getErrorMessage("2FA not properly configured. Please contact support."));
    delete ctx.session?.twoFactorVerification;
    return false;
  }

  const verification = twoFactorAuthService.verifyToken(userInfo.twoFactorSecret, code);

  if (verification.isValid) {
    delete ctx.session?.twoFactorVerification;
    return true;
  } else {
    verificationState.attempts = (verificationState.attempts || 0) + 1;
    const remainingAttempts = (verificationState.maxAttempts || 3) - verificationState.attempts;

    if (remainingAttempts <= 0) {
      delete ctx.session?.twoFactorVerification;
      await ctx.reply(MessageService.getTwoFactorTooManyAttemptsMessage(), { parse_mode: "Markdown" });
    } else {
      await ctx.reply(MessageService.getTwoFactorInvalidCodeWithAttemptsMessage(remainingAttempts), { parse_mode: "Markdown" });
    }

    return false;
  }
}

export async function handleWalletExport(ctx: BotContext) {
  try {
    const walletData = await WalletService.exportAndDecryptWallet(ctx.user?.walletId as string);
    const exportMessage = MessageService.getWalletExportMessage(
      ctx.user?.walletAddress as string,
      walletData.privateKey
    );
    await ctx.reply(exportMessage, { parse_mode: "Markdown" });
  } catch (error) {
    await ctx.reply(MessageService.getErrorMessage("Failed to export wallet. Please try again."));
  }
}

export async function exportPrivateKeyAction(ctx: BotContext) {
  if (!ctx.user?.walletId) {
    await ctx.reply(MessageService.getErrorMessage("No wallet ID found to export"));
    return;
  }

  const userInfo = await userService.getUserByTelegramId(ctx.user.telegramId);

  if (!userInfo?.hasExportedPrivateKey) {
    await ctx.reply(MessageService.getFirstTimeExportWarningMessage(), {
      parse_mode: "Markdown",
      reply_markup: {
        inline_keyboard: [
          [
            { text: "✅ Yes, Export Private Key", callback_data: WALLET_CALLBACKS.export.confirmFirst },
            { text: "❌ Cancel", callback_data: WALLET_CALLBACKS.export.cancel },
          ],
        ],
      },
    });
    return;
  }

  if (!userInfo?.twoFactorEnabled) {
    await ctx.reply(MessageService.getTwoFactorRequiredForExportMessage(), { parse_mode: "Markdown" });
    return;
  }

  ctx.session = {
    ...ctx.session,
    twoFactorVerification: {
      action: "export_private_key",
      step: "waiting_for_code",
      attempts: 0,
      maxAttempts: 3,
    },
  };

  await ctx.reply(MessageService.getTwoFactorVerificationRequiredMessage(), { parse_mode: "Markdown" });
}

export async function confirmFirstExport(ctx: BotContext) {
  if (!ctx.user?.walletId) {
    await ctx.reply(MessageService.getErrorMessage("No wallet ID found to export"));
    return;
  }

  await handleWalletExport(ctx);
  await userService.markPrivateKeyExported(ctx.user.id);
  await ctx.reply(MessageService.getFirstTimeExportSuccessMessage(), { parse_mode: "Markdown" });
}

export async function cancelExport(ctx: BotContext) {
  await ctx.reply(MessageService.getExportCancelledMessage());
}
