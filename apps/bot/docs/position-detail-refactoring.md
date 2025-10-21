# Position Detail Scene Refactor Plan

This document captures the steps required to migrate the position detail scene to the new layered architecture described in `docs/RefactoringPlan.md` (see §5 Position Service Refactoring). The goal is to remove remaining legacy service calls, standardise callback handling, and route all orchestration through the application layer while keeping the scene presentation-only.

---

## 1. Baseline Assessment (RefactoringPlan §5.1)
- **Identify legacy dependencies**: Record every direct usage of `positionService`, `poolService`, `token-price.service`, and database queries inside `presentation/scenes/position-detail.scene.ts`.
- **Map responsibilities**: Separate the concerns into (a) data retrieval, (b) transaction execution (close/claim/rebalance), and (c) message formatting / keyboards.
- **Determine missing building blocks**: confirm that `GetPositionUseCase`, `ClosePositionUseCase`, `ClaimFeesUseCase`, and the DI container already exist and expose the required methods.

## 2. Route data access through use cases (RefactoringPlan §5.1 Step 3)
1. Replace the legacy `positionService.getPositionDetail` call with `GetPositionUseCase`.
   - Extend the use case so it can load by `positionId` *or* `positionAddress`.
   - Request optional pool metadata and price snapshots (`includePool`, `includePrices`).
   - Inject `IUserRepository` to resolve the wallet address when the command does not provide one.
2. Update the DI container (`infrastructure/di/container.ts`) so the new constructor signature receives `IUserRepository`.
3. Ensure downstream batch consumers (e.g., jobs) still succeed by keeping `userId` optional and falling back to the persisted position owner.

## 3. Encapsulate formatting within the presentation layer (RefactoringPlan §5.1 Step 4)
1. Add `presentation/formatters/position-detail.formatter.ts` to build the Telegram message.
   - Inputs: domain `Position`, optional `UnifiedPosition`, pool metadata, and token prices.
   - Output: Markdown string plus derived metadata (pair label, status).
   - Include mandatory data: pair, net PnL, token balances (with USD estimates), claimed vs. unclaimed fees, and range status.
2. Stop using the deprecated `MessageService` for rich replies. The scene should rely exclusively on dedicated formatters and small utility helpers for error messages.

## 4. Standardise callback handling (RefactoringPlan §5.1 Step 4 & Improvements)
1. Introduce `presentation/keyboards/position-detail.actions.ts` to centralise callback names and regex patterns.
   - Use a short, unique prefix (`pd`) to avoid collisions.
   - Provide helpers for deterministic strings and parameterised callbacks (e.g., `pd:claim:yes:<positionId>`).
2. Update `position-detail-menu.ts` to use the new constants and keep buttons free of hard-coded text identifiers.
3. Refactor the scene to consume the constants/regex and remove inline string literals inside `.action(...)` declarations. This ensures new buttons remain conflict-free as the feature set grows.

## 5. Keep the scene presentation-only (RefactoringPlan §5.1 Step 4)
1. Resolve use cases from the DI container inside the scene instead of instantiating repositories or transaction services directly.
2. Persist lightweight state only (position id/address, pair label, rendered message id) to support refreshes and confirmations without re-hydrating entire domain objects.
3. Convert success/error flows (close / claim) to:
   - Replace confirmation messages with status updates.
   - Refresh the canonical detail message after mutations so users see up-to-date balances without re-entering the scene.

## 6. Provide clear fallbacks / TODOs (RefactoringPlan §5.1 Step 5)
- Take-profit and stop-loss actions still rely on future use cases. Keep the UI entry points but return friendly placeholder messages until the application layer exposes the required workflows.
- Document remaining legacy hooks (e.g., `positionService.rebalanceV1`) and remove them from the scene to prevent accidental regressions.

---

## Improvements and Follow-ups
1. **Callback standardisation** (implemented): the new `pd:` prefix and helpers eliminate the risk of collisions with other handlers. Adopt the same pattern for any future scene-specific callbacks.
2. **Formatter ownership** (implemented): `PositionDetailFormatter` now owns all Markdown rendering. Future enhancements (e.g., adding range analytics or APR data) should be implemented there, keeping the scene minimal.
3. **Use case enrichment** (implemented): `GetPositionUseCase` now enriches positions with pool metadata and prices, reusing the existing caching strategy.
4. **Adapter resilience** (implemented): `MeteoraAdapter.getPosition` supports either `userAddress` or `poolAddress` context, reducing the chance of runtime errors during cross-feature reuse.
5. **Next steps** (planned):
   - Implement dedicated use cases for take-profit and stop-loss flows.
   - Add telemetry / logging around position refresh latency.
   - Introduce automated tests for the formatter to prevent Markdown regressions.

Following these steps brings the position detail feature in line with the modular architecture described in the refactoring plan: the scene is thin, the application layer orchestrates business logic, adapters handle external data, and presentation concerns remain encapsulated within formatters and keyboard helpers.
