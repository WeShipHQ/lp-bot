// import { FastifyInstance } from "fastify";
// import { twoFactorAuthService } from "../../services/two-factor-auth.service";
// import { MessageService } from "../../services/message.service";
// import { userService, UserInfo } from "../../services/user.service";
// import { tempStoreService } from "../../services/temp-store.service";
// import { BotContext } from "@/types/bot.types";

// export async function handleTwoFactorSetup(ctx: BotContext, _server: FastifyInstance) {
//   try {
//     const telegramUserId = ctx.from?.id?.toString();
//     if (!telegramUserId) {
//       await ctx.reply(MessageService.getErrorMessage("Authentication failed"));
//       return;
//     }

//     // Get user info
//     const userInfo = await getUserInfo(telegramUserId, ctx);
//     if (!userInfo) return;

//     // Check if 2FA is already enabled
//     if (userInfo.twoFactorEnabled) {
//       await ctx.reply(MessageService.getTwoFactorAlreadyEnabledMessage(), {
//         parse_mode: "Markdown"
//       });
//       return;
//     }

//     // Generate 2FA secret and QR code
//     await generateAndSend2FASetup(ctx, userInfo, telegramUserId);

//   } catch (error) {
//     console.error("Error in 2FA setup handler:", error);
//     await ctx.reply(MessageService.getErrorMessage("Error setting up 2FA"));
//   }
// }

// async function getUserInfo(telegramUserId: string, ctx: BotContext): Promise<UserInfo | null> {
//   try {
//     const userInfo = await userService.getUserByTelegramId(telegramUserId);
//     if (!userInfo) {
//       await ctx.reply("❌ User not found. Please use /start first.");
//       return null;
//     }
//     return userInfo;
//   } catch (error) {
//     console.error("Error getting user:", error);
//     await ctx.reply(MessageService.getErrorMessage("Failed to get user information"));
//     return null;
//   }
// }

// async function generateAndSend2FASetup(ctx: BotContext, userInfo: UserInfo, telegramUserId: string) {
//   try {
//     const setup = await twoFactorAuthService.generateSecret(userInfo.id);

//     const message = 
//       MessageService.getTwoFactorSetupMessage() +
//       "Click the button below when ready to verify:";

//     // Send QR code as photo with verify button
//     await ctx.replyWithPhoto(
//       { source: Buffer.from(setup.qrCodeUrl.split(',')[1], 'base64') },
//       {
//         caption: message,
//         parse_mode: "Markdown",
//         reply_markup: {
//           inline_keyboard: [
//             [{ text: "✅ I'm Ready to Verify", callback_data: "verifyTwoFactorReady" }]
//           ]
//         }
//       }
//     );

//     // Store the secret temporarily for verification
//     tempStoreService.setTemp2FAData(telegramUserId, setup.secret);

//   } catch (error) {
//     console.error("Error setting up 2FA:", error);
//     await ctx.reply(MessageService.getErrorMessage("Failed to setup 2FA"));
//   }
// }

// export async function handleTwoFactorVerification(ctx: BotContext, token: string) {
//   try {
//     const telegramUserId = ctx.from?.id?.toString();
//     if (!telegramUserId) {
//       await ctx.reply(MessageService.getErrorMessage("Authentication failed"));
//       return;
//     }

//     // Get temporary secret from store
//     const tempData = tempStoreService.getTemp2FAData(telegramUserId);
//     if (!tempData) {
//       await ctx.reply(MessageService.getTwoFactorNoSetupInProgressMessage(), {
//         parse_mode: "Markdown"
//       });
//       return;
//     }

//     const { secret: tempSecret } = tempData;

//     // Verify the token
//     const verification = twoFactorAuthService.verifyToken(tempSecret, token);

//     if (verification.isValid) {
//       await enable2FAForUser(ctx, telegramUserId, tempSecret);
//     } else {
//       await ctx.reply(MessageService.getTwoFactorInvalidCodeMessage(), {
//         parse_mode: "Markdown"
//       });
//     }

//   } catch (error) {
//     console.error("Error in 2FA verification:", error);
//     await ctx.reply(MessageService.getErrorMessage("Error verifying 2FA code"));
//   }
// }

// async function enable2FAForUser(ctx: BotContext, telegramUserId: string, secret: string) {
//   try {
//     const userInfo = await getUserInfo(telegramUserId, ctx);
//     if (!userInfo) return;

//     // Update user's 2FA settings in the database
//     const success = await userService.updateTwoFactorSettings(
//       userInfo.id,
//       true,
//       secret
//     );

//     if (success) {
//       await ctx.reply(MessageService.getTwoFactorEnabledSuccessMessage(), {
//         parse_mode: "Markdown"
//       });
//     } else {
//       await ctx.reply(MessageService.getErrorMessage("Failed to save 2FA settings! Please try again or contact support."), {
//         parse_mode: "Markdown"
//       });
//     }

//     // Clear temporary data
//     tempStoreService.removeTemp2FAData(telegramUserId);

//   } catch (error) {
//     console.error("Error enabling 2FA:", error);
//     await ctx.reply(MessageService.getErrorMessage("Failed to enable 2FA"));
//   }
// }

// export async function handleTwoFactorDisable(ctx: BotContext) {
//   try {
//     const telegramUserId = ctx.from?.id?.toString();
//     if (!telegramUserId) {
//       await ctx.reply(MessageService.getErrorMessage("Authentication failed"));
//       return;
//     }

//     const userInfo = await getUserInfo(telegramUserId, ctx);
//     if (!userInfo) return;

//     // Check if 2FA is enabled
//     if (!userInfo.twoFactorEnabled) {
//       await ctx.reply(MessageService.getTwoFactorNotEnabledMessage(), {
//         parse_mode: "Markdown"
//       });
//       return;
//     }

//     // In production, you'd require additional verification before disabling
//     await ctx.reply(MessageService.getTwoFactorDisableMessage(), {
//       parse_mode: "Markdown"
//     });

//   } catch (error) {
//     console.error("Error in 2FA disable handler:", error);
//     await ctx.reply(MessageService.getErrorMessage("Error processing 2FA disable request"));
//   }
// }

// export async function handleTwoFactorStatus(ctx: BotContext) {
//   try {
//     const telegramUserId = ctx.from?.id?.toString();
//     if (!telegramUserId) {
//       await ctx.reply(MessageService.getErrorMessage("Authentication failed"));
//       return;
//     }

//     const userInfo = await getUserInfo(telegramUserId, ctx);
//     if (!userInfo) return;

//     const keyboard = userInfo.twoFactorEnabled ? [] : [
//       [{ text: "🔐 Setup 2FA", callback_data: "setup_2fa" }]
//     ];

//     await ctx.reply(MessageService.getTwoFactorStatusMessage(userInfo.twoFactorEnabled || false), { 
//       parse_mode: "Markdown",
//       reply_markup: keyboard.length > 0 ? { inline_keyboard: keyboard } : undefined
//     });

//   } catch (error) {
//     console.error("Error in 2FA status handler:", error);
//     await ctx.reply(MessageService.getErrorMessage("Error getting 2FA status"));
//   }
// }
