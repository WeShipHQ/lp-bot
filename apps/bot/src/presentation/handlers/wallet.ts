import { FastifyInstance } from "fastify";
import {
  getWalletKeyboard,
  getTransferConfirmKeyboard,
} from "../keyboards/wallet-menu";
import { solanaService } from "../../services/solana.service";
import { MessageService } from "../../services/message.service";
import { WalletService } from "../../services/wallet.service";
import { BotContext } from "@/types/bot.types";
import { jupiterService } from "../../services/jupiter.service";
import { userService } from "../../services/user.service";
import { twoFactorAuthService } from "../../services/two-factor-auth.service";

export async function walletHandler(ctx: BotContext, _server: FastifyInstance) {
  try {
    const user = ctx.user;

    if (!user.walletAddress || user.walletAddress.trim() === "") {
      try {
        await ctx.reply(
          `⏳ *Wallet Still Creating*\n\nYour wallet is being set up. Please wait a moment and try again.\n\nIf this persists, please contact support.`,
          {
            parse_mode: "Markdown",
          }
        );
      } catch (error) {
        await ctx.reply(
          MessageService.getErrorMessage(
            "No wallet found. Please contact support."
          )
        );
      }

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

    const keyboard = getWalletKeyboard(user.walletAddress);

    await ctx.reply(message, {
      parse_mode: "Markdown",
      reply_markup: {
        inline_keyboard: keyboard.inline_keyboard,
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

export async function handleTransferInput(
  ctx: BotContext,
  _server: FastifyInstance
) {
  try {
    // Check if we're in a transfer state
    if (!ctx.session?.transferState) {
      return false;
    }

    const transferState = ctx.session.transferState;
    const messageText =
      ctx.message && "text" in ctx.message ? ctx.message.text : undefined;

    if (!messageText) {
      await ctx.reply(
        MessageService.getErrorMessage(
          "Invalid input. Please try again or type /cancel to cancel."
        )
      );
      return true;
    }

    if (messageText.toLowerCase() === "/cancel") {
      delete ctx.session.transferState;
      await ctx.reply("✅ Transfer cancelled.");
      return true;
    }

    if (transferState.step === "token_input") {
      const parts = messageText.trim().split(/\s+/);

      if (transferState.type === "all_tokens") {
        if (parts.length !== 2) {
          await ctx.reply(
            MessageService.getErrorMessage(
              "Please enter the token address and recipient address in the format: tokenAddress recipientAddress"
            )
          );
          return true;
        }

        const [tokenAddress, recipientAddress] = parts;

        if (!solanaService.validateAddress(tokenAddress)) {
          await ctx.reply(
            MessageService.getErrorMessage(
              "Invalid token address. Please check and try again."
            )
          );
          return true;
        }

        if (!solanaService.validateAddress(recipientAddress)) {
          await ctx.reply(
            MessageService.getErrorMessage(
              "Invalid recipient address. Please check and try again."
            )
          );
          return true;
        }

        // Store the values in the state for later use
        transferState.tokenAddress = tokenAddress;
        transferState.recipientAddress = recipientAddress;

        // For transfer all, we'll get the balance later
        ctx.session.transferState = {
          ...transferState,
          step: "token_confirmation",
        };
      } else {
        // For transfer specific amount of tokens
        if (parts.length !== 3) {
          await ctx.reply(
            MessageService.getErrorMessage(
              "Please enter the token address, recipient address, and amount in the format: tokenAddress recipientAddress amount"
            )
          );
          return true;
        }

        const [tokenAddress, recipientAddress, amountStr] = parts;
        const amount = parseFloat(amountStr);

        if (!solanaService.validateAddress(tokenAddress)) {
          await ctx.reply(
            MessageService.getErrorMessage(
              "Invalid token address. Please check and try again."
            )
          );
          return true;
        }

        if (!solanaService.validateAddress(recipientAddress)) {
          await ctx.reply(
            MessageService.getErrorMessage(
              "Invalid recipient address. Please check and try again."
            )
          );
          return true;
        }

        if (isNaN(amount) || amount <= 0) {
          await ctx.reply(
            MessageService.getErrorMessage(
              "Please enter a valid amount greater than 0."
            )
          );
          return true;
        }

        // Store the values in the state for later use
        transferState.tokenAddress = tokenAddress;
        transferState.recipientAddress = recipientAddress;
        transferState.amount = amount;

        ctx.session.transferState = {
          ...transferState,
          tokenAddress,
          recipientAddress,
          amount,
          step: "token_confirmation",
        };
      }

      // Get token info
      await ctx.reply("⏳ Looking up token information...");

      try {
        // Get token balance and info
        const { balance, decimals } = await solanaService.getTokenBalance(
          ctx.user?.walletAddress as string,
          transferState.tokenAddress as string
        );

        if (
          transferState.type === "token" &&
          balance < (transferState.amount as number)
        ) {
          await ctx.reply(
            MessageService.getErrorMessage(
              `Insufficient token balance. You have ${balance} tokens available.`
            )
          );
          return true;
        }

        const tokenInfo = await jupiterService.getTokenInfo(
          transferState.tokenAddress as string
        );

        if (!tokenInfo) {
          throw new Error("Could not get token information");
        }

        if (transferState.type === "all_tokens") {
          if (balance <= 0) {
            await ctx.reply(
              MessageService.getErrorMessage(
                `You don't have any ${tokenInfo.symbol} tokens to transfer.`
              )
            );
            return true;
          }

          ctx.session.transferState = {
            ...transferState,
            tokenSymbol: tokenInfo.symbol,
            tokenName: tokenInfo.name,
            amount: balance,
            decimals,
            step: "token_confirmation",
          };

          // Send confirmation message for transfer all
          await ctx.reply(
            `🔍 *Confirm Transfer All Tokens*\n\n` +
              `You are about to send *ALL ${balance} ${tokenInfo.symbol}* (${tokenInfo.name}) to:\n` +
              `\`${transferState.recipientAddress}\`\n\n` +
              `Please confirm this transaction by clicking the button below.`,
            {
              parse_mode: "Markdown",
              reply_markup: getTransferConfirmKeyboard(),
            }
          );
        } else {
          // For transfer specific amount
          ctx.session.transferState = {
            ...transferState,
            tokenSymbol: tokenInfo.symbol,
            tokenName: tokenInfo.name,
            decimals,
            step: "token_confirmation",
          };

          // Send confirmation message for specific amount
          await ctx.reply(
            MessageService.getTransferTokenConfirmationMessage(
              tokenInfo.symbol,
              tokenInfo.name,
              transferState.recipientAddress as string,
              transferState.amount as number
            ),
            {
              parse_mode: "Markdown",
              reply_markup: getTransferConfirmKeyboard(),
            }
          );
        }
      } catch (error) {
        console.error("Error getting token info:", error);
        await ctx.reply(
          MessageService.getErrorMessage(
            `Failed to get token information: ${error instanceof Error ? error.message : "Unknown error"}`
          )
        );
        delete ctx.session.transferState;
      }

      return true;
    } else if (transferState.step === "address_input") {
      const parts = messageText.trim().split(/\s+/);
      let recipientAddress, amount;

      if (transferState.type === "all_sol") {
        if (parts.length !== 1) {
          await ctx.reply(
            MessageService.getErrorMessage(
              "Please enter only the recipient address for transferring all SOL."
            )
          );
          return true;
        }
        recipientAddress = parts[0];
        amount = transferState.amount;
      } else {
        if (parts.length !== 2) {
          await ctx.reply(
            MessageService.getErrorMessage(
              "Please enter both recipient address and amount in the format: address amount"
            )
          );
          return true;
        }
        recipientAddress = parts[0];
        amount = parseFloat(parts[1]);

        if (isNaN(amount) || amount <= 0) {
          await ctx.reply(
            MessageService.getErrorMessage(
              "Please enter a valid amount greater than 0."
            )
          );
          return true;
        }
      }

      if (!solanaService.validateAddress(recipientAddress)) {
        await ctx.reply(
          MessageService.getErrorMessage(
            "Invalid Solana address. Please check and try again."
          )
        );
        return true;
      }

      const solPrice = await solanaService.getSolPrice();
      const usdValue = (amount as number) * solPrice;

      ctx.session.transferState = {
        ...transferState,
        recipientAddress,
        amount: amount as number,
        step: "confirmation",
      };

      await ctx.reply(
        MessageService.getTransferConfirmationMessage(
          recipientAddress,
          amount as number,
          usdValue
        ),
        {
          parse_mode: "Markdown",
          reply_markup: getTransferConfirmKeyboard(),
        }
      );

      return true;
    }

    return false;
  } catch (error) {
    console.error("Transfer input error:", error);
    await ctx.reply(
      MessageService.getErrorMessage(
        "Error processing transfer. Please try again."
      )
    );
    return true;
  }
}

export async function handleTwoFactorInput(ctx: BotContext, _server: FastifyInstance) {
  try {
    const messageText = ctx.message && 'text' in ctx.message ? ctx.message.text : undefined;

    // Check if we're in 2FA verification state
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
    if (!verificationState) {
      return false;
    }

    // Verify 2FA code and handle result
    const isValid = await verifyTwoFactorCode(ctx, messageText.trim());
    if (isValid && verificationState.action === "export_private_key") {
      await handleWalletExport(ctx);
    }

    return true;
  } catch (error) {
    console.error("2FA verification error:", error);
    await ctx.reply(MessageService.getErrorMessage("Error verifying 2FA code. Please try again."));
    return true;
  }
}

async function verifyTwoFactorCode(ctx: BotContext, code: string): Promise<boolean> {
  const verificationState = ctx.session?.twoFactorVerification;
  if (!verificationState) return false;

  // Get user's 2FA secret
  const userInfo = await userService.getUserByTelegramId(ctx.user.telegramId as string);
  if (!userInfo?.twoFactorSecret) {
    await ctx.reply(MessageService.getErrorMessage("2FA not properly configured. Please contact support."));
    delete ctx.session?.twoFactorVerification;
    return false;
  }

  // Verify the 2FA code
  const verification = twoFactorAuthService.verifyToken(userInfo.twoFactorSecret, code);

  if (verification.isValid) {
    // 2FA verification successful
    delete ctx.session?.twoFactorVerification;
    return true;
  } else {
    // Invalid code - handle attempts
    verificationState.attempts = (verificationState.attempts || 0) + 1;
    const remainingAttempts = (verificationState.maxAttempts || 3) - verificationState.attempts;

    if (remainingAttempts <= 0) {
      delete ctx.session?.twoFactorVerification;
      await ctx.reply(MessageService.getTwoFactorTooManyAttemptsMessage(), {
        parse_mode: "Markdown"
      });
    } else {
      await ctx.reply(MessageService.getTwoFactorInvalidCodeWithAttemptsMessage(remainingAttempts), {
        parse_mode: "Markdown"
      });
    }
    
    return false;
  }
}

async function handleWalletExport(ctx: BotContext) {
  try {
    
    const walletData = await WalletService.exportAndDecryptWallet(ctx.user?.walletId as string);
    
    
    const exportMessage = MessageService.getWalletExportMessage(
      ctx.user?.walletAddress as string,
      walletData.privateKey
    );
    
    await ctx.reply(exportMessage, {
      parse_mode: "Markdown"
    });
  } catch (error) {
    console.error("Export wallet error:", error);
    await ctx.reply(MessageService.getErrorMessage("Failed to export wallet. Please try again."));
  }
}

export async function handleWalletCallback(ctx: BotContext, _server: FastifyInstance) {
  try {
    const callbackData =
      ctx.callbackQuery && "data" in ctx.callbackQuery
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
            await ctx.reply(
              MessageService.getErrorMessage(
                "No wallet found. Please try again."
              )
            );
            return;
          }

          const solBalance = await solanaService.getBalance(
            ctx.user.walletAddress
          );

          ctx.session = {
            ...ctx.session,
            transferState: {
              type: "all_sol",
              amount: solBalance,
              step: "address_input",
            },
          };

          await ctx.reply(MessageService.getTransferAllSolRequestMessage(), {
            parse_mode: "Markdown",
            reply_markup: { force_reply: true },
          });
        } catch (error) {
          console.error("Transfer all SOL error:", error);
          await ctx.reply(
            MessageService.getErrorMessage(
              "Failed to prepare transfer. Please try again."
            )
          );
        }
        break;

      case "transfer_x_sol":
        try {
          await ctx.answerCbQuery("⏳ Preparing to transfer SOL");

          ctx.session = {
            ...ctx.session,
            transferState: {
              type: "specific_sol",
              step: "address_input",
            },
          };

          await ctx.reply(MessageService.getTransferSolRequestMessage(), {
            parse_mode: "Markdown",
            reply_markup: { force_reply: true },
          });
        } catch (error) {
          console.error("Transfer X SOL error:", error);
          await ctx.reply(
            MessageService.getErrorMessage(
              "Failed to prepare transfer. Please try again."
            )
          );
        }
        break;

      case "transfer_all_tokens":
        try {
          await ctx.answerCbQuery("⏳ Preparing to transfer all tokens");

          ctx.session = {
            ...ctx.session,
            transferState: {
              type: "all_tokens",
              step: "token_input",
            },
          };

          await ctx.reply(MessageService.getTransferAllTokensRequestMessage(), {
            parse_mode: "Markdown",
            reply_markup: { force_reply: true },
          });
        } catch (error) {
          console.error("Transfer all tokens error:", error);
          await ctx.reply(
            MessageService.getErrorMessage(
              "Failed to prepare token transfer. Please try again."
            )
          );
        }
        break;

      case "transfer_x_tokens":
        try {
          await ctx.answerCbQuery("⏳ Preparing to transfer tokens");

          ctx.session = {
            ...ctx.session,
            transferState: {
              type: "token",
              step: "token_input",
            },
          };

          await ctx.reply(MessageService.getTransferTokenRequestMessage(), {
            parse_mode: "Markdown",
            reply_markup: { force_reply: true },
          });
        } catch (error) {
          console.error("Transfer X tokens error:", error);
          await ctx.reply(
            MessageService.getErrorMessage(
              "Failed to prepare token transfer. Please try again."
            )
          );
        }
        break;

      case "export_private_key":
        try {
          await ctx.answerCbQuery("🔐 Checking export status...");
          
          if (!ctx.user?.walletId) {
            await ctx.reply(MessageService.getErrorMessage("No wallet ID found to export"));
            return;
          }

          // Get user info
          const userInfo = await userService.getUserByTelegramId(ctx.user.telegramId);
          
          // If user has never exported private key before, show warning and ask for confirmation
          if (!userInfo?.hasExportedPrivateKey) {
            await ctx.reply(MessageService.getFirstTimeExportWarningMessage(), {
              parse_mode: "Markdown",
              reply_markup: {
                inline_keyboard: [
                  [
                    { text: "✅ Yes, Export Private Key", callback_data: "confirm_first_export" },
                    { text: "❌ Cancel", callback_data: "cancel_export" }
                  ]
                ]
              }
            });
            return;
          }

          // If user has exported before, check 2FA
          if (!userInfo?.twoFactorEnabled) {
            await ctx.reply(MessageService.getTwoFactorRequiredForExportMessage(), {
              parse_mode: "Markdown"
            });
            return;
          }

          // User has 2FA enabled, request verification code
          ctx.session = {
            ...ctx.session,
            twoFactorVerification: {
              action: "export_private_key",
              step: "waiting_for_code",
              attempts: 0,
              maxAttempts: 3
            }
          };

          await ctx.reply(MessageService.getTwoFactorVerificationRequiredMessage(), {
            parse_mode: "Markdown"
          });
          
        } catch (error) {
          console.error("Export wallet error:", error);
          await ctx.answerCbQuery("❌ Failed to check export status");
          await ctx.reply(MessageService.getErrorMessage("Error checking export status. Please try again."));
        }
        break;

      case "confirm_first_export":
        try {
          await ctx.answerCbQuery("🔐 Exporting private key...");
          
          if (!ctx.user?.walletId) {
            await ctx.reply(MessageService.getErrorMessage("No wallet ID found to export"));
            return;
          }

          // Export the private key
          await handleWalletExport(ctx);
          
          // Mark as exported
          await userService.markPrivateKeyExported(ctx.user.id);
          
          // Show reminder about future 2FA requirement
          await ctx.reply(MessageService.getFirstTimeExportSuccessMessage(), {
            parse_mode: "Markdown"
          });
          
        } catch (error) {
          console.error("First export error:", error);
          await ctx.answerCbQuery("❌ Failed to export private key");
          await ctx.reply(MessageService.getErrorMessage("Error exporting private key. Please try again."));
        }
        break;

      case "cancel_export":
        try {
          await ctx.answerCbQuery("✅ Export cancelled");
          await ctx.reply(MessageService.getExportCancelledMessage());
        } catch (error) {
          console.error("Cancel export error:", error);
          await ctx.reply(MessageService.getErrorMessage("Error cancelling export."));
        }
        break;

      case "confirm_transfer": {
        let processingMessage: any;
        try {
          await ctx.answerCbQuery("⏳ Processing transfer...");

          if (!ctx.session) {
            ctx.session = {};
          }
          const transferState = ctx.session.transferState;
          if (
            !transferState ||
            !transferState.recipientAddress ||
            !transferState.amount
          ) {
            await ctx.reply(
              MessageService.getErrorMessage(
                "Transfer details not found. Please try again."
              )
            );
            return;
          }

          if (!ctx.user?.walletId) {
            await ctx.reply(
              MessageService.getErrorMessage(
                "Wallet ID not found. Please try again."
              )
            );
            return;
          }

          const processingMessage = await ctx.reply(
            MessageService.getProcessingTransactionMessage(),
            {
              parse_mode: "Markdown",
            }
          );

          // Check if this is a token transfer or SOL transfer
          if (
            (transferState.type === "token" ||
              transferState.type === "all_tokens") &&
            transferState.tokenAddress &&
            transferState.step === "token_confirmation"
          ) {
            const result = await solanaService.transferToken({
              walletId: ctx.user.walletId,
              walletAddress: ctx.user.walletAddress as string,
              recipientAddress: transferState.recipientAddress,
              tokenAddress: transferState.tokenAddress,
              amount: transferState.amount,
              decimals: transferState.decimals || 0,
            });
            const { signature } = result;

            const message = MessageService.getTransferTokenSuccessMessage(
              transferState.tokenSymbol || "Unknown",
              transferState.recipientAddress,
              transferState.amount,
              signature
            );
            try {
              await ctx.telegram.deleteMessage(
                ctx.chat?.id as number,
                processingMessage.message_id
              );
            } catch (err) {
              // Continue even if delete fails
            }

            await ctx.reply(message, { parse_mode: "Markdown" });
          } else {
            const requestedAmount = transferState.amount;

            const result = await solanaService.transferSol({
              walletId: ctx.user.walletId,
              walletAddress: ctx.user.walletAddress as string,
              recipientAddress: transferState.recipientAddress,
              amount: transferState.amount,
            });

            const { signature, actualAmount } = result;

            let message;
            if (
              actualAmount !== undefined &&
              Math.abs(actualAmount - requestedAmount) > 0.00001
            ) {
              message = MessageService.getTransferSuccessWithAdjustmentMessage(
                transferState.recipientAddress,
                requestedAmount,
                actualAmount,
                signature
              );
            } else {
              message = MessageService.getTransferSuccessMessage(
                transferState.recipientAddress,
                requestedAmount,
                signature
              );
            }

            try {
              await ctx.telegram.deleteMessage(
                ctx.chat?.id as number,
                processingMessage.message_id
              );
            } catch (err) {
              // Continue even if delete fails
            }

            await ctx.reply(message, { parse_mode: "Markdown" });
          }

          delete ctx.session.transferState;
        } catch (error) {
          console.error("Transfer confirmation error:", error);
          if (processingMessage) {
            try {
              await ctx.telegram.deleteMessage(
                ctx.chat?.id as number,
                processingMessage.message_id
              );
            } catch (err) {
              // Continue even if delete fails
            }
          }

          await ctx.reply(
            MessageService.getTransferErrorMessage(
              error instanceof Error ? error.message : "Unknown error occurred"
            ),
            { parse_mode: "Markdown" }
          );
        }
        break;
      }
        
      case "cancel_transfer":
        try {
          await ctx.answerCbQuery("✅ Transfer cancelled");
          delete ctx.session?.transferState;
          await ctx.reply("✅ Transfer cancelled.");
        } catch (error) {
          console.error("Cancel transfer error:", error);
          await ctx.reply(
            MessageService.getErrorMessage("Error cancelling transfer.")
          );
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
