import { FastifyInstance } from "fastify";
import { BotContext } from "@/types/bot.types";
import { userService } from "@/services/user.service";
import { twoFactorAuthService } from "@/services/two-factor-auth.service";
import { WalletService } from "@/services/wallet.service";
import { WALLET_CALLBACKS } from "@/presentation/constants/wallet.callbacks";

export async function handleTwoFactorInput(
  ctx: BotContext,
  _server: FastifyInstance
) {
  try {
    const messageText =
      ctx.message && "text" in ctx.message ? ctx.message.text : undefined;

    if (ctx.session?.twoFactorVerification?.step !== "waiting_for_code") {
      return false;
    }

    if (!messageText) {
      await ctx.reply(
        "Please enter your 6-digit authentication code or type /cancel to cancel."
      );
      return true;
    }

    if (messageText.toLowerCase() === "/cancel") {
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
    await ctx.reply("Error verifying 2FA code. Please try again.");
    return true;
  }
}

async function verifyTwoFactorCode(
  ctx: BotContext,
  code: string
): Promise<boolean> {
  const verificationState = ctx.session?.twoFactorVerification;
  if (!verificationState) return false;

  const userInfo = await userService.getUserByTelegramId(
    ctx.user.telegramId as string
  );
  if (!userInfo?.twoFactorSecret) {
    await ctx.reply("2FA not properly configured. Please contact support.");
    delete ctx.session?.twoFactorVerification;
    return false;
  }

  const verification = twoFactorAuthService.verifyToken(
    userInfo.twoFactorSecret,
    code
  );

  if (verification.isValid) {
    delete ctx.session?.twoFactorVerification;
    return true;
  } else {
    verificationState.attempts = (verificationState.attempts || 0) + 1;
    const remainingAttempts =
      (verificationState.maxAttempts || 3) - verificationState.attempts;

    if (remainingAttempts <= 0) {
      delete ctx.session?.twoFactorVerification;
      await ctx.reply(
        "❌ **Too Many Failed Attempts**\n\n" +
          "You have exceeded the maximum number of attempts. Please try again later.",
        {
          parse_mode: "Markdown",
        }
      );
    } else {
      await ctx.reply(
        `❌ **Invalid Authentication Code**\n\n` +
          `Please check your Authenticator App app and try again.\n\n` +
          `🔄 Attempts remaining: ${remainingAttempts}\n` +
          `Type \`/cancel\` to cancel this operation.`,
        { parse_mode: "Markdown" }
      );
    }

    return false;
  }
}

export async function handleWalletExport(ctx: BotContext) {
  try {
    const walletData = await WalletService.exportAndDecryptWallet(
      ctx.user?.walletId as string
    );

    const exportMessage =
      `🔐 *Wallet Export Successful*\n\n` +
      `*Address:* \`${ctx.user?.walletAddress}\`\n` +
      `*Private Key:* \`${walletData.privateKey}\`\n\n` +
      `⚠️ **SECURITY WARNING:**\n` +
      `• Never share your private key with anyone\n` +
      `• Store it securely offline\n` +
      `• Anyone with this key can access your wallet\n\n`;

    await ctx.reply(exportMessage, { parse_mode: "Markdown" });
  } catch (error) {
    await ctx.reply("Failed to export wallet. Please try again.");
  }
}

export async function exportPrivateKeyAction(ctx: BotContext) {
  if (!ctx.user?.walletId) {
    await ctx.reply("No wallet ID found to export");
    return;
  }

  const userInfo = await userService.getUserByTelegramId(ctx.user.telegramId);

  if (!userInfo?.hasExportedPrivateKey) {
    await ctx.reply(
      "⚠️ **First Time Export Warning**\n\n" +
        "This is your first time exporting your private key. For security reasons:\n\n" +
        "• This export will be allowed without 2FA verification\n" +
        "• **All future exports will require 2FA verification**\n" +
        "• Please ensure you have 2FA enabled for future security\n\n" +
        "Do you want to proceed with the export?",
      {
        parse_mode: "Markdown",
        reply_markup: {
          inline_keyboard: [
            [
              {
                text: "✅ Yes, Export Private Key",
                callback_data: WALLET_CALLBACKS.export.confirmFirst,
              },
              {
                text: "❌ Cancel",
                callback_data: WALLET_CALLBACKS.export.cancel,
              },
            ],
          ],
        },
      }
    );
    return;
  }

  if (!userInfo?.twoFactorEnabled) {
    await ctx.reply(
      "🔐 **2FA Required for Wallet Export**\n\n" +
        "For security reasons, you must enable Two-Factor Authentication before exporting your private key.\n\n" +
        "Please use the command `/twoFactor` to setup 2FA first.\n\n" +
        "⚠️ **Why 2FA is required:**\n" +
        "• Protects your private key from unauthorized access\n" +
        "• Adds an extra layer of security\n" +
        "• Required for sensitive operations",
      {
        parse_mode: "Markdown",
      }
    );
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

  await ctx.reply(
    "🔐 **2FA Verification Required**\n\n" +
      "Please enter your 6-digit authentication code from Authenticator App:\n\n" +
      "⏰ The code expires in 30 seconds\n" +
      "🔄 You have 3 attempts remaining\n\n" +
      "Type `/cancel` to cancel this operation.",
    {
      parse_mode: "Markdown",
    }
  );
}

export async function confirmFirstExport(ctx: BotContext) {
  if (!ctx.user?.walletId) {
    await ctx.reply("No wallet ID found to export");
    return;
  }

  await handleWalletExport(ctx);
  await userService.markPrivateKeyExported(ctx.user.id);
  await ctx.reply(
    "✅ **Private Key Exported Successfully!**\n\n" +
      "⚠️ **Important Security Reminder:**\n" +
      "• All future exports will require 2FA verification\n" +
      "• Please enable 2FA in `/twoFactor` for better security\n" +
      "• Keep your private key secure and never share it",
    {
      parse_mode: "Markdown",
    }
  );
}

export async function cancelExport(ctx: BotContext) {
  await ctx.reply("✅ Private key export cancelled.");
}
