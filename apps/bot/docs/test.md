### Detailed Telegraf Scene Structure for Create Position

Below, I'll provide a comprehensive structure for the `CREATE_POSITION_SCENE` using Telegraf's `WizardScene`. This builds on the previous outline but incorporates your updated requirements. The scene is designed to be robust, user-friendly, and handle conditional logic (e.g., extra step for single-sided strategy). I'll include:

- **Code Skeleton**: A near-complete Telegraf code example you can copy-paste and adapt. It uses WizardScene steps for progression, actions for button callbacks, and hearers for text inputs/commands.
- **Step-by-Step UX Flow**: Detailed messages, UI elements, user actions, bot responses, and edge cases for each wizard step.
- **Key Assumptions**:
  - Pool details (e.g., token X/Y names, addresses) are passed via `ctx.scene.enter(SCENE_IDS.CREATE_POSITION_SCENE, { poolAddress, tokenX, tokenY })`. Replace placeholders like `tokenX`/`tokenY` with actual vars (e.g., symbols like "USDC" and "SOL").
  - Amount is always in SOL (as specified), but for single-sided, it's deposited entirely into the chosen token (no 50/50 split).
  - The 50/50 split notification/confirmation applies only to spot/curve strategies. For single-sided, skip it and go directly to summary.
  - "Calculate how much": Assuming this means estimating the token amounts after split (e.g., via a swap or oracle price). In code, I'll placeholder a `calculateTokenAmounts` function—you'll need to implement it (e.g., fetch prices from an API or on-chain).
  - Transaction execution: Placeholder `executeCreatePosition` function. Integrate with your Solana/Meteora logic (e.g., using @solana/web3.js).
  - Error handling: Global middleware for unexpected errors.
  - State management: Use `ctx.wizard.state` to store choices (strategy, side, amount, etc.).
- **Best Practices Integrated**:
  - Mobile-friendly: Short messages, tap-heavy with inline keyboards.
  - Validation: Strict checks for inputs (e.g., positive numbers).
  - Navigation: "Back" and "Cancel" at every step; support /back and /cancel commands.
  - Feedback: Emojis for positivity/warnings, Markdown for bold/italics.
  - Timeouts: Add idle timeout if needed (Telegraf supports via middleware).
  - Security: Remind about wallet risks in confirmations; don't store sensitive data.

#### Code Skeleton in Telegraf

```javascript
const { Scenes, Markup } = require('telegraf');
const SCENE_IDS = { CREATE_POSITION_SCENE: 'create_position' }; // Define your scene IDs

// Placeholder functions (implement these)
async function calculateTokenAmounts(strategy, side, amountInSol, poolAddress, tokenX, tokenY) {
  // Example: Fetch prices, compute splits. Return { tokenXAmount, tokenYAmount, estimatedAPY, fees }
  if (strategy === 'single-sided') {
    return { [side === 'X' ? 'tokenXAmount' : 'tokenYAmount']: amountInSol, estimatedAPY: '5%', fees: '0.01 SOL' };
  }
  // For spot/curve: Assume 50/50 split after swap
  const half = amountInSol / 2;
  return { tokenXAmount: half, tokenYAmount: half, estimatedAPY: '4%', fees: '0.005 SOL' };
}

async function executeCreatePosition(ctx) {
  const { strategy, side, amount, poolAddress, tokenX, tokenY } = ctx.wizard.state;
  try {
    // Integrate with Meteora/Solana: Build tx, sign via wallet deep link
    // e.g., const txId = await meteoraSdk.createPosition(...);
    return { success: true, txId: 'dummyTx123' }; // Replace with real logic
  } catch (error) {
    return { success: false, error: error.message };
  }
}

const createPositionScene = new Scenes.WizardScene(
  SCENE_IDS.CREATE_POSITION_SCENE,
  // Step 0: Entry/Welcome & Strategy Selection
  async (ctx) => {
    const { poolAddress, tokenX = 'TokenX', tokenY = 'TokenY' } = ctx.wizard.state; // From enter data
    await ctx.replyWithMarkdownV2(
      `You're opening a position in Pool: ${tokenX}/${tokenY} (Address: \`${poolAddress.slice(0, 6)}...\`)\n` +
      'Choose a strategy:\n' +
      '- *Spot*: Balanced at current price.\n' +
      '- *Curve*: Adjusted for price curve.\n' +
      '- *Single-sided*: Deposit into one token only.'
    );
    return ctx.reply('Select below:', Markup.inlineKeyboard([
      [Markup.button.callback('Spot', 'strategy:spot'), Markup.button.callback('Curve', 'strategy:curve')],
      [Markup.button.callback('Single-sided', 'strategy:single-sided')],
      [Markup.button.callback('Cancel', 'cancel')]
    ]));
  },
  // Step 1: Side Selection (conditional for single-sided)
  async (ctx) => {
    const { strategy, tokenX, tokenY } = ctx.wizard.state;
    if (strategy !== 'single-sided') return ctx.wizard.next(); // Skip to amount if not single-sided
    await ctx.replyWithMarkdownV2(`For single-sided, choose the side:`);
    return ctx.reply('Select:', Markup.inlineKeyboard([
      [Markup.button.callback(tokenX, 'side:X'), Markup.button.callback(tokenY, 'side:Y')],
      [Markup.button.callback('Back', 'back'), Markup.button.callback('Cancel', 'cancel')]
    ]));
  },
  // Step 2: Amount Selection/Input
  async (ctx) => {
    await ctx.replyWithMarkdownV2('How much SOL do you want to deposit? Choose a preset or custom.');
    return ctx.reply('Options:', Markup.inlineKeyboard([
      [Markup.button.callback('0.1 SOL', 'amount:0.1'), Markup.button.callback('1 SOL', 'amount:1'), Markup.button.callback('5 SOL', 'amount:5')],
      [Markup.button.callback('Custom', 'amount:custom')],
      [Markup.button.callback('Back', 'back'), Markup.button.callback('Cancel', 'cancel')]
    ]));
  },
  // Step 3: Split Notification & Confirmation (conditional for spot/curve)
  async (ctx) => {
    const { strategy, amount, tokenX, tokenY } = ctx.wizard.state;
    if (strategy === 'single-sided') return ctx.wizard.next(); // Skip to summary for single-sided
    await ctx.replyWithMarkdownV2(
      `Your ${amount} SOL will be divided 50% into ${tokenX} and 50% into ${tokenY} (via swap if needed).\n` +
      'This may incur small fees. Confirm?'
    );
    return ctx.reply('Proceed?', Markup.inlineKeyboard([
      [Markup.button.callback('Yes', 'split:yes'), Markup.button.callback('No (Back)', 'back')],
      [Markup.button.callback('Cancel', 'cancel')]
    ]));
  },
  // Step 4: Summary & Final Confirmation
  async (ctx) => {
    const { strategy, side, amount, poolAddress, tokenX, tokenY } = ctx.wizard.state;
    const calc = await calculateTokenAmounts(strategy, side, amount, poolAddress, tokenX, tokenY);
    let summary = `Summary:\n- Strategy: ${strategy}${side ? ` (${side === 'X' ? tokenX : tokenY})` : ''}\n- Amount: ${amount} SOL\n`;
    if (strategy !== 'single-sided') {
      summary += `- ${tokenX}: ~${calc.tokenXAmount} (50%)\n- ${tokenY}: ~${calc.tokenYAmount} (50%)\n`;
    } else {
      summary += `- Deposited into: ${side === 'X' ? tokenX : tokenY} (~${amount} SOL equivalent)\n`;
    }
    summary += `- Est. APY: ${calc.estimatedAPY}\n- Fees: ${calc.fees}\n⚠️ Risks: Impermanent loss, tx fees.`;
    await ctx.replyWithMarkdownV2(summary);
    return ctx.reply('Confirm and execute?', Markup.inlineKeyboard([
      [Markup.button.callback('Yes, Create Position', 'confirm:yes'), Markup.button.callback('No (Back)', 'back')],
      [Markup.button.callback('Cancel', 'cancel')]
    ]));
  },
  // Step 5: Execution
  async (ctx) => {
    const result = await executeCreatePosition(ctx);
    if (result.success) {
      await ctx.reply(`✅ Position created! Tx ID: ${result.txId}`);
    } else {
      await ctx.reply(`❌ Error: ${result.error}. Try again or contact support.`);
    }
    return ctx.scene.leave();
  }
);

// Handle button callbacks (actions)
createPositionScene.action(/strategy:(spot|curve|single-sided)/, async (ctx) => {
  await ctx.answerCbQuery();
  ctx.wizard.state.strategy = ctx.match[1];
  await ctx.editMessageText(`Selected strategy: ${ctx.match[1]}`); // Edit previous message for clean UX
  return ctx.wizard.next();
});

createPositionScene.action(/side:(X|Y)/, async (ctx) => {
  await ctx.answerCbQuery();
  ctx.wizard.state.side = ctx.match[1];
  await ctx.editMessageText(`Selected side: ${ctx.match[1] === 'X' ? ctx.wizard.state.tokenX : ctx.wizard.state.tokenY}`);
  return ctx.wizard.next();
});

createPositionScene.action(/amount:(\d+\.?\d*)/, async (ctx) => {
  await ctx.answerCbQuery();
  const amount = parseFloat(ctx.match[1]);
  if (isNaN(amount) || amount <= 0) return ctx.reply('Invalid amount. Try again.');
  ctx.wizard.state.amount = amount;
  await ctx.editMessageText(`Selected amount: ${amount} SOL`);
  return ctx.wizard.next();
});

createPositionScene.action('amount:custom', async (ctx) => {
  await ctx.answerCbQuery();
  await ctx.editMessageText('Enter your custom amount in SOL (e.g., 2.5):');
  ctx.wizard.state.awaitingCustomAmount = true; // Flag for text handler
  return ctx.scene.session.cursor = ctx.wizard.cursor; // Stay in current step
});

createPositionScene.action(/split:(yes)/, async (ctx) => {
  await ctx.answerCbQuery();
  await ctx.editMessageText('Split confirmed.');
  return ctx.wizard.next();
});

createPositionScene.action('confirm:yes', async (ctx) => {
  await ctx.answerCbQuery();
  await ctx.editMessageText('Executing...');
  return ctx.wizard.next();
});

createPositionScene.action('back', async (ctx) => {
  await ctx.answerCbQuery();
  return ctx.wizard.back();
});

createPositionScene.action('cancel', async (ctx) => {
  await ctx.answerCbQuery();
  await ctx.reply('Position creation cancelled.');
  return ctx.scene.leave();
});

// Handle text inputs (for custom amount)
createPositionScene.on('text', async (ctx) => {
  if (ctx.wizard.state.awaitingCustomAmount) {
    const amount = parseFloat(ctx.message.text);
    if (isNaN(amount) || amount <= 0) {
      return ctx.reply('Invalid amount. Enter a positive number (e.g., 2.5).');
    }
    ctx.wizard.state.amount = amount;
    ctx.wizard.state.awaitingCustomAmount = false;
    await ctx.reply(`Custom amount set: ${amount} SOL`);
    return ctx.wizard.next();
  }
  // Ignore unrelated text or redirect
  await ctx.reply('Please use the buttons or enter a valid amount if prompted.');
});

// Global commands
createPositionScene.command('back', (ctx) => ctx.wizard.back());
createPositionScene.command('cancel', async (ctx) => {
  await ctx.reply('Cancelled.');
  return ctx.scene.leave();
});

// Error middleware
createPositionScene.use(async (ctx, next) => {
  try {
    await next();
  } catch (error) {
    await ctx.reply(`Unexpected error: ${error.message}. Cancelling.`);
    return ctx.scene.leave();
  }
});

// Export and use in your bot: bot.use(createPositionScene);
```

#### Step-by-Step UX Flow with Details and Edge Cases

##### Step 0: Entry/Welcome & Strategy Selection
- **Trigger**: `ctx.scene.enter(SCENE_IDS.CREATE_POSITION_SCENE, { poolAddress, tokenX, tokenY })`.
- **Message from Bot**:
  - "You're opening a position in Pool: TokenX/TokenY (Address: `abc123...`)"
  - Explanations for strategies (as in code).
- **UI Element**: Inline keyboard: [Spot] [Curve] [Single-sided] [Cancel]
- **User Action**: Tap strategy button.
- **Bot Response**: Edit message to "Selected strategy: [chosen]", advance to next (Step 1 if single-sided, else Step 2).
- **Edge Cases**:
  - User types text: Ignored with redirect message.
  - No selection (idle): Add timeout middleware to cancel after 5 min.
  - Cancel: Exit scene immediately.
  - Invalid callback (tampered): Telegraf ignores; log if needed.

##### Step 1: Side Selection (Only for Single-Sided)
- **Trigger**: If strategy === 'single-sided'.
- **Message from Bot**: "For single-sided, choose the side:"
- **UI Element**: Inline keyboard: [TokenX] [TokenY] [Back] [Cancel]
- **User Action**: Tap side button (callback 'side:X' or 'side:Y').
- **Bot Response**: Edit to "Selected side: TokenX", advance to Step 2.
- **Edge Cases**:
  - Back: Return to strategy selection (wizard.back()).
  - Cancel: Exit.
  - User types /back or /cancel: Handled via commands.

##### Step 2: Amount Selection/Input
- **Trigger**: After strategy (or side).
- **Message from Bot**: "How much SOL do you want to deposit? Choose a preset or custom."
- **UI Element**: Inline keyboard: [0.1 SOL] [1 SOL] [5 SOL] [Custom] [Back] [Cancel]
- **User Action**:
  - Tap preset: Set amount, advance.
  - Tap Custom: Prompt "Enter your custom amount in SOL (e.g., 2.5):", wait for text input.
- **Bot Response**:
  - Preset: Edit to "Selected amount: X SOL", advance.
  - Custom: Validate text (positive float), set amount, advance. If invalid, reprompt without advancing.
- **Edge Cases**:
  - Invalid custom input (e.g., "abc", -1, 0): Reply "Invalid amount. Enter a positive number." Stay in step.
  - Amount too small/large: Add checks (e.g., min 0.01 SOL) in validation.
  - Back: Return to previous (side if single-sided, else strategy).
  - User sends non-text (photo, etc.): Ignore.
  - Balance check: Optionally, integrate wallet query; if low, warn and back.

##### Step 3: Split Notification & Confirmation (Only for Spot/Curve)
- **Trigger**: If strategy !== 'single-sided'.
- **Message from Bot**: "Your X SOL will be divided 50% into TokenX and 50% into TokenY (via swap if needed). This may incur small fees. Confirm?"
- **UI Element**: Inline keyboard: [Yes] [No (Back)] [Cancel]
- **User Action**: Tap Yes to advance, No to back.
- **Bot Response**: Edit to "Split confirmed." or back.
- **Edge Cases**:
  - For single-sided: Skipped automatically.
  - User types "yes": Not handled (force buttons), redirect to use buttons.
  - Cancel/Back: As above.

##### Step 4: Summary & Final Confirmation
- **Trigger**: After amount (or split confirm).
- **Message from Bot**: Detailed summary (as in code), with calculations from `calculateTokenAmounts`.
- **UI Element**: Inline keyboard: [Yes, Create Position] [No (Back)] [Cancel]
- **User Action**: Tap Yes to advance to execution.
- **Bot Response**: Edit to "Executing...", proceed.
- **Edge Cases**:
  - Calculation error (e.g., API fail): Catch in try/catch, reply error, back to amount.
  - Summary too long: Telegram limits; split messages if needed.
  - User edits messages: Ignored; scene state preserved.

##### Step 5: Execution
- **Trigger**: After final yes.
- **Message from Bot**: None initially (edited previous to "Executing...").
- **UI Element**: None (scene ends).
- **User Action**: None.
- **Bot Response**: Success: "✅ Position created! Tx ID: [id]". Error: "❌ Error: [msg]".
- **Edge Cases**:
  - Tx fail (e.g., insufficient funds, network error): Show error, leave scene (user can restart).
  - Wallet rejection: If deep link, user cancels—detect if possible, reply "Cancelled by user."
  - Rate limits: Add bot-side checks to prevent spam.

This structure is flexible—adjust steps if more params needed. Test thoroughly with Telegraf's debug mode. If you need integrations (e.g., wallet links), provide more details!