/\*\*

- V2 Message System Usage Examples
-
- This file demonstrates how to use the new message system
- in various bot scenarios.
  \*/

import {
sendMessage,
sendError,
sendLoading,
sendSuccess,
answerCallback,
safeSendMessage,
BotContext
} from '../index';

/\*\*

- Example: Start Command Handler
  \*/
  export async function exampleStartHandler(ctx: BotContext) {
  // Check if user has wallet
  const hasWallet = true; // Your logic here
  const walletAddress = "So11111111111111111111111111111111111111112";
  const solBalance = 2.5;
  const usdValue = "$125.50";

if (hasWallet) {
await sendMessage(ctx, 'commands.start.welcomeWithWallet', {
address: walletAddress,
balance: solBalance,
usdValue: usdValue
});
} else {
await sendMessage(ctx, 'commands.start.welcome', {
botName: 'Meteora Liquidity Bot'
});
}
}

/\*\*

- Example: Portfolio Handler with Loading
  \*/
  export async function examplePortfolioHandler(ctx: BotContext) {
  // Show loading message
  const loadingMsg = await sendLoading(ctx, 'commands.portfolio.loading');

try {
// Simulate portfolio loading
const portfolio = await loadUserPortfolio();

    if (portfolio.positions.length === 0) {
      await ctx.telegram.editMessageText(
        ctx.chat!.id,
        loadingMsg.message_id,
        undefined,
        (await sendMessage(ctx, 'commands.portfolio.empty')).text
      );
    } else {
      // Show portfolio data
      await ctx.telegram.editMessageText(
        ctx.chat!.id,
        loadingMsg.message_id,
        undefined,
        `📊 Portfolio loaded with ${portfolio.positions.length} positions`
      );
    }

} catch (error) {
await sendError(ctx, 'errors.generic');
}
}

/\*\*

- Example: Position Close Handler
  \*/
  export async function examplePositionCloseHandler(ctx: BotContext) {
  const positionId = "pos_123";

// Show confirmation
await sendMessage(ctx, 'position.confirmClose', {
poolName: 'SOL-USDC',
currentValue: '$1,250.00'
});

// After user confirms...
const loadingMsg = await sendLoading(ctx, 'position.closing');

try {
const result = await closePosition(positionId);

    await sendSuccess(ctx, 'position.closed', {
      txLink: `https://solscan.io/tx/${result.signature}`
    });

} catch (error) {
await sendError(ctx, 'errors.transactionFailed', {
reason: error.message
});
}
}

/\*\*

- Example: Callback Query Handler
  \*/
  export async function exampleCallbackHandler(ctx: BotContext) {
  const callbackData = ctx.callbackQuery?.data;

if (!callbackData) {
await answerCallback(ctx, 'callbacks.invalidData');
return;
}

// Check if button is for this user
const userId = ctx.from?.id;
const buttonUserId = extractUserIdFromCallback(callbackData);

if (userId !== buttonUserId) {
await answerCallback(ctx, 'callbacks.buttonNotForYou');
return;
}

// Process the callback
if (callbackData.startsWith('refresh*')) {
await answerCallback(ctx, 'callbacks.refreshed');
// Refresh logic here...
} else if (callbackData.startsWith('close*')) {
await answerCallback(ctx, 'callbacks.cancelled');
// Close logic here...
} else {
await answerCallback(ctx, 'callbacks.unknownAction');
}
}

/\*\*

- Example: Error Handling with Fallbacks
  \*/
  export async function exampleErrorHandling(ctx: BotContext) {
  try {
  // Some risky operation
  await riskyOperation();
  } catch (error) {
  if (error.code === 'POOL_NOT_FOUND') {
  await sendError(ctx, 'errors.poolNotFound');
  } else if (error.code === 'INSUFFICIENT_BALANCE') {
  await sendError(ctx, 'errors.insufficientBalance');
  } else {
  // Fallback to generic error
  await sendError(ctx, 'errors.generic');
  }
  }
  }

/\*\*

- Example: Two-Factor Auth Flow
  \*/
  export async function exampleTwoFactorFlow(ctx: BotContext) {
  const user = await getUser(ctx.from!.id);

if (user.twoFactorEnabled) {
await sendMessage(ctx, 'twoFactor.alreadyEnabled');
return;
}

// Start setup
const qrCode = await generateQRCode();
const secret = await generateSecret();

await sendMessage(ctx, 'twoFactor.setup', {
qrCode: qrCode,
secret: secret
});
}

/\*\*

- Example: Wallet Transfer Flow
  \*/
  export async function exampleTransferFlow(ctx: BotContext) {
  const amount = 1.5;
  const recipient = "So11111111111111111111111111111111111111112";
  const usdValue = "$75.00";

// Show confirmation
await sendMessage(ctx, 'wallet.transferConfirmation', {
recipient: recipient,
amount: `${amount} SOL`,
usdValue: usdValue
});

// After confirmation...
const loadingMsg = await sendLoading(ctx, 'ui.loading.processing');

try {
const result = await executeTransfer(recipient, amount);

    await sendSuccess(ctx, 'wallet.transferSuccess', {
      recipient: recipient,
      amount: `${amount} SOL`,
      txLink: `https://solscan.io/tx/${result.signature}`
    });

} catch (error) {
await sendError(ctx, 'wallet.transferError', {
error: error.message
});
}
}

// Mock functions for examples
async function loadUserPortfolio() {
return { positions: [] };
}

async function closePosition(id: string) {
return { signature: 'mock_signature' };
}

function extractUserIdFromCallback(data: string): number {
return 123; // Mock implementation
}

async function riskyOperation() {
throw new Error('Mock error');
}

async function getUser(id: number) {
return { twoFactorEnabled: false };
}

async function generateQRCode() {
return 'mock_qr_code';
}

async function generateSecret() {
return 'mock_secret';
}

async function executeTransfer(recipient: string, amount: number) {
return { signature: 'mock_signature' };
}
