# Position Creation Implementation Strategy

Focus: convert the existing UX flow into a production-ready pipeline that creates a Meteora DLMM position, submits the transaction on Solana, and persists the resulting state in the database. This strategy deliberately excludes fee claims, rebalancing, or position closure logic.

---

## End-to-End Sequence Overview

1. **Entry Point** – user taps a "Create Position" CTA.
2. **Scene Bootstrapping** – ensure pool context and user prerequisites exist.
3. **Wizard Interaction** – collect strategy, funding method, amounts, and settings.
4. **Confirmation & 2FA** (if enabled) – present final summary and request approval.
5. **Transaction Orchestration** – build, sign, and submit Meteora create-position transaction.
6. **Pending Transaction Persistence** – record in `pendingTransactions` and enqueue a confirmation job.
7. **Post-Confirmation Worker** – enrich data, create rows in `Position`, `PositionSegment`, and `PositionSnapshot` tables.
8. **User Feedback & Job Scheduling** – acknowledge success, refresh caches, and schedule monitoring.

Each stage below specifies the concrete implementation steps, modules to touch, and data we must propagate.

---

## 1. Entry Point & Scene Bootstrapping

1. **CTA Wiring**
   - Ensure the following entry points all funnel into `SCENE_IDS.CREATE_POSITION_SCENE` with identical prep logic:
     - Trending pools "➕ Open Position" button.
     - Portfolio "Add Position" CTA.
     - `/create` command and pool URL auto-detection.
   - When routing into the scene, set `ctx.scene.state.poolAddress` and `ctx.scene.state.dex` (default `"meteora"`).

2. **User Preconditions**
   - Reusable guard middleware should verify:
     - User session is hydrated with `ctx.user` (authenticated Privy wallet).
     - Wallet has been provisioned (address + walletId on file).
     - Optional: enforce 2FA flag before continuing.
   - If prerequisites fail, exit scene with actionable error (e.g., prompt to connect wallet).

3. **Pool Context Fetch**
   - First scene step must call `GetPoolDetailsUseCase` to populate `poolData` in wizard state.
   - Handle missing/invalid pools gracefully and exit scene if pool lookup fails.

---

## 2. Wizard Flow Data Collection

Mirror the UX steps documented in `position-diagram.md` while validating each input server-side.

1. **Strategy Selection (Step 1)**
   - Persist `strategy` (`Spot`, `Curve`, or `Bid-Ask`).
   - Store canonical enum (`MeteoraCreatePositionStrategy`) for later metadata.

2. **Deposit Method (Step 2)**
   - Save `depositMethod` as `sol_auto_convert` or `single_sided`.
   - Branch subsequent steps based on this choice.

3. **Token & Source (Steps 3–4, conditional)**
   - For single-sided flows, fetch balances via `GetPoolTokenBalancesUseCase` / `GetTokenBalanceUseCase`.
   - Store `selectedToken` metadata and `depositSource` (`sol_convert` or `token_balance`).

4. **Amount Capture (Step 5)**
   - Validate affordability (`GetBalanceUseCase` for SOL, or token balance for single-sided).
   - Support both preset buttons and custom input by setting `amount` (numeric) and `enteredCustomAmount` flags.
   - Ensure buffers for fees (`BUFFER_AMOUNT`) when offering "100%" options.

5. **Price Range / Coverage (Step 6, single-sided)**
   - Collect `priceChangePercentage` via presets or custom.
   - Later used to compute range bins/metadata.

6. **Auto-Rebalance Preference (Step 7)**
   - Store `autoRebalancing` (`yes`/`no`).
   - If `yes`, add optional threshold configuration (future enhancement). Default to user/global setting.

7. **Summary Rendering (Step 8)**
   - Use `CalculateBalancedDistributionUseCase` and `GetPriceRangeUseCase` to derive token splits and range preview.
   - Build summary using `generatePositionSummary`, ensuring all wizard state is ready for the transaction stage.

8. **Scene State Snapshot**
   - Before confirmation, assemble a serialisable `PositionCreationContext` object inside wizard state:
     ```ts
     {
       userId,
       walletAddress,
       walletId,
       dex,
       poolAddress,
       strategy,
       depositMethod,
       depositSource,
       solAmount,
       tokenAAmount,
       tokenBAmount,
       tokenAMint,
       tokenBMint,
       priceRange: { min, max, curveBins?, rangeInterval },
       autoRebalance: boolean,
       rebalanceThreshold,
       slPercentage?,
       tpPercentage?,
       quotes: { solUsd, tokenAUsd, tokenBUsd },
       expectedFeesLamports,
     }
     ```
   - This payload will be reused both for the transaction metadata and database write after confirmation.

---

## 3. Confirmation Stage (User Approval)

1. **2FA Gate (if enabled)**
   - Inject a middleware before final confirmation to verify OTP codes when `ctx.user.twoFactorEnabled` is true.
   - Abort transaction on failed verification (with retries as per security policy).

2. **Confirm Button Handling**
   - Convert wizard state into a `CreatePositionCommand` for the application layer.
   - Compute string amounts respecting pool decimals (SOL→token conversions handled beforehand).
   - Populate `metadata` with the `PositionCreationContext` (remove private-only fields before persisting).

3. **UX Feedback**
   - Swap message to a progress indicator (e.g., `generateProgressMessage` with loading states).
   - Provide cancel/timeout handling (e.g., user can hit `/cancel` to abort before submission completes).

---

## 4. Transaction Orchestration (`CreatePositionUseCase`)

1. **Input Validation**
   - Ensure pool & wallet addresses pass `validatePoolAddress` / `validateWalletAddress`.
   - Guard non-zero `tokenAAmount` & `tokenBAmount`.

2. **DEX Adapter Call**
   - Use `MeteoraAdapter.createPosition()` to build instructions.
   - Provide strategy & range metadata (`metadata.rangeInterval` derived from user selection or defaults).

3. **Signature Acquisition**
   - If adapter returns instructions only, submit via `PrivyTransactionService.submit()`.
   - This service locates the user via `findUserById`, builds the transaction, and signs/sends via Privy.

4. **Pending Transaction Persistence**
   - Insert into `pendingTransactions`:
     - `operationType: "CREATE_POSITION"`
     - `metadata`: include `PositionCreationContext`, transaction parameters, and the adapter’s `positionPublicKey` if available.
   - Enqueue `JOB_TX_CONFIRM` with `signature`, `userId`, and hints (`positionAddress` if known).

5. **Immediate Response to User**
   - If submission succeeds, update the Telegram message with:
     - Success acknowledgement (`signature` + solscan link via `getSolscanLink`).
     - Notice that the position will appear after confirmation.
   - On failure (adapter/network/Privy error), show user-friendly error and keep scene state so they can retry.

---

## 5. Transaction Confirmation Worker (`transaction-confirm.worker.ts`)

The existing worker updates pending transaction status; extend it to handle `CREATE_POSITION`.

1. **Detect Confirmation**
   - When status becomes `COMPLETED`, branch on `operationType === "CREATE_POSITION"`.

2. **Load Metadata & Enrich**
   - Parse stored metadata to reconstruct `PositionCreationContext`.
   - Fetch on-chain position data from Meteora:
     - Use adapter or DLMM service to read actual deposited token amounts, bin IDs, and position account address (fallback to metadata if adapter provided it).
     - Retrieve current token prices for USD/SOL conversions.

3. **Persist Position Entities**
   - Within a DB transaction (reusing helper functions or a new `PositionPersistenceService`):
     1. **Insert `Position`**
        - Map strategy, tokens, risk settings, initial amounts, price references, creation signature, and initial USD/SOL investment.
        - Set `currentSegmentNumber = 1`, `isRebalancingEnabled` per user choice, `rebalanceThreshold`, `slPercentage`, `tpPercentage`.
     2. **Insert Initial `PositionSegment`**
        - `segmentNumber = 1`, `startTimestamp = confirmedAt`, `initialValueUSD` computed from token amounts + prices.
        - `startPositionAddress` equals the on-chain position address.
     3. **Insert Creation `PositionSnapshot`**
        - Capture current token balances, USD valuation, and zeroed PnL fields as described in `schema.ts`.
        - Store token prices and SOL price (pull from price service at confirmation time).

4. **Update Pending Transaction**
   - Set `status = COMPLETED`, attach `positionId`/`positionAddress` to metadata for future reference.

5. **Queue Follow-up Jobs**
   - Schedule `JOB_POSITION_MONITOR` (or equivalent) with user/position IDs using `JobQueueService.enqueue` so that periodic range checks begin immediately.

6. **Cache & Notification**
   - Invalidate portfolio cache for the user (`CachePatterns.portfolioPattern(userId)`).
   - Optionally enqueue a `JOB_NOTIFICATION` to DM the user: e.g., "✅ Position activated" summary linking to Solscan.

---

## 6. Error Handling & Retries

1. **Scene-Level Failures**
   - Provide explicit messaging when data validation fails (insufficient balance, invalid custom amount, etc.).
   - Allow the user to step back (`CP_CALLBACKS.back`) without losing previously selected values.

2. **Transaction Failures**
   - If signing fails (user rejects, RPC error), mark pending transaction as `FAILED`, notify the user, and keep wizard context so they may retry quickly.
   - Add retry support in the worker for transient Solana RPC issues (already handled via Bull backoff).

3. **Worker Enrichment Failures**
   - If on-chain fetch fails post-confirmation, log and rethrow to leverage Bull retry attempts.
   - After max retries, mark pending transaction as `FAILED` and send a notification instructing the user to contact support while we reconcile manually.

---

## 7. Observability & Testing Checks

1. **Logging**
   - Add contextual logs at each stage (scene actions, use case execution, worker persistence) including userId, poolAddress, strategy, and signature.

2. **Metrics**
   - Emit counters for successful creations and failure reasons (future Prometheus integration).

3. **Testing Strategy**
   - Unit tests for the use case (mock adapter & transaction service).
   - Integration tests for the worker using a mocked Solana adapter + in-memory DB.
   - Manual UAT in staging with Devnet pools to validate the wizard and transaction signing end-to-end.

---

## Deliverables Summary

- **Wizard Enhancements**: complete callback handling, validation, and summary generation storing `PositionCreationContext`.
- **Transaction Pipeline**: `CreatePositionUseCase` fully wired to adapter, transaction service, pending transaction insertion, and job enqueueing.
- **Worker Enrichment**: extend `transaction-confirm.worker.ts` to materialise new positions in the database using the schema defined in `schema.ts`.
- **Post-Creation Tasks**: cache invalidation, success notifications, and monitoring job scheduling.

Following this roadmap will enable a robust, production-ready Meteora position creation flow from the user tap through on-chain confirmation and database persistence.
