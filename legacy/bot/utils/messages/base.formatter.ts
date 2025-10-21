// import {
//   formatPrice,
//   formatNumber,
//   formatTokenAmountSmart,
// } from "@/bot/utils/formatters";
// import { bold, italic, link } from "@/bot/utils/text-formatters";

// export class BaseFormatter {
//   protected static formatPrice(value: number): string {
//     return formatPrice(value);
//   }

//   protected static formatNumber(
//     value: number,
//     options?: { maxDecimals?: number }
//   ): string {
//     return formatNumber(value, options);
//   }

//   protected static formatTokenAmount(amount: number): string {
//     return formatTokenAmountSmart(amount);
//   }

//   protected static bold(text: string): string {
//     return bold(text);
//   }

//   protected static italic(text: string): string {
//     return italic(text);
//   }

//   protected static link(text: string, url: string): string {
//     return link(text, url);
//   }

//   protected static formatBalance(solBalance: number, usdValue: number): string {
//     return `${this.bold(this.formatTokenAmount(solBalance))} SOL (${this.bold(this.formatPrice(usdValue))})`;
//   }

//   protected static formatWalletAddress(
//     address: string,
//     maxLength: number = 8
//   ): string {
//     if (address.length <= maxLength * 2) return address;
//     return `${address.slice(0, maxLength)}...${address.slice(-maxLength)}`;
//   }
// }
