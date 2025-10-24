# Position Detail Flow Review

## Summary

While migrating the position detail experience to the new logical/segment architecture, the existing scene was still wired to the legacy services and physical position addresses. The review uncovered several structural issues that prevented us from presenting the correct user-facing state across rebalances and from following the bot's system design guidelines. All problematic areas were reworked to use the application layer use-cases, the new formatter stack, and the logical position identifiers.

## Issues Identified

1. **Legacy service dependency**  
   The scene was calling `positionService.getPositionDetail` and manipulating raw `LbPosition` data. This bypassed the DI-managed `GetPositionUseCase`, ignored cache invalidation, and reintroduced the deprecated legacy flow.

2. **Physical address binding**  
   Scene state and callbacks were keyed by the on-chain `positionAddress`. After a rebalance (which spins up a new physical segment), detail queries would silently fail because the old address no longer existed.

3. **Hand-rolled PnL & message formatting**  
   PnL calculations were duplicated in the scene, combining raw decimals with manual Decimal.js math. This diverged from the documented formula in _Position PnL Tracking Strategy.md_ and from the shared `PositionDetailFormatter` which already encapsulates logical vs. physical segment handling.

4. **Callback namespace drift**  
   Inline buttons emitted `pos_*` callback data while the rest of the presentation layer uses the `pd:*` namespace via `PositionDetailCallbacks`. This prevented newer handlers from firing and broke consistency with other keyboards.

5. **Scene state storing raw DB rows**  
   The scene persisted raw `DbPosition` rows in state and performed ad-hoc `db.query` lookups for claim/rebalance/close actions. This leaked infrastructure details into the presentation layer and serialized non-plain objects into scene state.

6. **No lifecycle guards**  
   Operations such as close, claim, and rebalance were offered even when the position had transitioned to `CLOSED` or `REBALANCING`, leading to avoidable “Position is not active” errors from the domain layer.

## Enhancements Implemented

- Rebuilt the scene to resolve data through `GetPositionUseCase`, ensuring logical position tracking, adapter enrichment, and user-specific context are respected.
- Adopted `PositionDetailFormatter` for message generation and introduced a helper that dynamically trims the keyboard to only show management actions for active positions.
- Normalized scene state to contain only the logical `positionId`, current physical address, status, and the active message id; legacy `position` and `positionAddress` inputs are sanitized for backward compatibility.
- Updated every action handler to use `PositionDetailCallbacks` / `PositionDetailCallbackPatterns`, removing the deprecated `pos_*` strings.
- Routed close, claim, and rebalance flows through their respective DI-backed use cases, added wallet/ownership guards, and refreshed the primary detail message after each operation.
- Added basic placeholder responses for settings / TP / SL callbacks to keep UX intact while those flows are still under construction.

## Follow-up Suggestions

- Implement dedicated scenes/handlers for rebalancing settings, take-profit, and stop-loss configuration following the same use-case driven pattern.
- Consider enriching the detail view with segment history or last rebalance metadata once the analytics layer is exposed to the presentation tier.
