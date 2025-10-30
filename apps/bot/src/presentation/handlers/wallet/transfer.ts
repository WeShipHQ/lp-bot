import { FastifyInstance } from "fastify";
import { BotContext } from "@/types/bot.types";
// import { MessageService } from "@/services/message.service";
import { solanaService } from "@/services/solana.service";
import { jupiterService } from "@/services/jupiter.service";
import { getTransferConfirmKeyboard } from "@/presentation/keyboards/wallet-menu";
import { GetBalanceUseCase } from "@/application/wallet/get-balance.use-case";
import { SendTokensUseCase } from "@/application/wallet/send-tokens.use-case";
import { container } from "@/infrastructure/di/container";
import { formatPrice } from "@/presentation/formatters/base.formatter";

export async function handleTransferInput(
  ctx: BotContext,
  _server: FastifyInstance
) {
  try {
    if (!ctx.session?.transferState) {
      return false;
    }

    const transferState = ctx.session.transferState;
    const messageText =
      ctx.message && "text" in ctx.message ? ctx.message.text : undefined;

    if (!messageText) {
      await ctx.reply(
        "Invalid input. Please try again or type /cancel to cancel."
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
            "Please enter the token address and recipient address in the format: tokenAddress recipientAddress"
          );
          return true;
        }

        const [tokenAddress, recipientAddress] = parts;

        if (!solanaService.validateAddress(tokenAddress)) {
          await ctx.reply("Invalid token address. Please check and try again.");
          return true;
        }

        if (!solanaService.validateAddress(recipientAddress)) {
          await ctx.reply(
            "Invalid recipient address. Please check and try again."
          );
          return true;
        }

        transferState.tokenAddress = tokenAddress;
        transferState.recipientAddress = recipientAddress;

        ctx.session.transferState = {
          ...transferState,
          step: "token_confirmation",
        };
      } else {
        if (parts.length !== 3) {
          await ctx.reply(
            "Please enter the token address, recipient address, and amount in the format: tokenAddress recipientAddress amount"
          );
          return true;
        }

        const [tokenAddress, recipientAddress, amountStr] = parts;
        const amount = parseFloat(amountStr);

        if (!solanaService.validateAddress(tokenAddress)) {
          await ctx.reply("Invalid token address. Please check and try again.");
          return true;
        }

        if (!solanaService.validateAddress(recipientAddress)) {
          await ctx.reply(
            "Invalid recipient address. Please check and try again."
          );
          return true;
        }

        if (isNaN(amount) || amount <= 0) {
          await ctx.reply("Please enter a valid amount greater than 0.");
          return true;
        }

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

      await ctx.reply("⏳ Looking up token information...");

      try {
        const { balance, decimals } = await solanaService.getTokenBalance(
          ctx.user?.walletAddress as string,
          transferState.tokenAddress as string
        );

        if (
          transferState.type === "token" &&
          balance < (transferState.amount as number)
        ) {
          await ctx.reply(
            `Insufficient token balance. You have ${balance} tokens available.`
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
              `You don't have any ${tokenInfo.symbol} tokens to transfer.`
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
          ctx.session.transferState = {
            ...transferState,
            tokenSymbol: tokenInfo.symbol,
            tokenName: tokenInfo.name,
            decimals,
            step: "token_confirmation",
          };

          await ctx.reply(
            `🔍 *Confirm Token Transfer*\n\n` +
              `You are about to send *${transferState.amount} ${tokenInfo.symbol}* (${tokenInfo.name}) to:\n` +
              `\`${transferState.recipientAddress}\`\n\n` +
              `Please confirm this transaction by clicking the button below.`,
            {
              parse_mode: "Markdown",
              reply_markup: getTransferConfirmKeyboard(),
            }
          );
        }
      } catch (error) {
        await ctx.reply(
          `Failed to get token information: ${error instanceof Error ? error.message : "Unknown error"}`
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
            "Please enter only the recipient address for transferring all SOL."
          );
          return true;
        }
        recipientAddress = parts[0];
        amount = transferState.amount;
      } else {
        if (parts.length !== 2) {
          await ctx.reply(
            "Please enter both recipient address and amount in the format: address amount"
          );
          return true;
        }
        recipientAddress = parts[0];
        amount = parseFloat(parts[1]);

        if (isNaN(amount) || amount <= 0) {
          await ctx.reply("Please enter a valid amount greater than 0.");
          return true;
        }
      }

      if (!solanaService.validateAddress(recipientAddress)) {
        await ctx.reply("Invalid Solana address. Please check and try again.");
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
        `🔍 *Confirm Transfer*\n\n` +
          `You are about to send *${amount} SOL* (${formatPrice(usdValue)}) to:\n` +
          `\`${recipientAddress}\`\n\n` +
          `Please confirm this transaction by clicking the button below.`,
        {
          parse_mode: "Markdown",
          reply_markup: getTransferConfirmKeyboard(),
        }
      );

      return true;
    }

    return false;
  } catch (error) {
    await ctx.reply("Error processing transfer. Please try again.");
    return true;
  }
}

export async function prepareTransferAllSol(ctx: BotContext) {
  if (!ctx.user?.walletAddress) {
    await ctx.reply("No wallet found. Please try again.");
    return;
  }
  const balanceUc = container.get(GetBalanceUseCase);
  const { sol: solBalance } = await balanceUc.execute(ctx.user.walletAddress);

  ctx.session = {
    ...ctx.session,
    transferState: {
      type: "all_sol",
      amount: solBalance,
      step: "address_input",
    },
  };

  await ctx.reply(
    "💸 *Transfer ALL SOL*\n\nPlease enter the recipient's wallet address:\n\n`address`\n\nExample: `GgS64xkW9JqR3VkBn4fpPi7sMqcnAzqRWTUXbBZhHpLT`\n\nThis will transfer your entire SOL balance (minus transaction fees).\n\nOr type /cancel to cancel the transfer.",
    {
      parse_mode: "Markdown",
      reply_markup: { force_reply: true },
    }
  );
}

export async function prepareTransferSolAmount(ctx: BotContext) {
  ctx.session = {
    ...ctx.session,
    transferState: {
      type: "specific_sol",
      step: "address_input",
    },
  };

  await ctx.reply(
    "💸 *Transfer SOL*\n\nPlease enter the recipient's wallet address and the amount to transfer in the format:\n\n`address amount`\n\nExample: `GgS64xkW9JqR3VkBn4fpPi7sMqcnAzqRWTUXbBZhHpLT 0.1`\n\nOr type /cancel to cancel the transfer.",
    {
      parse_mode: "Markdown",
      reply_markup: { force_reply: true },
    }
  );
}

export async function prepareTransferAllTokens(ctx: BotContext) {
  ctx.session = {
    ...ctx.session,
    transferState: {
      type: "all_tokens",
      step: "token_input",
    },
  };

  await ctx.reply(
    "💸 *Transfer All of a Token*\n\nPlease enter the token address and recipient address in the format:\n\n`tokenAddress recipientAddress`\n\nExample: `EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v GgS64xkW9JqR3VkBn4fpPi7sMqcnAzqRWTUXbBZhHpLT`\n\nThis will transfer your entire balance of the specified token.\n\nNote: The recipient must have already interacted with this token before. They need to have a token account for this specific token.\n\nOr type /cancel to cancel the transfer.",
    {
      parse_mode: "Markdown",
      reply_markup: { force_reply: true },
    }
  );
}

export async function prepareTransferTokensAmount(ctx: BotContext) {
  ctx.session = {
    ...ctx.session,
    transferState: {
      type: "token",
      step: "token_input",
    },
  };

  await ctx.reply(
    "💸 *Transfer SPL Token*\n\nPlease enter the token address, recipient address, and amount to transfer in the format:\n\n`tokenAddress recipientAddress amount`\n\nExample: `EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v GgS64xkW9JqR3VkBn4fpPi7sMqcnAzqRWTUXbBZhHpLT 10`\n\nNote: The recipient must have already interacted with this token before. They need to have a token account for this specific token.\n\nOr type /cancel to cancel the transfer.",
    {
      parse_mode: "Markdown",
      reply_markup: { force_reply: true },
    }
  );
}

export async function confirmTransfer(ctx: BotContext) {
  let processingMessage: any;
  if (!ctx.session) ctx.session = {} as any;
  // @ts-expect-error
  const transferState = ctx.session.transferState;
  if (
    !transferState ||
    !transferState.recipientAddress ||
    !transferState.amount
  ) {
    await ctx.reply("Transfer details not found. Please try again.");
    return;
  }
  if (!ctx.user?.walletId) {
    await ctx.reply("Wallet ID not found. Please try again.");
    return;
  }

  processingMessage = await ctx.reply(
    "⏳ *Processing Transaction*\n\nYour transaction is being processed. Please wait a moment...\n\n_Please do not click the confirm button again to avoid duplicate transactions._",
    { parse_mode: "Markdown" }
  );

  try {
    if (
      (transferState.type === "token" || transferState.type === "all_tokens") &&
      transferState.tokenAddress &&
      transferState.step === "token_confirmation"
    ) {
      const sendUc = container.get(SendTokensUseCase);
      const { signature } = await sendUc.execute({
        userId: ctx.user.id,
        recipientAddress: transferState.recipientAddress,
        amount: transferState.amount,
        tokenAddress: transferState.tokenAddress,
      });

      const message =
        `*Token Transfer Successful*\n\n` +
        `Successfully sent *${transferState.amount} ${transferState.tokenSymbol || "Unknown"}* to:\n` +
        `\`${transferState.recipientAddress}\`\n\n` +
        `Transaction signature:\n` +
        `\`${signature}\`\n\n` +
        `View on Solscan: https://solscan.io/tx/${signature}`;

      try {
        await ctx.telegram.deleteMessage(
          ctx.chat?.id as number,
          processingMessage.message_id
        );
      } catch {}

      await ctx.reply(message, { parse_mode: "Markdown" });
    } else {
      const requestedAmount = transferState.amount;
      const sendUc = container.get(SendTokensUseCase);
      const { signature, actualAmount } = await sendUc.execute({
        userId: ctx.user.id,
        recipientAddress: transferState.recipientAddress,
        amount: transferState.amount,
      });

      let message;
      if (
        actualAmount !== undefined &&
        Math.abs(actualAmount - requestedAmount) > 0.00001
      ) {
        message =
          `✅ *Transfer Successful*\n\n` +
          `You requested to send *${requestedAmount} SOL*, but the amount was adjusted to *${actualAmount} SOL* to account for transaction fees.\n\n` +
          `Successfully sent to:\n` +
          `\`${transferState.recipientAddress}\`\n\n` +
          `Transaction signature:\n` +
          `\`${signature}\`\n\n` +
          `View on Solscan: https://solscan.io/tx/${signature}`;
      } else {
        message =
          `✅ *Transfer Successful*\n\n` +
          `Successfully sent *${actualAmount} SOL* to:\n` +
          `\`${transferState.recipientAddress}\`\n\n` +
          `Transaction signature:\n` +
          `\`${signature}\`\n\n` +
          `View on Solscan: https://solscan.io/tx/${signature}`;
      }

      try {
        await ctx.telegram.deleteMessage(
          ctx.chat?.id as number,
          processingMessage.message_id
        );
      } catch {}

      await ctx.reply(message, { parse_mode: "Markdown" });
    }

    delete ctx.session?.transferState;
  } catch (error) {
    if (processingMessage) {
      try {
        await ctx.telegram.deleteMessage(
          ctx.chat?.id as number,
          processingMessage.message_id
        );
      } catch {}
    }
    await ctx.reply(
      error instanceof Error ? error.message : "Unknown error occurred",
      { parse_mode: "Markdown" }
    );
  }
}

export async function cancelTransfer(ctx: BotContext) {
  delete ctx.session?.transferState;
  await ctx.reply("✅ Transfer cancelled.");
}
