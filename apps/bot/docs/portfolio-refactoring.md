# /portfolio Command Refactoring Guide

This guide describes how to refactor the /portfolio command to comply with the new layered system design and improve maintainability, extensibility, and UX. It follows the principles and steps outlined in "## 5. Module-by-Module Refactoring" of apps/bot/docs/RefactoringPlan.md.

---

## Objectives

- Presentation layer (commands/handlers) only formats and routes – no business logic.
- Application layer provides use-cases for portfolio reads and metrics.
- Adapters provide on-chain enrichment (token balances, fees) via the DEX registry.
- Standardize callback action naming to avoid collisions across features.
- Centralize message formatting in presentation/formatters.

---

## Current Gaps

- apps/bot/src/presentation/commands/portfolio.ts builds text inline and does not leverage formatters.
- apps/bot/src/presentation/handlers/portfolio.ts still depends on legacy services (MessageService, portfolioService) rather than use-cases/DI.
- Callback naming is inconsistent (e.g., "ui:close", "portfolio:refresh", "pos:…").
- Unclaimed fees are not computed in the Meteora adapter; the unified position model always sets them to 0.

---

## Refactoring Steps

1) Presentation: introduce a standardized callback namespace for Portfolio
- Create presentation/constants/portfolio.callbacks.ts with a stable prefix.
- Define both the generators and regex patterns.
- Example prefix: pf (portfolio).

2) Presentation: centralize portfolio message formatting
- Extend presentation/formatters/portfolio.formatter.ts with a formatter that accepts:
  - A domain Portfolio entity
  - Optional unified data (e.g., unclaimed fees per position address)
  - Bot username for deep links
- Ensure consistent number/currency formatting and Markdown-safe output.

3) Application: use the new use-cases
- Use GetPortfolioUseCase to load the domain Portfolio aggregate for a user ID (DB + on-chain enrichment where available).
- Use CalculateMetricsUseCase for portfolio-level metrics.

4) Adapters: compute accurate fees where available
- Update adapters/dex/meteora.adapter.ts to compute unclaimed/claimed fees in UnifiedPosition using SDK fields (feeX/Y, totalClaimedFeeX/Y) and token prices.
- This enables accurate “Unclaimed fees” display without leaking adapter logic into the presentation.

5) Commands: refactor /portfolio entry point
- apps/bot/src/presentation/commands/portfolio.ts should:
  - Show a loading message
  - Resolve use-cases via the DI container
  - Build an unclaimedFees map by querying the DEX registry for the connected wallet
  - Use the Portfolio formatter to produce Markdown
  - Edit the loading message with the final text and a standardized inline keyboard
  - Register the portfolio callbacks via a handler

6) Handlers: migrate callbacks to use use-cases and new constants
- In presentation/handlers/portfolio.ts:
  - Remove legacy service dependencies
  - Handle pf:overview:refresh by re-running the use-cases and re-formatting
  - Handle pf:overview:close by safely deleting the message
  - Avoid storing long-lived portfolio session state when not strictly necessary

7) Keyboards: use standardized callbacks
- Update presentation/keyboards/portfolio-menu.ts to use PF_CALLBACKS from the new constants file.

8) Guardrails & UX improvements
- Always disable link previews on portfolio messages.
- Prefer editing messages over sending new ones when responding to callbacks.
- Handle Telegram “message is not modified” gracefully.
- When no wallet is connected or portfolio is empty, display a helpful, concise CTA (e.g., use /trending) and provide a clean keyboard.

---

## Callback Naming Standard (Proposal)

- Prefix: pf (portfolio)
- Overview actions:
  - pf:overview:refresh
  - pf:overview:close
- Position actions (if/when needed):
  - pf:pos:<index>:refresh
  - pf:pos:<index>:claim
  - pf:pos:<index>:rebalance
  - pf:pos:<index>:close
  - pf:pos:<index>:settings

Regex for position actions: ^pf:pos:(\d+):(refresh|claim|rebalance|close|settings)$

Rationale:
- Single namespace prevents collision with other features (e.g., cp:* for Create Position).
- Human-readable segments aid debugging.

---

## Message Formatting Standard (Proposal)

- Centralize string building in presentation/formatters.
- Accept domain entities as primary input; enrich with unified adapter data via params when needed (e.g., unclaimed fees).
- Use helpers in presentation/formatters/base.formatter.ts for currency/number/percentage.
- Use bot/utils/text-formatters for Markdown-safe bold/link/dividers.
- Include deep links using the /start param scheme (pos_<dex>_<positionAddress>), routed by the start command.

---

## Implementation Notes

- DI: use infrastructure/di/container to resolve use-cases and registry.
- Caching: GetPortfolioUseCase uses a cache; a refresh action should bypass cache where needed or rely on SyncPortfolioUseCase if a hard refresh is required later.
- Metrics: CalculateMetricsUseCase returns value/PnL/fees at portfolio level; add domain-based totals (e.g., total deposit) in the formatter by summing Position.getInitialValue().
- Fees: For unclaimed fees, rely on adapter-provided unified positions. Do not perform fee calculations in the presentation layer.

---

## Done Checklist

- [x] Standardized portfolio callbacks (PF_CALLBACKS/PF_PATTERNS)
- [x] Extended formatter for domain Portfolio + unified fees
- [x] /portfolio command uses use-cases + DI + formatter
- [x] Meteora adapter computes unclaimed/claimed fees
- [x] Handlers use use-cases and standardized callbacks for refresh/close
- [x] Keyboards updated to use new callbacks

This refactor aligns the /portfolio flow with the target architecture, isolates presentation concerns, and sets the stage for multi-DEX extensibility and better testability.
