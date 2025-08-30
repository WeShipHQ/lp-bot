import { Context } from "telegraf";
import { FastifyInstance } from "fastify";
import { jupiterService } from "../../services/jupiter.service";
import { meteoraPoolService } from "../../services/meteora/pool.service";
import { poolDiscoveryService } from "../../services/pool-discovery.service";
import { positionService } from "../../services/position.service";
import {
  formatPoolSelectionMessage,
  formatPositionConfirmation,
  formatErrorMessage,
} from "../utils/formatters";
import {
  getPoolSelectionKeyboard,
  getPositionConfirmationKeyboard,
} from "../keyboards";

export async function handlePositionCallback(
  ctx: Context,
  server: FastifyInstance
) {
  if (!ctx.callbackQuery || !("data" in ctx.callbackQuery)) {
    return;
  }

  const callbackData = ctx.callbackQuery.data;
  const parts = callbackData.split("_");
  const [action, type, address, poolType] = parts;

  if (action !== "position") {
    return;
  }

  try {
    await ctx.answerCbQuery("Processing...");

    switch (type) {
      case "token":
        await handleTokenPosition(ctx, address, server);
        break;
      case "pool":
        if (poolType && ["damm_v1", "damm_v2", "dlmm"].includes(poolType)) {
          await handlePoolPositionWithType(
            ctx,
            address,
            poolType as "damm_v1" | "damm_v2" | "dlmm",
            server
          );
        } else {
          // await handlePoolPosition(ctx, address, server);
        }
        break;
      default:
        await ctx.editMessageText(
          formatErrorMessage(address, "Invalid position type"),
          { parse_mode: "Markdown" }
        );
    }
  } catch (error) {
    server.log.error("Error handling position callback:", error);
    await ctx.answerCbQuery("Something went wrong. Please try again.");
  }
}

/**
 * Handle opening position for a specific pool with known type
 */
async function handlePoolPositionWithType(
  ctx: Context,
  poolAddress: string,
  poolType: "damm_v1" | "damm_v2" | "dlmm",
  server: FastifyInstance
) {
  try {
    server.log.info(`Opening position for ${poolType} pool: ${poolAddress}`);

    const poolData = await meteoraPoolService.getPoolInfo(
      poolAddress,
      poolType
    );
    if (!poolData) {
      await ctx.editMessageText(
        formatErrorMessage(poolAddress, "Pool not found"),
        { parse_mode: "Markdown" }
      );
      return;
    }

    // Show position confirmation with deposit options
    const message = formatPositionConfirmation(poolData);
    const keyboard = getPositionConfirmationKeyboard(poolAddress);

    await ctx.editMessageText(message, {
      parse_mode: "Markdown",
      reply_markup: {
        inline_keyboard: keyboard.inline_keyboard,
      },
    });
  } catch (error) {
    console.error(error);
    server.log.error(`Error opening position for pool ${poolAddress}:`, error);
    await ctx.editMessageText(
      formatErrorMessage(poolAddress, "Failed to open position for this pool"),
      { parse_mode: "Markdown" }
    );
  }
}

/**
 * Handle opening position for a token (need to find pools first)
 */
async function handleTokenPosition(
  ctx: Context,
  tokenAddress: string,
  server: FastifyInstance
) {
  try {
    server.log.info(`Finding pools for token: ${tokenAddress}`);

    // Get token info first
    const tokenInfo = await jupiterService.getTokenInfo(tokenAddress);
    if (!tokenInfo) {
      await ctx.editMessageText(
        formatErrorMessage(tokenAddress, "Token not found"),
        { parse_mode: "Markdown" }
      );
      return;
    }

    // Find available pools for this token
    const pools = await poolDiscoveryService.findPoolsForToken(tokenAddress);

    if (pools.length === 0) {
      await ctx.editMessageText(
        formatErrorMessage(
          tokenAddress,
          "No Meteora pools found for this token"
        ),
        { parse_mode: "Markdown" }
      );
      return;
    }

    if (pools.length === 1) {
      // Only one pool found, proceed directly to position creation
      await handlePoolPosition(ctx, pools[0].pool_address, "dlmm", server);
      return;
    }

    // Multiple pools found, show selection interface
    const message = formatPoolSelectionMessage(tokenInfo, pools);
    const keyboard = getPoolSelectionKeyboard(pools);

    await ctx.editMessageText(message, {
      parse_mode: "Markdown",
      reply_markup: keyboard,
    });
  } catch (error) {
    server.log.error(`Error finding pools for token ${tokenAddress}:`, error);
    await ctx.editMessageText(
      formatErrorMessage(tokenAddress, "Failed to find pools for this token"),
      { parse_mode: "Markdown" }
    );
  }
}

/**
 * Handle opening position for a specific pool
 */
async function handlePoolPosition(
  ctx: Context,
  poolAddress: string,
  poolType: "damm_v1" | "damm_v2" | "dlmm",
  server: FastifyInstance
) {
  try {
    server.log.info(`Opening position for pool: ${poolAddress}`);

    // Get pool information
    const poolData = await meteoraPoolService.getPoolInfo(
      poolAddress,
      poolType
    );
    if (!poolData) {
      await ctx.editMessageText(
        formatErrorMessage(poolAddress, "Pool not found"),
        { parse_mode: "Markdown" }
      );
      return;
    }

    // Show position confirmation with deposit options
    const message = formatPositionConfirmation(poolData);
    const keyboard = getPositionConfirmationKeyboard(poolAddress);

    await ctx.editMessageText(message, {
      parse_mode: "Markdown",
      reply_markup: keyboard,
    });
  } catch (error) {
    console.error(error);
    server.log.error(`Error opening position for pool ${poolAddress}:`, error);
    await ctx.editMessageText(
      formatErrorMessage(poolAddress, "Failed to open position for this pool"),
      { parse_mode: "Markdown" }
    );
  }
}

/**
 * Handle pool selection from multiple options
 */
export async function handlePoolSelection(
  ctx: Context,
  server: FastifyInstance
) {
  if (!ctx.callbackQuery || !("data" in ctx.callbackQuery)) {
    return;
  }

  const callbackData = ctx.callbackQuery.data;
  const [action, poolAddress] = callbackData.split("_", 2);

  if (action !== "select-pool") {
    return;
  }

  try {
    await ctx.answerCbQuery("Loading pool...");
    await handlePoolPosition(ctx, poolAddress, "dlmm", server);
  } catch (error) {
    server.log.error("Error handling pool selection:", error);
    await ctx.answerCbQuery("Failed to load pool. Please try again.");
  }
}

/**
 * Handle position creation confirmation
 */
export async function handlePositionCreation(
  ctx: Context,
  server: FastifyInstance
) {
  if (!ctx.callbackQuery || !("data" in ctx.callbackQuery)) {
    return;
  }

  const callbackData = ctx.callbackQuery.data;
  const [action, type, poolAddress] = callbackData.split("_");

  if (action !== "create-position") {
    return;
  }

  try {
    await ctx.answerCbQuery("Creating position...");

    // Mock position creation
    const result = await positionService.createPosition(
      // @ts-expect-error
      ctx.from?.id.toString() || "",
      poolAddress,
      type as "spot" | "curve" | "single",
      1.0 // Mock amount
    );

    if (result.success) {
      await ctx.editMessageText(
        `✅ **Position Created Successfully!**\n\n` +
          `🏊‍♂️ Pool: \`${poolAddress}\`\n` +
          `💰 Type: ${type.toUpperCase()}\n` +
          `💵 Amount: 1.0 SOL\n` +
          `📊 Transaction: \`${result.transactionId}\`\n\n` +
          `Your position is now active and earning fees!`,
        { parse_mode: "Markdown" }
      );
    } else {
      await ctx.editMessageText(
        formatErrorMessage(
          poolAddress,
          result.error || "Failed to create position"
        ),
        { parse_mode: "Markdown" }
      );
    }
  } catch (error) {
    server.log.error("Error creating position:", error);
    await ctx.answerCbQuery("Failed to create position. Please try again.");
  }
}
