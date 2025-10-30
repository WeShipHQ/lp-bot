# /wallet Command Refactoring Guide

This guide describes how to refactor the /wallet command to align with the new layered system design described in SystemDesign.md and the conventions in RefactoringPlan.md (see section 5. Module-by-Module Refactoring).

Goals
- Follow Presentation -> Application -> Domain -> Infrastructure boundaries
- Keep presentation layer free of business logic
- Use dependency injection (container) for use cases
- Standardize callback actions to avoid conflicts and simplify routing
- Improve message formatting cohesion
- Add non-critical top token balances (best-effort/mock) to the wallet summary

What the command should do
- Display current wallet address and SOL balance (+ USD value)
- Display some top token balances (USDC, USDT, JUP, mSOL) as best-effort
- Provide actions: transfer all SOL, transfer X SOL, transfer all tokens, transfer X tokens, export private key, close, refresh

Step-by-step refactoring plan

1) Establish standardized callback namespace for wallet
- Create presentation/constants/wallet.callbacks.ts
  - Define a single wallet namespace wallet:<segment>:<segment>...
  - Provide constants and regex patterns for all wallet actions (ui, transfer, export, confirm/cancel)
  - This prevents collisions and mirrors how trending and create-position callbacks are done

2) Move/introduce a dedicated formatter for wallet messages
- Add presentation/formatters/wallet.formatter.ts
  - Implement WalletFormatter.formatWalletSummary(address, sol, usdValue, topTokens?)
  - Presentation layer is responsible for formatting; do not use services here
  - Use the existing base formatter utilities for numbers and currency

3) Add an application use case for top token balances (best-effort/mock)
- Create application/wallet/get-top-token-balances.use-case.ts
  - For now, query a curated list of well-known mints (USDC, USDT, JUP, mSOL)
  - Use solanaService.getTokenBalance for each mint
  - Optionally enrich with jupiterService.getTokenInfo to get symbols/names
  - Keep it best-effort: ignore failures and continue; return empty list on error
- Register the use case with the DI container in infrastructure/di/container.ts

4) Update the keyboard to use namespaced callbacks
- Edit presentation/keyboards/wallet-menu.ts
  - Replace raw callback strings with WALLET_CALLBACKS.*
  - Keep the rest of the UI the same (Solscan, Close, Refresh)

5) Refactor the /wallet handler to use use cases + formatter
- Edit presentation/handlers/wallet.ts
  - For the main walletHandler:
    - Resolve GetBalanceUseCase via container
    - Resolve GetTopTokenBalancesUseCase via container (best effort)
    - Compute USD value using solanaService.getSolPrice()
    - Format the message with WalletFormatter.formatWalletSummary()
  - In the refresh flow, do the same and update the message via editMessageText
  - Use container.get(...) for SendTokensUseCase instead of new construction
  - Keep interactive flow (2FA, transfer input) in presentation, but avoid business logic

6) Unify callback routing for wallet actions
- In presentation/commands/wallet.ts
  - Use WALLET_PATTERNS.any as the sole regex for bot.action()
  - Continue to route to handleWalletCallback
  - Keep text handler for 2FA and transfer input interception

7) Optional resiliency improvements in handlers
- Prefer container.get(...) for all use cases to keep DI consistent
- Handle Telegram edit errors gracefully (message not modified)
- Keep reply parse_mode and reply_markup consistent

8) Document standards for callback data to prevent conflicts
- All wallet callbacks should start with wallet:
  - wallet:ui:refresh, wallet:ui:close
  - wallet:transfer:sol:all, wallet:transfer:sol:amount
  - wallet:transfer:token:all, wallet:transfer:token:amount
  - wallet:export:private_key, wallet:export:confirm_first, wallet:export:cancel
  - wallet:confirm, wallet:cancel
- Keep a single RegExp pattern that matches all wallet callbacks and smaller specific patterns (WALLET_PATTERNS)
- Never mix bare strings like confirm_transfer across modules; always use constants

9) Testing checklist (manual/QA)
- /wallet shows address, SOL balance, USD value
- Top Tokens block appears (may be empty if lookups fail)
- Buttons work: Close deletes message; Refresh updates numbers
- Transfer flows still work (all SOL, X SOL, token flows)
- Export private key flow still works; first-time confirmation + 2FA path unchanged

Notes on further improvements (beyond scope but recommended)
- Move formatting currently in MessageService to dedicated presentation/formatters
- Extract a WalletController in presentation to group handlers and reduce file size
- Introduce typed finite state machine for transferState to reduce branching
- Centralize Telegram error handling helpers (answerCbQuery, safe edit/delete) into a small utility module used across handlers
- Extend top token balances to read actual token accounts and sort by USD value when available
