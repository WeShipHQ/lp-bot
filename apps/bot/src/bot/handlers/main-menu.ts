import { Context } from "telegraf";
import { FastifyInstance } from "fastify";
import { handleTwoFactorSetup, handleTwoFactorStatus } from "./two-factor-auth";
import { MessageService } from "../../services/message.service";
import { userService, UserInfo } from "../../services/user.service";

interface BotContext extends Context {
  userId?: string;
  userInfo?: UserInfo;
}

export async function handleMainMenuCallback(ctx: BotContext, action: string, server: FastifyInstance) {
  try {
    const telegramUserId = ctx.from?.id?.toString();
    if (!telegramUserId) {
      await ctx.reply(MessageService.getAuthErrorMessage());
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

    switch (action) {
      case "two_factor_auth":
        await handleTwoFactorStatus(ctx);
        break;
        
      case "setup_2fa":
        await handleTwoFactorSetup(ctx, server);
        break;
        
      case "verify_2fa_ready":
        await ctx.reply(
          "🔐 **Ready to Verify 2FA!**\n\n" +
          "Please enter the 6-digit code from your Google Authenticator app.\n\n" +
          "**Example:** `123456`\n\n" +
          "Just type the code and send it as a message.",
          { parse_mode: "Markdown" }
        );
        break;
        
      default:
        await ctx.reply("❌ Unknown action");
    }
  } catch (error) {
    console.error("Error handling main menu callback:", error);
    await ctx.reply(MessageService.getErrorMessage());
  }
}
