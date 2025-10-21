# Pool Detail Scene Refactor Plan

This document describes step-by-step how to refactor the pool detail scene (apps/bot/src/presentation/scenes/pool-detail.scene.ts) by following the same principles used in the Position refactor (see RefactoringPlan.md §5.1). The goal is to align the scene with the System Design: thin presentation layer, use cases in the application layer, unified adapters via the dexRegistry, centralized formatting, and DI-driven orchestration.

---

## 0) Current issues (pre-refactor)
- Scene mixes orchestration and data access: calls unifiedPoolService directly.
- Local message-building logic exists alongside presentation formatters.
- Inconsistent typing for scene state (legacy Pool/PoolDex types mixed with Unified types).
- No DI boundary: scene constructs/uses services directly instead of use cases.
- Duplicate formatting logic (local function vs. PoolFormatter).

---

## 1) Define the intent and contract (like Position Step 1: entity/use-case boundaries)
- Input: { poolAddress: string, dex: DexType }
- Output: UnifiedPool (normalized pool model across DEXes)
- Error behavior: user-friendly message on failure, no crashes.

Rationale: Presentation should only request a “pool details by id” application service and render the result. All adapter selection and caching occurs behind the use case boundary.

---

## 2) Create an application use case for pool details (like Position Step 3: Extract Use Cases)
- Add application/trending/get-pool-details.use-case.ts with:
  - execute({ poolAddress, dex }): UnifiedPool
  - Uses dexRegistry.get(dex).getPool(poolAddress)
  - Adds lightweight caching via CacheKeys.poolKey(dex, poolId)

Benefits:
- Centralizes adapter access and caching
- Makes scene logic thinner and testable

---

## 3) Register the use case in the DI container (like Position Step 4: Update Presentation Layer)
- Update infrastructure/di/container.ts to bind GetPoolDetailsUseCase
- Scene will resolve the use case via container.get(GetPoolDetailsUseCase)

Benefits:
- Presentation stays framework-only; orchestration is injected
- Enables mocking/stubbing in tests

---

## 4) Make the scene presentation-only (apply Position Step 4 mindset)
- Replace direct unifiedPoolService calls with the GetPoolDetailsUseCase
- Keep state minimal and typed: { poolAddress?: string; dex?: DexType; pool?: UnifiedPool }
- Move any data/logic to either use case or formatters

---

## 5) Consolidate formatting under presentation/formatters (like Position: extract formatters)
- Remove local formatPoolDetails function
- Use PoolFormatter.formatPoolDetails(unifiedPool)

Benefits:
- Single source of truth for message formatting
- Consistency across handlers and scenes

---

## 6) Normalize keyboards and callbacks
- Use getPoolInfoKeyboard for simple pool actions (Open position, Close, Refresh)
- Keep callbacks scoped to the scene, no business logic here

---

## 7) Standardize error handling and UX
- On missing pool/dex: reply with MessageService.getErrorMessage()
- On fetch failure: edit loading message with a friendly error
- Always disable link preview where appropriate (DISABLE_LINK_PREVIEW)

---

## 8) Caching and performance (parallel to Position’s caching/queueing guidance)
- Cache pool details in GetPoolDetailsUseCase (5 minutes TTL)
- Keep the scene fast and responsive; use a “Loading …” message while fetching

---

## 9) Telemetry and logging
- Scene logs only unexpected errors
- Use case is the right place for deeper metrics/timing if needed

---

## 10) Clean up legacy/dead code
- Remove unused imports (formatters from bot/utils, Pool/PoolDex legacy types)
- Remove local formatting function
- Ensure scene uses DexType and UnifiedPool consistently

---

## 11) Acceptance criteria
- The scene compiles and runs without type errors
- Entering the scene fetches and renders pool details using PoolFormatter
- Refresh action re-fetches via the use case and updates the message
- Errors are user-friendly and do not crash the bot
- All adapter selection and caching live outside the scene

---

## What was implemented in this refactor
1) Added GetPoolDetailsUseCase (application/trending/get-pool-details.use-case.ts)
   - execute({ poolAddress, dex }) → UnifiedPool
   - Uses dexRegistry and CacheKeys.poolKey
2) Registered the use case in DI container (infrastructure/di/container.ts)
3) Updated pool-detail.scene.ts
   - Uses DI: container.get(GetPoolDetailsUseCase)
   - Removed local format function and legacy imports
   - Typed scene state with DexType and UnifiedPool
   - Uses PoolFormatter.formatPoolDetails and getPoolInfoKeyboard
   - Keeps link preview disabled and consistent error handling

This mirrors the Position refactor approach: thin scene (presentation), application-layer use case for orchestration, adapters behind a registry, and consistent formatting.
