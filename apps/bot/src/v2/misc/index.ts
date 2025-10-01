// /**
//  * V2 Message Architecture
//  * 
//  * This module provides a centralized, type-safe message management system
//  * for the Telegram bot with enhanced templating and formatting capabilities.
//  */

// // Core exports
// export { MESSAGES } from './messages';
// export { templateEngine, TemplateEngine } from './utils/templateEngine';
// export { 
//   sendMessage,
//   sendError,
//   sendLoading,
//   sendSuccess,
//   answerCallback,
//   editMessage,
//   safeEditMessage,
//   sendCommandResponse,
//   formatMessage,
//   getMessageConfig,
//   validateMessageVariables,
//   getAllMessageKeys,
//   formatWalletVariables,
//   formatTransactionVariables,
//   formatPositionVariables,
//   MessageSenders
// } from './utils/messageUtils';

// // Type exports
// export type {
//   MessageKey,
//   MessageConfig,
//   MessageTemplate,
//   FormattedMessage,
//   MessageContext,
//   MessageVariables,
//   MessageBundle,
//   ValidationResult,
//   MessageFormatter
// } from './types/messages.types';

// export type { BotContext } from './utils/messageUtils';

// /**
//  * Initialize the V2 message architecture
//  * Call this function to set up the message system
//  */
// export function initializeV2Architecture(): void {
//   console.log('🚀 V2 Message Architecture initialized');
//   console.log(`📊 Total message keys: ${getAllMessageKeys().length}`);
//   console.log('✅ Template engine ready');
//   console.log('✅ Message utilities loaded');
//   console.log('✅ Type-safe message system active');
// }

// /**
//  * Get system information about the V2 architecture
//  */
// export function getV2SystemInfo() {
//   const allKeys = getAllMessageKeys();
//   const cacheStats = templateEngine.getCacheStats();
  
//   return {
//     version: '2.0.0',
//     totalMessageKeys: allKeys.length,
//     messageCategories: {
//       commands: allKeys.filter(k => k.startsWith('commands.')).length,
//       errors: allKeys.filter(k => k.startsWith('errors.')).length,
//       ui: allKeys.filter(k => k.startsWith('ui.')).length,
//       callbacks: allKeys.filter(k => k.startsWith('callbacks.')).length,
//       twoFactor: allKeys.filter(k => k.startsWith('twoFactor.')).length,
//       wallet: allKeys.filter(k => k.startsWith('wallet.')).length,
//       pool: allKeys.filter(k => k.startsWith('pool.')).length,
//       position: allKeys.filter(k => k.startsWith('position.')).length,
//       settings: allKeys.filter(k => k.startsWith('settings.')).length,
//       system: allKeys.filter(k => k.startsWith('system.')).length,
//     },
//     templateEngine: {
//       cacheSize: cacheStats.size,
//       cachedTemplates: cacheStats.keys.length
//     },
//     features: [
//       'Type-safe message keys',
//       'Template interpolation with variables',
//       'Conditional message content',
//       'Value formatting (currency, percentage, etc.)',
//       'Template caching for performance',
//       'Validation and error handling',
//       'Centralized message management',
//       'Multi-language ready architecture'
//     ]
//   };
// }

// // Default export for convenience
// export default {
//   initializeV2Architecture,
//   getV2SystemInfo,
//   MESSAGES,
//   templateEngine,
//   sendMessage,
//   sendError,
//   sendLoading,
//   sendSuccess,
//   answerCallback,
//   MessageSenders
// };