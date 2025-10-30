# Auth Middleware & Wallet Command Review

## Overview
This document captures the issues identified during the review of the Telegram bot authentication middleware (`presentation/middleware/auth.ts`) and the `/wallet` command stack, together with the enhancements implemented to align the code with the current layered architecture (SystemDesign.md) and product expectations.

---

## Key Findings & Enhancements

### 1. Authentication Middleware

| Issue | Impact | Enhancement |
| --- | --- | --- |
| **Wallet created with wrong ownership flow** – the middleware created a Privy wallet _before_ the Privy user existed and assigned ownership to the bot service account (`CONFIG.PRIVY.PRIVY_AUTH_ID`). | Users never became owners of their wallets; the bot was both owner and additional signer, violating the non-custodial requirement. | Reworked the middleware to orchestrate user/wallet provisioning through `ConnectWalletUseCase`, which now (a) ensures the Privy user exists first, (b) creates the wallet with the user as owner, and (c) adds the service account as an additional signer. |
| **Custom metadata usage was unchecked** – the code blindly read `walletId`/`walletAddress` from `user.customMetadata`. | Deserialisation could return `undefined`, leading to database inserts with invalid values or missing wallet linkage. | The use case now normalises and, when required, patches Privy metadata (wallet identifiers, telegram linkage, username) before continuing. |
| **Bypassed application/domain layers** – the middleware directly called `createUser`, `userSyncService`, and raw Privy APIs. | Business rules in the application/domain layer were duplicated, username/wallet updates were not applied consistently, and we risked conflicting writes. | Middleware now resolves `ConnectWalletUseCase` from the DI container and loads the resulting DB record via repository/helper query, keeping the presentation layer thin. |
| **Database sync inconsistencies** – `userSyncService.syncUser` updated `walletAddress` but never `walletId`, eventually drifting from Privy. | Local configuration (rebalance thresholds, preferences) would point at stale wallets. | `ConnectWalletUseCase` and `UserRepository.update` were enhanced to update both wallet ID and address atomically. |
| **Error handling left `ctx.user` undefined** – failures were logged but the pipeline continued. | Downstream handlers would crash with `ctx.user` missing, producing unclear errors. | Middleware now short-circuits on failure and attempts to notify the user (reply or `answerCbQuery`) before returning. It also stores `ctx.privyUserId` for later Privy operations. |

### 2. `/wallet` Command & Handlers

| Issue | Impact | Enhancement |
| --- | --- | --- |
| **Private-key export metadata update used DB UUID** – `userService.markPrivateKeyExported` was called with `ctx.user.id` (the local UUID), while the service expected a Privy user id. | The metadata flag was never set; first-time export prompts reappeared and downstream 2FA flows could not rely on the flag. | `BotContext` now tracks `privyUserId`. `userService.markPrivateKeyExported` accepts either a Privy id or telegram id and resolves the correct Privy user before updating metadata. The handler passes both, ensuring idempotent updates. |
| **Privy metadata access was unsafe** – the wallet handler assumed `customMetadata` existed and contained strongly typed fields. | Absent metadata triggered runtime errors when users had not yet completed onboarding. | `userService.getUserByTelegramId` now guards metadata reads and normalises optional fields (`walletAddress`, 2FA flags, export flag). |
| **Local repository never updated wallet identifiers** – even when Privy metadata recovered, `/wallet` still surfaced stale addresses. | Displayed wallet address could diverge from the actual Privy wallet, breaking transfers and portfolio lookups. | `UserRepository.update` now persists wallet id/address changes in addition to preference fields, mirroring metadata updates. |

### 3. Additional Notes
- The middleware now returns the hydrated DB user (via `findUserById`) before continuing, guaranteeing `ctx.user` exists for every downstream handler.
- The DI container remains the single source for use-case resolution; no legacy helpers (`userSyncService`) are invoked from the presentation layer anymore.
- Privy metadata now stores canonical telegram information (`telegramUserId`, `telegramUsername`), allowing consistent discovery from other modules (settings, notifications, etc.).

---

## Follow-up Opportunities
- Store the Privy user id in the database when we introduce a migration, so subsequent Privy operations no longer require lookups by telegram id.
- Centralise Telegram error responses (reply vs `answerCbQuery`) into a shared utility, mirroring the recommendation already captured in `wallet-refactoring.md`.
- Extend domain-level user update methods to support wallet rotation explicitly, instead of rebuilding domain entities manually.

---

_Last updated: 2025-10-24_
