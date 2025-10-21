// import { Telegraf } from "telegraf";
// import { FastifyInstance } from "fastify";
// import { referralService } from "@/services/referral.service";
// import { MessageService } from "@/services/message.service";
// import { BotContext } from "@/types/bot.types";

// export function referralCommand(
//   bot: Telegraf<BotContext>,
//   _server: FastifyInstance
// ) {
//   bot.command("referral", async (ctx: BotContext) => {
//     try {
//       if (!ctx.user) {
//         await ctx.reply(
//           MessageService.getErrorMessage("Authentication failed")
//         );
//         return;
//       }

//       await showReferralInfo(ctx);
//     } catch (error) {
//       console.error("Error in referral command:", error);
//       await ctx.reply(MessageService.getErrorMessage());
//     }
//   });

//   bot.action("referral", async (ctx: BotContext) => {
//     try {
//       if (!ctx.user) {
//         await ctx.answerCbQuery("❌ Authentication failed");
//         return;
//       }

//       await showReferralInfo(ctx);
//       await ctx.answerCbQuery();
//     } catch (error) {
//       console.error("Error in referral action:", error);
//       await ctx.answerCbQuery("❌ Error loading referral information");
//     }
//   });

//   bot.action(/copy_referral_(.+)/, async (ctx) => {
//     try {
//       const referralCode = ctx.match[1];
//       const botUsername = process.env.BOT_USERNAME;
//       const referralLink = `https://t.me/${botUsername}?start=${referralCode}`;

//       await ctx.answerCbQuery(`Referral link copied: ${referralLink}`);
//       await ctx.reply(
//         `✅ Referral link copied to clipboard!\n\n${referralLink}`
//       );
//     } catch (error) {
//       console.error("Error copying referral link:", error);
//       await ctx.answerCbQuery("❌ Error copying referral link");
//     }
//   });

//   bot.action("referral_history", async (ctx: BotContext) => {
//     try {
//       if (!ctx.user) {
//         await ctx.answerCbQuery("❌ Authentication failed");
//         return;
//       }

//       const referralHistory = await referralService.getReferralHistory(
//         ctx.user.telegramId
//       );

//       if (referralHistory.length === 0) {
//         await ctx.reply(
//           "📊 *Referral History*\n\nYou haven't referred anyone yet. Share your referral link to start earning!"
//         );
//       } else {
//         let message = "📊 *Referral History*\n\n";

//         referralHistory.forEach((referral, index) => {
//           const username = referral.referred.username || "Unknown User";
//           const date = new Date(referral.createdAt).toLocaleDateString();
//           message += `${index + 1}. @${username} - ${date}\n`;
//         });

//         message += `\nTotal Referrals: ${referralHistory.length}`;

//         await ctx.reply(message, {
//           parse_mode: "Markdown",
//         });
//       }

//       await ctx.answerCbQuery();
//     } catch (error) {
//       console.error("Error showing referral history:", error);
//       await ctx.answerCbQuery("❌ Error loading referral history");
//     }
//   });

//   bot.action("main_menu", async (ctx: BotContext) => {
//     try {
//       await ctx.answerCbQuery();
//     } catch (error) {
//       console.error("Error handling main menu callback:", error);
//     }
//   });
// }

// async function showReferralInfo(ctx: BotContext) {
//   const referralInfo = await referralService.getReferralInfo(
//     ctx.user!.telegramId
//   );

//   if (!referralInfo) {
//     await ctx.reply("❌ Error loading referral information");
//     return;
//   }

//   const message = `🧧 *Referral Rewards*

// Refer your friends and earn 10% of their fees + points!     
// Your Reflink: \`${referralInfo.referralLink}\` (tap to copy)
    
// Referrals: ${referralInfo.stats.totalReferrals} users

// Lifetime Fees Earned: ${referralInfo.stats.totalFeesEarned} points ($${(referralInfo.stats.totalFeesEarned * 0.01).toFixed(2)})

// Total Points: ${referralInfo.stats.totalPointsEarned} points

// *How it works:*
// • Share your referral link with friends
// • When they join using your link, you both get bonus points
// • You earn 10% of any fees they generate
// • Points can be used for future rewards and features`;

//   await ctx.reply(message, {
//     parse_mode: "Markdown",
//     reply_markup: {
//       inline_keyboard: [
//         [
//           {
//             text: "📋 Copy Referral Link",
//             callback_data: `copy_referral_${referralInfo.referralCode}`,
//           },
//         ],
//         [
//           {
//             text: "📊 Referral History",
//             callback_data: "referral_history",
//           },
//         ],
//         [
//           {
//             text: "🔙 Back to Menu",
//             callback_data: "main_menu",
//           },
//         ],
//       ],
//     },
//   });
// }
