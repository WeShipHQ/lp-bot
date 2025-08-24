import { FastifyInstance } from "fastify";
import { getWalletKeyboard, getTransferConfirmKeyboard } from "../keyboards/wallet-menu";
import { solanaService } from "../../services/solana.service";
import { MessageService } from "../../services/message.service";
import { WalletService } from "../../services/wallet.service";
import { BotContext } from "@/types/bot.types";
import { jupiterService } from "../../services/jupiter.service";

export async function walletHandler(ctx: BotContext, _server: FastifyInstance) {
  try {
    if (!ctx.user) {
      await ctx.reply(MessageService.getErrorMessage("Unable to authenticate user. Please try again."));
      return;
    }

    const user = ctx.user;

    if (!user.walletAddress) {
      try {
        await ctx.reply("⏳ **Wallet Still Creating**\n\nYour wallet is being set up. Please wait a moment and try again.\n\nIf this persists, please contact support.", {
          parse_mode: "Markdown"
        });
      } catch (error) {
        await ctx.reply(MessageService.getErrorMessage("No wallet found. Please contact support."));
      }
      return;
    }

    let solBalance = 0;
    let solPrice = 0;
    
    try {
      [solBalance, solPrice] = await Promise.all([
        solanaService.getBalance(user.walletAddress),
        solanaService.getSolPrice()
      ]);
    } catch (error) {
      // Continue with 0 balance if fetch fails
    }

    const usdValue = solBalance * solPrice;
    const message = MessageService.getWalletMessage(user.walletAddress, solBalance, usdValue);

    const dynamicKeyboard = getWalletKeyboard(user.walletAddress);

    await ctx.reply(message, {
      parse_mode: "Markdown",
      reply_markup: {
        inline_keyboard: dynamicKeyboard.inline_keyboard,
      },
    });
  } catch (error) {
    await ctx.reply(MessageService.getErrorMessage("Error loading wallet information. Please try again."));
  }
}

// Handle text input for transfers
export async function handleTransferInput(ctx: BotContext, _server: FastifyInstance) {
  try {

    // Check if we're in a transfer state
    if (!ctx.session?.transferState) {
      return false; // Not in transfer mode
    }

    const transferState = ctx.session.transferState;
    const messageText = ctx.message && 'text' in ctx.message ? ctx.message.text : undefined;

    if (!messageText) {
      await ctx.reply(MessageService.getErrorMessage("Invalid input. Please try again or type /cancel to cancel."));
      return true;
    }

    // Check for cancel command
    if (messageText.toLowerCase() === '/cancel') {
      delete ctx.session.transferState;
      await ctx.reply("✅ Transfer cancelled.");
      return true;
    }

    // Handle token transfer input
    if (transferState.step === "token_input") {
      // Parse input: "tokenAddress recipientAddress amount"
      const parts = messageText.trim().split(/\s+/);

      if (parts.length !== 3) {
        await ctx.reply(MessageService.getErrorMessage("Please enter the token address, recipient address, and amount in the format: tokenAddress recipientAddress amount"));
        return true;
      }

      const [tokenAddress, recipientAddress, amountStr] = parts;
      const amount = parseFloat(amountStr);

      // Validate addresses and amount
      if (!solanaService.validateAddress(tokenAddress)) {
        await ctx.reply(MessageService.getErrorMessage("Invalid token address. Please check and try again."));
        return true;
      }

      if (!solanaService.validateAddress(recipientAddress)) {
        await ctx.reply(MessageService.getErrorMessage("Invalid recipient address. Please check and try again."));
        return true;
      }

      if (isNaN(amount) || amount <= 0) {
        await ctx.reply(MessageService.getErrorMessage("Please enter a valid amount greater than 0."));
        return true;
      }

      // Get token info
      await ctx.reply("⏳ Looking up token information...");

      try {
        // Get token balance and info
        const { balance, decimals } = await solanaService.getTokenBalance(ctx.user?.walletAddress as string, tokenAddress);

        if (balance < amount) {
          await ctx.reply(MessageService.getErrorMessage(`Insufficient token balance. You have ${balance} tokens available.`));
          return true;
        }

        // Get token symbol and name from Jupiter API
        // Get token info using jupiterService
        const tokenInfo = await jupiterService.getTokenInfo(tokenAddress);

        if (!tokenInfo) {
          throw new Error("Could not get token information");
        }

        // Update state
        ctx.session.transferState = {
          ...transferState,
          tokenAddress,
          tokenSymbol: tokenInfo.symbol,
          tokenName: tokenInfo.name,
          recipientAddress,
          amount,
          decimals,
          step: "token_confirmation"
        };

        // Send confirmation message
        await ctx.reply(
          MessageService.getTransferTokenConfirmationMessage(
            tokenInfo.symbol,
            tokenInfo.name,
            recipientAddress,
            amount
          ),
          {
            parse_mode: "Markdown",
            reply_markup: getTransferConfirmKeyboard()
          }
        );

      } catch (error) {
        console.error("Error getting token info:", error);
        await ctx.reply(MessageService.getErrorMessage(
          `Failed to get token information: ${error instanceof Error ? error.message : "Unknown error"}`
        ));
        delete ctx.session.transferState;
      }

      return true;
    }
    else if (transferState.step === "address_input") {
      // Parse input: "address amount" or just "address" for transfer_all
      const parts = messageText.trim().split(/\s+/);
      let recipientAddress, amount;

      if (transferState.type === "all_sol") {
        // For transfer all, we expect just the address
        if (parts.length !== 1) {
          await ctx.reply(MessageService.getErrorMessage("Please enter only the recipient address for transferring all SOL."));
          return true;
        }
        recipientAddress = parts[0];
        amount = transferState.amount; // Already set from balance
      } else {
        // For transfer specific amount, we expect address and amount
        if (parts.length !== 2) {
          await ctx.reply(MessageService.getErrorMessage("Please enter both recipient address and amount in the format: address amount"));
          return true;
        }
        recipientAddress = parts[0];
        amount = parseFloat(parts[1]);

        if (isNaN(amount) || amount <= 0) {
          await ctx.reply(MessageService.getErrorMessage("Please enter a valid amount greater than 0."));
          return true;
        }
      }

      // Validate address
      if (!solanaService.validateAddress(recipientAddress)) {
        await ctx.reply(MessageService.getErrorMessage("Invalid Solana address. Please check and try again."));
        return true;
      }

      // Get current SOL price for USD value
      const solPrice = await solanaService.getSolPrice();
      const usdValue = (amount as number) * solPrice;

      // Update state
      ctx.session.transferState = {
        ...transferState,
        recipientAddress,
        amount: amount as number, // We've already validated this is a number above
        step: "confirmation"
      };

      // Send confirmation message
      await ctx.reply(
        MessageService.getTransferConfirmationMessage(recipientAddress, amount as number, usdValue),
        {
          parse_mode: "Markdown",
          reply_markup: getTransferConfirmKeyboard()
        }
      );

      return true;
    }

    return false;
  } catch (error) {
    console.error("Transfer input error:", error);
    await ctx.reply(MessageService.getErrorMessage("Error processing transfer. Please try again."));
    return true;
  }
}

export async function handleWalletCallback(ctx: BotContext, _server: FastifyInstance) {
  try {
    // Handle different callback query types
    const callbackData = ctx.callbackQuery && 'data' in ctx.callbackQuery 
      ? String(ctx.callbackQuery.data ?? "") 
      : "";

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
        try {
          await ctx.answerCbQuery("⏳ Preparing to transfer all SOL");
          
          if (!ctx.user?.walletAddress) {
            await ctx.reply(MessageService.getErrorMessage("No wallet found. Please try again."));
            return;
          }
          
          const solBalance = await solanaService.getBalance(ctx.user.walletAddress);
          
          ctx.session = {
            ...ctx.session,
            transferState: {
              type: "all_sol",
              amount: solBalance,
              step: "address_input"
            }
          };
          
          await ctx.reply(MessageService.getTransferSolRequestMessage(), {
            parse_mode: "Markdown",
            reply_markup: { force_reply: true }
          });
        } catch (error) {
          console.error("Transfer all SOL error:", error);
          await ctx.reply(MessageService.getErrorMessage("Failed to prepare transfer. Please try again."));
          }
        break;

      case "transfer_x_sol":
        try {
          await ctx.answerCbQuery("⏳ Preparing to transfer SOL");
          
          ctx.session = {
            ...ctx.session,
            transferState: {
              type: "specific_sol",
              step: "address_input"
            }
          };
          
          await ctx.reply(MessageService.getTransferSolRequestMessage(), {
            parse_mode: "Markdown",
            reply_markup: { force_reply: true }
          });
        } catch (error) {
          console.error("Transfer X SOL error:", error);
          await ctx.reply(MessageService.getErrorMessage("Failed to prepare transfer. Please try again."));
          }
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
        try {
          await ctx.answerCbQuery("⏳ Preparing to transfer tokens");
          
          ctx.session = {
            ...ctx.session,
            transferState: {
              type: "token",
              step: "token_input"
            }
          };
          
          await ctx.reply(MessageService.getTransferTokenRequestMessage(), {
            parse_mode: "Markdown",
            reply_markup: { force_reply: true }
          });
        } catch (error) {
          console.error("Transfer X tokens error:", error);
          await ctx.reply(MessageService.getErrorMessage("Failed to prepare token transfer. Please try again."));
          }
        break;

      case "export_private_key":
        try {
          if (ctx.user?.walletId) {
            // Get wallet ID from user context
            const walletId = ctx.user.walletId;
            
            await ctx.answerCbQuery("🔐 Exporting wallet...");
            

            
            const walletData = await WalletService.exportAndDecryptWallet(walletId);
            
            // Send private key securely (consider using private chat or temporary message)
            const exportMessage = `🔐 *Wallet Export Successful*\n\n` +
              `*Address:* \`${ctx.user?.walletAddress}\`\n` +
              `*Private Key:* \`${walletData.privateKey}\`\n\n` +
              `⚠️ **SECURITY WARNING:**\n` +
              `• Never share your private key with anyone\n` +
              `• Store it securely offline\n` +
              `• Anyone with this key can access your wallet\n\n`;
            
            await ctx.reply(exportMessage, {
              parse_mode: "Markdown"
            });
            
            await ctx.answerCbQuery("✅ Wallet exported successfully");
          } else {
            await ctx.answerCbQuery("❌ No wallet ID found to export");
          }
        } catch (error) {
          console.error("Export wallet error:", error);
          await ctx.answerCbQuery("❌ Failed to export wallet");
          await ctx.reply("❌ *Export Failed*\n\nUnable to export wallet. Please try again later.", {
            parse_mode: "Markdown"
          });
        }
        break;

      case "confirm_transfer":
        try {
          await ctx.answerCbQuery("⏳ Processing transfer...");
          
          if (!ctx.session) {
            ctx.session = {};
          }
          const transferState = ctx.session.transferState;
          if (!transferState || !transferState.recipientAddress || !transferState.amount) {
            await ctx.reply(MessageService.getErrorMessage("Transfer details not found. Please try again."));
            return;
          }
          
          if (!ctx.user?.walletId) {
            await ctx.reply(MessageService.getErrorMessage("Wallet ID not found. Please try again."));
            return;
          }
          
          // Check if this is a token transfer or SOL transfer
          if (transferState.type === "token" && transferState.tokenAddress && transferState.step === "token_confirmation") {
            // Token transfer
            console.log("Executing token transfer via Privy:", {
              walletId: ctx.user.walletId,
              tokenAddress: transferState.tokenAddress,
              recipientAddress: transferState.recipientAddress,
              amount: transferState.amount,
              decimals: transferState.decimals || 0
            });
            
            // Call transferToken
            const result = await solanaService.transferToken({
              walletId: ctx.user.walletId,
              walletAddress: ctx.user.walletAddress as string,
              recipientAddress: transferState.recipientAddress,
              tokenAddress: transferState.tokenAddress,
              amount: transferState.amount,
              decimals: transferState.decimals || 0
            });
            
            // Get the signature
            const { signature } = result;
            
            // Send success message
            const message = MessageService.getTransferTokenSuccessMessage(
              transferState.tokenSymbol || 'Unknown',
              transferState.recipientAddress,
              transferState.amount,
              signature
            );
            
            await ctx.reply(message, { parse_mode: "Markdown" });
          } else {
            // SOL transfer
            console.log("Executing SOL transfer via Privy:", {
              walletId: ctx.user.walletId,
              recipientAddress: transferState.recipientAddress,
              amount: transferState.amount
            });
            
            // Track the original requested amount
            const requestedAmount = transferState.amount;
            
            // Call transferSol which may adjust the amount for fees
            const result = await solanaService.transferSol({
              walletId: ctx.user.walletId,
              walletAddress: ctx.user.walletAddress as string,
              recipientAddress: transferState.recipientAddress,
              amount: transferState.amount
            });
            
            // Get the signature and actual amount sent
            const { signature, actualAmount } = result;
            
            // Create appropriate message based on whether amount was adjusted
            let message;
            if (actualAmount !== undefined && Math.abs(actualAmount - requestedAmount) > 0.00001) {
              // Amount was adjusted
              message = MessageService.getTransferSuccessWithAdjustmentMessage(
                transferState.recipientAddress,
                requestedAmount,
                actualAmount,
                signature
              );
            } else {
              // Amount was not adjusted
              message = MessageService.getTransferSuccessMessage(
                transferState.recipientAddress,
                requestedAmount,
                signature
              );
            }
            
            // Send success message
            await ctx.reply(message, { parse_mode: "Markdown" });
          }
          
          // Clear transfer state
          delete ctx.session.transferState;
          
        } catch (error) {
          console.error("Transfer confirmation error:", error);
          await ctx.reply(MessageService.getTransferErrorMessage(
            error instanceof Error ? error.message : "Unknown error occurred"
          ), { parse_mode: "Markdown" });
        }
        break;
        
      case "cancel_transfer":
        try {
          await ctx.answerCbQuery("✅ Transfer cancelled");
          delete ctx.session?.transferState;
          await ctx.reply("✅ Transfer cancelled.");
        } catch (error) {
          console.error("Cancel transfer error:", error);
          await ctx.reply(MessageService.getErrorMessage("Error cancelling transfer."));
        }
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
