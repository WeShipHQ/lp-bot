import { FastifyInstance } from "fastify";
import { getWalletKeyboard } from "../keyboards/wallet-menu";
import { solanaService } from "../../services/solana.service";
import { MessageService } from "../../services/message.service";
import { BotContext } from "@/types/bot.types";

export async function walletHandler(ctx: BotContext, _server: FastifyInstance) {
  try {
    if (!ctx.user) {
      await ctx.reply(
        MessageService.getErrorMessage(
          "Unable to authenticate user. Please try again."
        )
      );
      return;
    }

    const user = ctx.user;

    if (!user.walletAddress) {
      await ctx.reply(
        MessageService.getErrorMessage(
          "No wallet found. Please contact support."
        )
      );
      return;
    }

    let solBalance = 0;
    let solPrice = 0;

    try {
      [solBalance, solPrice] = await Promise.all([
        solanaService.getBalance(user.walletAddress),
        solanaService.getSolPrice(),
      ]);
    } catch (error) {
      // Continue with 0 balance if fetch fails
    }

    const usdValue = solBalance * solPrice;
    const message = MessageService.getWalletMessage(
      user.walletAddress,
      solBalance,
      usdValue
    );

    const dynamicKeyboard = getWalletKeyboard(user.walletAddress);

    await ctx.reply(message, {
      parse_mode: "Markdown",
      reply_markup: {
        inline_keyboard: dynamicKeyboard.inline_keyboard,
      },
    });
  } catch (error) {
    await ctx.reply(
      MessageService.getErrorMessage(
        "Error loading wallet information. Please try again."
      )
    );
  }
}

export async function handleWalletCallback(ctx: any, _server: FastifyInstance) {
  try {
    const callbackData = String(ctx.callbackQuery?.data ?? "");

    if (!callbackData) {
      await ctx.answerCbQuery();
      return;
    }

    switch (callbackData) {
      case "refresh_wallet":
        try {
          const wallet = ctx.user?.walletAddress;
          if (!wallet) {
            return await ctx.answerCbQuery("❌ No wallet address found");
          }
          // Fetch data song song
          const [solBalance, solPrice] = await Promise.all([
            solanaService.getBalance(wallet),
            solanaService.getSolPrice(),
          ]);

          const usdValue = solBalance * solPrice;
          const messageText = MessageService.getWalletMessage(
            wallet,
            solBalance,
            usdValue
          );
          const keyboard = getWalletKeyboard(wallet);

          const messageId = ctx.callbackQuery?.message?.message_id;
          const chatId = ctx.chat?.id;

          if (!messageId || !chatId) {
            return await ctx.answerCbQuery("❌ Cannot find message to update");
          }

          try {
            await ctx.telegram.editMessageText(
              chatId,
              messageId,
              undefined,
              messageText,
              {
                parse_mode: "Markdown",
                reply_markup: keyboard,
              }
            );
            console.log("Message edited successfully");
            await ctx.answerCbQuery("🔄 Wallet refreshed!");
          } catch (err: any) {
            if (err.description?.includes("message is not modified")) {
              await ctx.answerCbQuery("✅ Wallet already up-to-date");
            } else {
              console.error("Edit message error:", err);
              await ctx.answerCbQuery("❌ Failed to update message");
            }
          }
        } catch (error) {
          console.error("Refresh wallet error:", error);
          await ctx.answerCbQuery("❌ Failed to refresh wallet");
        }
        break;

      case "close_wallet":
        try {
          // Delete the wallet message
          const messageId = ctx.callbackQuery?.message?.message_id;
          if (messageId && ctx.chat?.id) {
            await ctx.telegram.deleteMessage(ctx.chat.id, messageId);
            await ctx.answerCbQuery("✅ Wallet closed");
          } else {
            await ctx.reply("✅ Wallet closed");
            await ctx.answerCbQuery("✅ Wallet closed");
          }
        } catch (error) {
          await ctx.answerCbQuery("❌ Failed to close wallet");
        }
        break;

      case "transfer_all_sol":
        await ctx.reply(
          "🚧 *Transfer All SOL*\n\nThis feature is coming soon! You'll be able to transfer all your SOL to another wallet.",
          {
            parse_mode: "Markdown",
          }
        );
        break;

      case "transfer_x_sol":
        await ctx.reply(
          "🚧 *Transfer X SOL*\n\nThis feature is coming soon! You'll be able to transfer a specific amount of SOL to another wallet.",
          {
            parse_mode: "Markdown",
          }
        );
        break;

      case "transfer_all_tokens":
        await ctx.reply(
          "🚧 *Transfer All Tokens*\n\nThis feature is coming soon! You'll be able to transfer all your SPL tokens to another wallet.",
          {
            parse_mode: "Markdown",
          }
        );
        break;

      case "transfer_x_tokens":
        await ctx.reply(
          "🚧 *Transfer X Tokens*\n\nThis feature is coming soon! You'll be able to transfer a specific amount of tokens to another wallet.",
          {
            parse_mode: "Markdown",
          }
        );
        break;

      case "export_private_key":
        await ctx.reply(
          "🚧 *Export Private Key*\n\nThis feature is coming soon! You'll be able to export your wallet's private key for backup purposes.\n\n⚠️ *Security Note:* Never share your private key with anyone!",
          {
            parse_mode: "Markdown",
          }
        );
        break;

      default:
        await ctx.answerCbQuery("❌ Unknown action");
        break;
    }

    await ctx.answerCbQuery();
  } catch (error) {
    await ctx.answerCbQuery("❌ Error processing request");
  }
}
