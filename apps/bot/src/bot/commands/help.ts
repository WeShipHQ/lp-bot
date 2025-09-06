import DLMM from "@meteora-ag/dlmm";
import { Telegraf } from "telegraf";
import { BotContext } from "@/types/bot.types";
import { FastifyInstance } from "fastify";
import { SCENE_IDS } from "../config/scenes";
import { JupiterService } from "@/services/jupiter.service";
import { SOL_MINT } from "@/config/constants";
import { WalletService } from "@/services/wallet.service";
import {
  AddressLookupTableAccount,
  ComputeBudgetProgram,
  Connection,
  MessageCompiledInstruction,
  PublicKey,
  SystemProgram,
  TransactionInstruction,
  TransactionMessage,
  VersionedTransaction,
} from "@solana/web3.js";
import { CONFIG } from "@/config";

export function helpCommand(
  bot: Telegraf<BotContext>,
  _server: FastifyInstance
) {
  bot.command("help", async (ctx) => {
    // ctx.reply(
    //   "📖 Read FAQs in docs [here](https://docs.weisheep.fun/faqs) for answers to frequently asked questions.\n\n" +
    //     "Private beta users can join our [TG group](https://t.me/+tevTmc09Vw44M2E1) for further help and feedback. Access only granted to active users.\n\n" +
    //     "🤖 Backup Bots: [@weisheep_dark_bot](https://t.me/weisheep_dark_bot) and [@weisheep_light_bot](https://t.me/weisheep_light_bot)",
    //   { parse_mode: "Markdown" }
    // );

    return ctx.scene.enter(SCENE_IDS.POSITION_DETAIL_SCENE, {
      positionAddress: "9gx98op5K4Z5uYNEcamX1d7CPzPGXXBUMiJLhnrPJdQD",
    });

    // const startTime = Date.now();

    // const jupService = new JupiterService();
    // const walletService = new WalletService();

    // const res = await jupService.getOrder({
    //   inputMint: "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v",
    //   outputMint: SOL_MINT,
    //   amount: "1000000",
    //   taker: ctx.user.walletAddress!,
    // });

    // // console.log(res);

    // console.log(`get order in ${Date.now() - startTime}ms`);

    // const startTime2 = Date.now();

    // const tx = res.transaction!;
    // const transaction = VersionedTransaction.deserialize(
    //   Buffer.from(tx, "base64")
    // );

    // const connection = new Connection(CONFIG.SOLANA.RPC_URL, "confirmed");

    // const getAddressLookupTableAccounts = async (
    //   keys: string[]
    // ): Promise<AddressLookupTableAccount[]> => {
    //   const addressLookupTableAccountInfos =
    //     await connection.getMultipleAccountsInfo(
    //       keys.map((key) => new PublicKey(key))
    //     );

    //   return addressLookupTableAccountInfos.reduce(
    //     (acc, accountInfo, index) => {
    //       const addressLookupTableAddress = keys[index];
    //       if (accountInfo) {
    //         const addressLookupTableAccount = new AddressLookupTableAccount({
    //           key: new PublicKey(addressLookupTableAddress),
    //           state: AddressLookupTableAccount.deserialize(accountInfo.data),
    //         });
    //         acc.push(addressLookupTableAccount);
    //       }

    //       return acc;
    //     },
    //     new Array<AddressLookupTableAccount>()
    //   );
    // };

    // const lookupTableAccounts = await getAddressLookupTableAccounts(
    //   transaction.message.addressTableLookups.map((k) =>
    //     k.accountKey.toBase58()
    //   )
    // );
    // const ixs = TransactionMessage.decompile(transaction.message, {
    //   addressLookupTableAccounts: lookupTableAccounts,
    // }).instructions.filter(
    //   (ix) =>
    //     ix.programId.toBase58() !== ComputeBudgetProgram.programId.toBase58()
    // );

    // console.log(`decompile tx in ${Date.now() - startTime2}ms`);

    // // console.log("lookupTableAccounts", lookupTableAccounts);
    // console.log("ixs", ixs);

    // const signStartTime = Date.now();
    // const signature = await WalletService.signAndSendTransaction(
    //   ctx.user,
    //   ixs,
    //   [],
    //   lookupTableAccounts
    // );
    // console.log("signature", signature);
    // console.log(`sign and send tx in ${Date.now() - signStartTime}ms`);

    // return ctx.reply("ok");
  });
}

// position: 9gx98op5K4Z5uYNEcamX1d7CPzPGXXBUMiJLhnrPJdQD

// import { Telegraf } from "telegraf";
// import { BotContext } from "@/types/bot.types";
// import { SCENE_IDS } from "../config/scenes";

// export function helpCommand(
//   bot: Telegraf<BotContext>,
//   _server: FastifyInstance
// ) {
//   bot.help(async (ctx: BotContext, next) => {
//     const helpMessage = `
// 🤖 *Meteora Liquidity Bot Commands*

// *Basic Commands:*
// /start - Welcome message and main menu
// /help - Show this help message
// /portfolio - View your portfolio (demo)

// *Wallet Commands:*
// /connect_wallet - Connect your Solana wallet
// /balance - Check wallet balance
// /disconnect_wallet - Disconnect wallet

// *Trending Commands:*
// /trending - View trending tokens

// *Position Commands:*
// /create_position - Create new liquidity position
// /my_positions - View all your positions
// /rebalance - Manual rebalance

// *Settings:*
// /auto_rebalance - Toggle auto-rebalancing
// /set_threshold - Set rebalance threshold

// *Support:*
// If you need help, contact our support team.
//     `;

//     // await ctx
//     //   .reply(helpMessage, {
//     //     parse_mode: "Markdown",
//     //   })
//     //   .catch(console.error);
//     console.log("enter");
//     return ctx.scene.enter(SCENE_IDS.POOL_DETAIL_SCENE, {
//       poolAddress: "7q1BaMsFikgMJBMmmzF4nD9mxE6agFASnxGGq58LVd43",
//     });
//   });
// }
