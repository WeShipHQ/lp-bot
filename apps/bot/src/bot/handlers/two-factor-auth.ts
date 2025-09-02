import { Context } from "telegraf";
import { FastifyInstance } from "fastify";
import { twoFactorAuthService } from "../../services/two-factor-auth.service";
import { MessageService } from "../../services/message.service";
import { userService, UserInfo } from "../../services/user.service";
import { tempStoreService } from "../../services/temp-store.service";

interface BotContext extends Context {
  userId?: string;
  userInfo?: UserInfo;
}

export async function handleTwoFactorSetup(ctx: BotContext, _server: FastifyInstance) {
      try {
      const telegramUserId = ctx.from?.id?.toString();
      if (!telegramUserId) {
        await ctx.reply(MessageService.getErrorMessage("Authentication failed"));
        return;
      }

    // Get user info
    let userInfo: UserInfo | null = null;
    try {
      userInfo = await userService.getUserByTelegramId(telegramUserId);
      if (!userInfo) {
        await ctx.reply("❌ User not found. Please use /start first.");
        return;
      }
    } catch (error) {
      console.error("Error getting user:", error);
      await ctx.reply(MessageService.getErrorMessage("Failed to get user information"));
      return;
    }

    // Check if 2FA is already enabled
    if (userInfo.twoFactorEnabled) {
      await ctx.reply(
        "⚠️ **Two-Factor Authentication is already enabled!**\n\n" +
        "If you want to reset your 2FA, please contact support.",
        { parse_mode: "Markdown" }
      );
      return;
    }

    // Generate 2FA secret and QR code
    try {
      const setup = await twoFactorAuthService.generateSecret(userInfo.id);

      // Store the secret temporarily (in production, you'd store this securely)
      // For now, we'll store it in the user's session or a temporary store
      ctx.userInfo = userInfo;

      const message = 
        "🔐 **Two-Factor Authentication Setup**\n\n" +
        "**Step 1:** Install Google Authenticator on your phone\n\n" +
        "**Step 2:** Scan this QR code with Google Authenticator:\n\n" +
        "**Step 3:** Enter the 6-digit code from your authenticator app\n\n" +
        "⚠️ **Important:**\n" +
        "• Save your backup codes in a safe place\n" +
        "• Each backup code can only be used once\n" +
        "• Keep your phone secure\n\n" +
        "**Backup Codes:**\n" +
        setup.backupCodes.map((code, index) => `${index + 1}. \`${code}\``).join('\n') + "\n\n" +
        "Click the button below when ready to verify:";

      // Send QR code as photo with verify button
      await ctx.replyWithPhoto(
        { source: Buffer.from(setup.qrCodeUrl.split(',')[1], 'base64') },
        {
          caption: message,
          parse_mode: "Markdown",
          reply_markup: {
            inline_keyboard: [
              [{ text: "✅ I'm Ready to Verify", callback_data: "verify_2fa_ready" }]
            ]
          }
        }
      );

      // Store the secret temporarily for verification
      tempStoreService.setTemp2FAData(telegramUserId, setup.secret, setup.backupCodes);

    } catch (error) {
      console.error("Error setting up 2FA:", error);
      await ctx.reply(MessageService.getErrorMessage("Failed to setup 2FA"));
    }

  } catch (error) {
    console.error("Error in 2FA setup handler:", error);
    await ctx.reply(MessageService.getErrorMessage("Error setting up 2FA"));
  }
}

export async function handleTwoFactorVerification(ctx: BotContext, token: string) {
  try {
    const telegramUserId = ctx.from?.id?.toString();
    if (!telegramUserId) {
      await ctx.reply(MessageService.getErrorMessage("Authentication failed"));
      return;
    }

    // Get temporary secret from store
    const tempData = tempStoreService.getTemp2FAData(telegramUserId);

    if (!tempData) {
      await ctx.reply(
        "❌ **No 2FA setup in progress!**\n\n" +
        "Please click the 🔐 2FA button and setup 2FA first.",
        { parse_mode: "Markdown" }
      );
      return;
    }

    const { secret: tempSecret, backupCodes: tempBackupCodes } = tempData;

    // Verify the token
    const verification = twoFactorAuthService.verifyToken(tempSecret, token);

    if (verification.isValid) {
      // 2FA setup successful - enable it for the user
      try {
        // Get user info for updating 2FA settings
        const telegramUserId = ctx.from?.id?.toString();
        if (!telegramUserId) {
          await ctx.reply(MessageService.getErrorMessage("Authentication failed"));
          return;
        }

        const userInfo = await userService.getUserByTelegramId(telegramUserId);
        if (!userInfo) {
          await ctx.reply("❌ User not found. Please use /start first.");
          return;
        }

        // Update user's 2FA settings in the database
        const success = await userService.updateTwoFactorSettings(
          userInfo.id,
          true,
          tempSecret,
          tempBackupCodes
        );

        if (success) {
          await ctx.reply(
            "✅ **Two-Factor Authentication Enabled Successfully!**\n\n" +
            "🔐 Your account is now protected with 2FA\n" +
            "📱 Use Google Authenticator for future logins\n\n" +
            "⚠️ **Important Reminders:**\n" +
            "• Keep your backup codes safe\n" +
            "• Don't share your authenticator app\n" +
            "• Contact support if you lose access",
            { parse_mode: "Markdown" }
          );
        } else {
          await ctx.reply(
            "❌ **Failed to save 2FA settings!**\n\n" +
            "Please try again or contact support.",
            { parse_mode: "Markdown" }
          );
        }

        // Clear temporary data
        tempStoreService.removeTemp2FAData(telegramUserId);

      } catch (error) {
        console.error("Error enabling 2FA:", error);
        await ctx.reply(MessageService.getErrorMessage("Failed to enable 2FA"));
      }
    } else {
      await ctx.reply(
        "❌ **Invalid verification code!**\n\n" +
        "Please check your Google Authenticator app and try again.\n" +
        "Make sure the code is current and entered correctly.",
        { parse_mode: "Markdown" }
      );
    }

  } catch (error) {
    console.error("Error in 2FA verification:", error);
    await ctx.reply(MessageService.getErrorMessage("Error verifying 2FA code"));
  }
}

export async function handleTwoFactorDisable(ctx: BotContext) {
  try {
    const telegramUserId = ctx.from?.id?.toString();
    if (!telegramUserId) {
      await ctx.reply(MessageService.getErrorMessage("Authentication failed"));
      return;
    }

    // Get user info
    let userInfo: UserInfo | null = null;
    try {
      userInfo = await userService.getUserByTelegramId(telegramUserId);
      if (!userInfo) {
        await ctx.reply("❌ User not found. Please use /start first.");
        return;
      }
    } catch (error) {
      console.error("Error getting user:", error);
      await ctx.reply(MessageService.getErrorMessage("Failed to get user information"));
      return;
    }

    // Check if 2FA is enabled
    if (!userInfo.twoFactorEnabled) {
      await ctx.reply(
        "ℹ️ **Two-Factor Authentication is not enabled**\n\n" +
        "Use `/setup-2fa` to enable 2FA for your account.",
        { parse_mode: "Markdown" }
      );
      return;
    }

    // In production, you'd require additional verification before disabling
    await ctx.reply(
      "⚠️ **Disable Two-Factor Authentication**\n\n" +
      "This will remove 2FA protection from your account.\n\n" +
      "**To disable 2FA, please contact support** with:\n" +
      "• Your account verification\n" +
      "• Reason for disabling 2FA\n\n" +
      "For security reasons, 2FA cannot be disabled through the bot.",
      { parse_mode: "Markdown" }
    );

  } catch (error) {
    console.error("Error in 2FA disable handler:", error);
    await ctx.reply(MessageService.getErrorMessage("Error processing 2FA disable request"));
  }
}

export async function handleTwoFactorStatus(ctx: BotContext) {
  try {
    const telegramUserId = ctx.from?.id?.toString();
    if (!telegramUserId) {
      await ctx.reply(MessageService.getErrorMessage("Authentication failed"));
      return;
    }

    // Get user info
    let userInfo: UserInfo | null = null;
    try {
      userInfo = await userService.getUserByTelegramId(telegramUserId);
      if (!userInfo) {
        await ctx.reply("❌ User not found. Please use /start first.");
        return;
      }
    } catch (error) {
      console.error("Error getting user:", error);
      await ctx.reply(MessageService.getErrorMessage("Failed to get user information"));
      return;
    }

    const status = userInfo.twoFactorEnabled ? "✅ Enabled" : "❌ Disabled";
    const statusColor = userInfo.twoFactorEnabled ? "🟢" : "🔴";

    const keyboard = userInfo.twoFactorEnabled ? [] : [
      [{ text: "🔐 Setup 2FA", callback_data: "setup_2fa" }]
    ];

    await ctx.reply(
      `🔐 **Two-Factor Authentication Status**\n\n` +
      `${statusColor} **Status:** ${status}\n\n` +
      `**Security Tips:**\n` +
      `• Keep your backup codes safe\n` +
      `• Use a secure authenticator app\n` +
      `• Don't share your 2FA codes`,
      { 
        parse_mode: "Markdown",
        reply_markup: keyboard.length > 0 ? { inline_keyboard: keyboard } : undefined
      }
    );

  } catch (error) {
    console.error("Error in 2FA status handler:", error);
    await ctx.reply(MessageService.getErrorMessage("Error getting 2FA status"));
  }
}
