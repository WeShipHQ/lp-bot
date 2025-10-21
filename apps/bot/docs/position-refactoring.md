# Position Creation Flow Refactoring Guide

This guide describes how to refactor the Create Position flow to align with the new system design. It references Section "5. Module-by-Module Refactoring" in apps/bot/docs/RefactoringPlan.md and focuses on the presentation → application → domain → infrastructure layering.

Scope:
- Telegram scene: apps/bot/src/presentation/scenes/create-position.scene.ts
- DEX focus: Meteora DLMM (extensible to other DEXes)

Objectives:
- Remove business logic and direct service calls from the scene
- Route all external interactions through application use cases
- Make the flow DEX-agnostic and pool-type extensible

Step-by-step plan

1) Presentation: eliminate direct service dependencies
- Replace direct calls to services (poolService, solanaService, jupiterService, meteoraDlmmService, SarosDlmmService) with application use cases resolved via the DI container.
- Keep only UI responsibilities in the scene: routing user input, managing Wizard state, and formatting messages.

2) Pool data: use unified adapter via GetPoolDetailsUseCase
- Create or use existing use case: application/trending/get-pool-details.use-case.ts
- In scene entry (Step 0), resolve and call GetPoolDetailsUseCase through container.get(GetPoolDetailsUseCase) to fetch a UnifiedPool.
- Update WizardState types to use DexType and UnifiedPool instead of legacy PoolDex and Pool.

3) Wallet balances: use dedicated use cases
- Use application/wallet/get-balance.use-case.ts to fetch SOL balance (short-lived cache under the hood).
- Add application/wallet/get-token-balance.use-case.ts to fetch SPL token balances (with cache). Bind it in the container.
- Replace all solanaService.getBalance/getTokenBalance calls with these use cases.

4) Token distribution: extract to a use case
- Move the 50/50 SOL auto-convert split and Jupiter quote logic into application/position/calculate-balanced-distribution.use-case.ts.
- Implementation details:
  - Deduct OPEN_POSITION_FEE
  - Split remaining SOL 50/50
  - Convert each half to tokenA/tokenB using JupiterAdapter
  - Return tokenAAmount/tokenBAmount (UI units)
- Bind and call via container.get(CalculateBalancedDistributionUseCase).

5) Price range: extract to a use case
- Create application/position/get-price-range.use-case.ts that delegates to Meteora or Saros DLMM services based on dex.
- This keeps the scene DEX-agnostic while still supporting DLMM.
- Bind and call via container.get(GetPriceRangeUseCase).

6) Position execution: use application use case and DI
- Replace manual instantiation of repositories/registry/transaction service with container.get(CreatePositionUseCase).
- Pass userId, dex, poolAddress, wallet context, token amounts, slippage, and metadata.
- Let the use case handle DB pending transaction, job enqueue, and cache invalidation.

7) Formatting and types: update to unified types
- Update generateProgressMessage to use UnifiedPool fields (tvl, feeTvlRatio24h).
- Keep message formatters in presentation and reuse existing formatters.

8) Dependency Injection (container)
- Register new use cases in infrastructure/di/container.ts:
  - CalculateBalancedDistributionUseCase
  - GetPriceRangeUseCase
  - GetTokenBalanceUseCase
- Ensure adapters and registry are already registered per RefactoringPlan (Meteora/Saros adapters via dexRegistry).

9) Remove legacy logic from scene
- Delete calculateTokenDistributionForBalancedPosition from the scene (moved to use case).
- Ensure no direct imports remain from legacy services.

10) Verify extensibility (multi-DEX, pool types)
- WizardState carries dex: DexType and poolData: UnifiedPool; summary and execution flow rely on use cases that resolve via dexRegistry or adapter-specific services.
- Adding a new DEX requires only implementing adapter methods and extending GetPriceRangeUseCase if necessary.

11) Documentation and diagram
- Add apps/bot/docs/position-diagram.md with a Mermaid flowchart of the full flow.
- Add this refactoring guide as apps/bot/docs/position-refactoring.md.

12) Testing checklist
- Step 0: Loads UnifiedPool via use case
- Amount selection: Uses GetBalanceUseCase
- Token balances: Uses GetTokenBalanceUseCase
- Summary: Uses CalculateBalancedDistributionUseCase + GetPriceRangeUseCase
- Execution: Uses CreatePositionUseCase from container
- No direct service instantiation in the scene
- Scene compiles and type-checks with UnifiedPool/DexType

Cross-references to RefactoringPlan.md (Section 5)
- 5.1 Position Service Refactoring: We now invoke CreatePositionUseCase instead of service internals.
- 5.2 Adapter Layer: Pool fetching and DEX operations are resolved via dexRegistry through GetPoolDetailsUseCase and CreatePositionUseCase.
- 5.3 Wallet Service: Balance fetching isolated in dedicated use cases, enabling caching and DI.
- 5.4 Message Service: Scene remains responsible for formatting only, no business logic.

Outcome
- Presentation layer is clean and thin; all business and integration logic is orchestrated by application use cases.
- The flow is accurately aligned with the target architecture and ready for future DEX/pool-type expansion.
