// import { Context } from 'telegraf';
// import { MESSAGES } from '../messages';
// import { templateEngine } from './templateEngine';
// import { 
//   MessageKey, 
//   MessageVariables, 
//   FormattedMessage, 
//   MessageConfig 
// } from '../types/messages.types';

// // Type for Telegram context (adjust based on your bot context type)
// export interface BotContext extends Context {
//   reply: (text: string, extra?: any) => Promise<any>;
//   answerCbQuery: (text?: string, extra?: any) => Promise<any>;
//   editMessageText: (text: string, extra?: any) => Promise<any>;
//   telegram: {
//     editMessageText: (chatId: number, messageId: number, inlineMessageId: string | undefined, text: string, extra?: any) => Promise<any>;
//   };
// }

// /**
//  * Get message configuration by key
//  */
// export function getMessageConfig(key: MessageKey): MessageConfig {
//   const keys = key.split('.');
//   let current: any = MESSAGES;
  
//   for (const k of keys) {
//     current = current[k];
//     if (!current) {
//       throw new Error(`Message key not found: ${key}`);
//     }
//   }
  
//   return current as MessageConfig;
// }

// /**
//  * Format a message using the template engine
//  */
// export function formatMessage(key: MessageKey, variables: MessageVariables = {}): FormattedMessage {
//   const config = getMessageConfig(key);
//   return templateEngine.renderMessage(config, variables);
// }

// /**
//  * Send a formatted message
//  */
// export async function sendMessage(
//   ctx: BotContext, 
//   key: MessageKey, 
//   variables: MessageVariables = {},
//   extra: any = {}
// ): Promise<any> {
//   try {
//     const formatted = formatMessage(key, variables);
    
//     const messageExtra = {
//       parse_mode: formatted.parseMode,
//       disable_web_page_preview: formatted.disableWebPagePreview,
//       disable_notification: formatted.disableNotification,
//       ...extra
//     };

//     return await ctx.reply(formatted.text, messageExtra);
//   } catch (error) {
//     console.error(`Failed to send message with key: ${key}`, error);
//     // Fallback to generic error message
//     return await ctx.reply("❌ Something went wrong. Please try again later.");
//   }
// }

// /**
//  * Send an error message
//  */
// export async function sendError(
//   ctx: BotContext, 
//   errorKey: string = 'generic', 
//   variables: MessageVariables = {},
//   extra: any = {}
// ): Promise<any> {
//   const key = `errors.${errorKey}` as MessageKey;
//   return sendMessage(ctx, key, variables, extra);
// }

// /**
//  * Send a loading message
//  */
// export async function sendLoading(
//   ctx: BotContext, 
//   loadingType: string = 'generic', 
//   variables: MessageVariables = {},
//   extra: any = {}
// ): Promise<any> {
//   const key = `ui.loading.${loadingType}` as MessageKey;
//   return sendMessage(ctx, key, variables, extra);
// }

// /**
//  * Send a success message
//  */
// export async function sendSuccess(
//   ctx: BotContext, 
//   successType: string = 'generic', 
//   variables: MessageVariables = {},
//   extra: any = {}
// ): Promise<any> {
//   const key = `ui.success.${successType}` as MessageKey;
//   return sendMessage(ctx, key, variables, extra);
// }

// /**
//  * Answer callback query with formatted message
//  */
// export async function answerCallback(
//   ctx: BotContext, 
//   callbackKey: string, 
//   variables: MessageVariables = {},
//   extra: any = {}
// ): Promise<any> {
//   try {
//     const key = `callbacks.${callbackKey}` as MessageKey;
//     const formatted = formatMessage(key, variables);
    
//     return await ctx.answerCbQuery(formatted.text, extra);
//   } catch (error) {
//     console.error(`Failed to answer callback with key: ${callbackKey}`, error);
//     // Fallback to generic response
//     return await ctx.answerCbQuery("❌ Error occurred.");
//   }
// }

// /**
//  * Edit message with formatted content
//  */
// export async function editMessage(
//   ctx: BotContext, 
//   key: MessageKey, 
//   variables: MessageVariables = {},
//   extra: any = {}
// ): Promise<any> {
//   try {
//     const formatted = formatMessage(key, variables);
    
//     const messageExtra = {
//       parse_mode: formatted.parseMode,
//       disable_web_page_preview: formatted.disableWebPagePreview,
//       ...extra
//     };

//     return await ctx.editMessageText(formatted.text, messageExtra);
//   } catch (error) {
//     console.error(`Failed to edit message with key: ${key}`, error);
//     throw error; // Re-throw to let caller handle
//   }
// }

// /**
//  * Safe edit message that handles "message not modified" errors
//  */
// export async function safeEditMessage(
//   ctx: BotContext, 
//   key: MessageKey, 
//   variables: MessageVariables = {},
//   extra: any = {}
// ): Promise<boolean> {
//   try {
//     await editMessage(ctx, key, variables, extra);
//     return true;
//   } catch (error: any) {
//     const errorMsg = error?.description || error?.message || String(error);
//     if (errorMsg.includes('message is not modified')) {
//       return false; // Message unchanged
//     }
//     throw error; // Re-throw other errors
//   }
// }

// /**
//  * Send command response (for command handlers)
//  */
// export async function sendCommandResponse(
//   ctx: BotContext, 
//   command: string, 
//   responseType: string, 
//   variables: MessageVariables = {},
//   extra: any = {}
// ): Promise<any> {
//   const key = `commands.${command}.${responseType}` as MessageKey;
//   return sendMessage(ctx, key, variables, extra);
// }

// /**
//  * Validate message variables before sending
//  */
// export function validateMessageVariables(key: MessageKey, variables: MessageVariables): boolean {
//   try {
//     const config = getMessageConfig(key);
//     if (config.template) {
//       const validation = templateEngine.validate(config.template, variables);
//       if (!validation.isValid) {
//         console.warn(`Message validation failed for key: ${key}`, validation);
//         return false;
//       }
//     }
//     return true;
//   } catch (error) {
//     console.error(`Failed to validate message variables for key: ${key}`, error);
//     return false;
//   }
// }

// /**
//  * Get all available message keys (useful for development/debugging)
//  */
// export function getAllMessageKeys(): MessageKey[] {
//   const keys: MessageKey[] = [];
  
//   function traverse(obj: any, prefix: string = '') {
//     for (const [key, value] of Object.entries(obj)) {
//       const fullKey = prefix ? `${prefix}.${key}` : key;
      
//       if (value && typeof value === 'object' && ('text' in value || 'template' in value)) {
//         keys.push(fullKey as MessageKey);
//       } else if (value && typeof value === 'object') {
//         traverse(value, fullKey);
//       }
//     }
//   }
  
//   traverse(MESSAGES);
//   return keys;
// }

// /**
//  * Helper for common wallet formatting
//  */
// export function formatWalletVariables(walletAddress?: string, solBalance?: number, usdValue?: number): MessageVariables {
//   return {
//     walletAddress: walletAddress ? `${walletAddress.slice(0, 8)}...${walletAddress.slice(-8)}` : '',
//     solBalance: solBalance?.toFixed(4) || '0.0000',
//     usdValue: usdValue ? `$${usdValue.toFixed(2)}` : '$0.00'
//   };
// }

// /**
//  * Helper for transaction link formatting
//  */
// export function formatTransactionVariables(signature: string, explorerUrl: string = 'https://solscan.io/tx'): MessageVariables {
//   return {
//     txLink: `[${signature.slice(0, 8)}...${signature.slice(-8)}](${explorerUrl}/${signature})`
//   };
// }

// /**
//  * Helper for position formatting
//  */
// export function formatPositionVariables(position: any): MessageVariables {
//   return {
//     positionName: `${position.tokenX?.symbol || 'Unknown'}-${position.tokenY?.symbol || 'Unknown'}`,
//     currentValue: position.currentValue ? `$${position.currentValue.toFixed(2)}` : '$0.00',
//     pnl: position.pnl ? `${position.pnl >= 0 ? '+' : ''}$${position.pnl.toFixed(2)}` : '$0.00'
//   };
// }

// // Export commonly used message senders for convenience
// export const MessageSenders = {
//   // Error senders
//   sendGenericError: (ctx: BotContext) => sendError(ctx, 'generic'),
//   sendNetworkError: (ctx: BotContext) => sendError(ctx, 'network'),
//   sendUnauthorizedError: (ctx: BotContext) => sendError(ctx, 'unauthorized'),
//   sendPoolNotFoundError: (ctx: BotContext) => sendError(ctx, 'poolNotFound'),
//   sendWalletNotFoundError: (ctx: BotContext) => sendError(ctx, 'walletNotFound'),
  
//   // Loading senders
//   sendGenericLoading: (ctx: BotContext) => sendLoading(ctx, 'generic'),
//   sendPoolDetailsLoading: (ctx: BotContext) => sendLoading(ctx, 'poolDetails'),
//   sendTransactionLoading: (ctx: BotContext) => sendLoading(ctx, 'transaction'),
  
//   // Success senders
//   sendGenericSuccess: (ctx: BotContext) => sendSuccess(ctx, 'generic'),
//   sendTransferSuccess: (ctx: BotContext, variables: MessageVariables) => sendSuccess(ctx, 'transferComplete', variables),
  
//   // Callback responders
//   answerRefreshed: (ctx: BotContext) => answerCallback(ctx, 'refreshed'),
//   answerCancelled: (ctx: BotContext) => answerCallback(ctx, 'cancelled'),
//   answerButtonNotForYou: (ctx: BotContext) => answerCallback(ctx, 'buttonNotForYou'),
//   answerInvalidData: (ctx: BotContext) => answerCallback(ctx, 'invalidData'),
// };