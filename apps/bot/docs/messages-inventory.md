# Messaging Inventory

This inventory captures the chat-facing copy that currently exists within the Meteora Liquidity Bot. It was assembled via automated searches (`ctx.reply`, `ctx.telegram.editMessageText`, `replyWith*`) and manual review of the presentation layer.

## Commands

- **/start** (`presentation/commands/start.ts`)
  - Welcome message with wallet balance + referral link
  - Unsupported deep-link responses
  - Error copy for user creation, wallet fetch failures
- **/portfolio** (`presentation/commands/portfolio.ts`)
  - Loading placeholder
  - Portfolio overview summary (domain + adapter data)
  - Error fallback when overview cannot be loaded
- **/wallet** (`presentation/handlers/wallet/render.ts`, `presentation/commands/wallet.ts`)
  - Loading + wallet summary with SOL balance and top tokens
  - Errors for missing wallets / fetch failures
  - Transfer prompts, confirmations, success + error flows
- **/trending** (`presentation/commands/trending.ts`, `presentation/handlers/trending.ts`)
  - Fetching indicator, paginated trending list, errors on fetch/sort/navigation
- **/help** (`presentation/handlers/help.ts`)
  - Static help + resource links (Markdown)
- **/settings** (`presentation/commands/settings.ts`, `presentation/handlers/settings.ts`)
  - Overview summary, prompts for vault/schedule input, success + validation errors
- **/twoFactor** (`presentation/commands/two-factor-auth.ts`, handlers)
  - Menu, setup instructions, verification prompts, success/error copy, disable guidance
- **/generate** (`presentation/commands/genarate-images.ts`)
  - Status message for poster generation, validation + failure copy
- **/referral** (`presentation/commands/referral.ts`)
  - Referral overview, history pagination, error copy
- **/dev** (`presentation/commands/dev.ts`)
  - Simple debug reply placeholder

## Global Handlers & Scenes

- **Free text router** (`presentation/handlers/message.ts`)
  - Replies for unsupported pool types and token search placeholders
- **Portfolio scene callbacks** (`presentation/handlers/portfolio.ts`)
  - Refresh confirmations, close acknowledgements, error/warning strings
- **Trending callbacks** (`presentation/handlers/trending.ts`)
  - Refresh/sort acknowledgements, invalid callback warnings, fetch failures
- **Wallet flows** (`presentation/handlers/wallet/*`)
  - Transfer prompts (SOL, tokens, all-balance), confirmations, processing status, success/failure copy
  - Wallet export instructions and warnings
- **Two-factor handlers** (`presentation/handlers/two-factor-auth.ts`)
  - Setup instructions with QR caption, verification prompts, status responses
- **Create position wizard** (`presentation/scenes/create-position.scene.ts`)
  - Multi-step guidance, validation errors, progress footers, cancel/back confirmations
- **Position detail scene** (`presentation/scenes/position-detail.scene.ts`)
  - Loading indicator, position summaries, confirmation prompts for close/claim/rebalance, success/failure copy
- **Pool detail scene** (`presentation/scenes/pool-detail.scene.ts`)
  - Pool overviews, action prompts, error handling copy

## Error Handling

- **Global bot.catch** (`presentation/index.ts`)
  - Fallback error message from shared error handler
- **Application layer** (`application/message/route-free-text.use-case.ts`, various use cases)
  - Some use cases currently bubble up raw user-facing strings for invalid inputs or unsupported actions

This inventory will guide the migration of copy into standardized templates and formatters during the messaging refactor.
