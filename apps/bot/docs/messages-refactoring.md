# Messages Refactoring Guide

This document captures the outstanding messaging problems in the Telegram bot and outlines a concrete migration plan to align message handling with the system design described in `SystemDesign.md` (see §4.2.5 *Message Service*) and the Clean Architecture guidelines.

## Current State Assessment

- **Legacy service removed but not replaced**: `src/services/message.service.ts` still contains the deprecated implementation commented out entirely. Nothing currently fulfils the responsibilities listed in the system design (templating, centralized send/edit/delete, rate limiting, notification routing).
- **Direct messaging from presentation layer**: The majority of commands, handlers, and scenes call `ctx.reply*` or `ctx.telegram.*` with inline strings (e.g. `presentation/handlers/two-factor-auth.ts`, `presentation/scenes/create-position.scene.ts`, `presentation/handlers/help.ts`, `presentation/handlers/wallet/transfer.ts`). This bypasses any shared formatting rules and scatters copy.
- **Message formatting embedded in business logic**: Large services like `services/position.service.ts`, `services/wallet.service.ts`, and `presentation/scenes/position-detail.scene.ts` build user-facing strings alongside domain logic. Some temporary `MessageService` stubs are re-declared inside scenes, re‑introducing duplication.
- **Inconsistent use of formatters**: A few flows already leverage the new formatters (`presentation/formatters/start.formatter.ts`, `portfolio.formatter.ts`, `wallet.formatter.ts`), while others hard-code Markdown/HTML. This inconsistency results in conflicting styles, parse modes, and number formatting.
- **Application layer leaking presentation strings**: Use cases such as `application/message/route-free-text.use-case.ts` return literal reply strings instead of higher-level message descriptors, making the application layer depend on Telegram copy.
- **Mixed parse modes and keyboard wiring**: Many handlers manually pass `{ parse_mode: "Markdown" }` while others rely on defaults. Inline keyboards are constructed ad-hoc, which the future message layer must normalize (e.g. standard keyboard builders, automatic disabling of link previews).
- **Commented imports and dead references**: Multiple files keep commented `MessageService` imports (wallet, two-factor, transfer handlers), signalling partial migrations and increasing confusion.

## Step-by-Step Refactoring Plan

1. **Create a comprehensive message inventory**
   - Use static analysis (e.g. `grep` for `ctx.reply`, `ctx.editMessageText`, `ctx.replyWith`) to enumerate every user-facing string across `presentation`, `application`, and legacy `services` folders.
   - Categorize messages by feature (Start, Portfolio, Wallet, Trending, Create Position wizard, Position Detail, 2FA, Transfers, Help, Dev utilities) and by operation type (initial response, progress update, confirmation, error, notification).
   - Capture metadata needs for each message: expected parse mode, whether keyboards are attached, whether rich media (photos, documents) are sent, and dynamic data requirements.

2. **Define message domain models**
   - Introduce a `domain/message` module containing value objects for:
     - `MessageKey` (stable identifiers per copy item)
     - `MessageTemplate` (text template + metadata such as default parse mode, keyboard schema, link preview flags)
     - `MessagePayload` (resolved text + inline keyboard & attachments)
   - Provide domain factories that ensure templates remain pure (no Telegram-specific objects) and only depend on primitive data structures.

3. **Implement the Message Service according to the system design**
   - Add an application-layer service (e.g. `application/message/message.service.ts`) exposing operations `send`, `edit`, `delete`, `notify` that accept domain `MessagePayload`s and routing context (chat id, message id).
   - Build an infrastructure gateway (e.g. `infrastructure/messaging/telegram-message.gateway.ts`) that wraps Telegraf/Bot API interactions, enforces rate limiting, logging, and error normalization.
   - Update the DI container (`infrastructure/di/container.ts`) to register the gateway and service, injecting them wherever the presentation layer requires message delivery.

4. **Consolidate formatting & templating**
   - Move or rewrite existing formatting helpers under `presentation/formatters` so every dynamic message (including create-position wizard steps, position detail summaries, wallet transfers, and 2FA flows) has a dedicated formatter returning a `MessageTemplate`/`MessagePayload` instead of raw strings.
   - Standardize number, price, percentage, and duration formatting via `presentation/formatters/base.formatter.ts` and `docs/number-formatting-conventions.md`.
   - Store static copy (headings, helper text, error messages) in a dedicated copy module (e.g. `presentation/copy/messages.ts`) referenced by the formatters, so content changes do not touch control flow code.

5. **Refactor presentation flows to use the new service**
   - Replace direct `ctx.reply*` and `ctx.telegram.*` calls with `messageService.send` / `messageService.edit`, passing the formatter output plus contextual routing information.
   - Migrate feature by feature, starting with simpler commands (`/start`, portfolio overview, wallet summary) to validate the new abstractions, then progress to multi-step scenes (`create-position`, `position-detail`) and complex handlers (wallet transfers, 2FA).
   - Ensure keyboard builders (`presentation/keyboards/*`) return serializable structures that the message service can attach.

6. **Clean up application layer responses**
   - Update use cases in `application/message` (and any other use cases emitting copy) to return semantic results (e.g. `UnsupportedPoolDetected`, `TokenSearchComingSoon`) instead of literal strings.
   - Let the presentation layer choose the correct formatter/template based on those result types, keeping business logic free from Telegram wording.

7. **Retire legacy artifacts**
   - Remove the commented implementation in `services/message.service.ts` after replacement.
   - Delete ad-hoc `MessageService` stubs (e.g. the inner class inside `presentation/scenes/position-detail.scene.ts`) and commented imports.
   - Update or migrate any remaining legacy services (`services/position.service.ts`, `services/wallet.service.ts`, etc.) that still produce user-facing strings, moving that responsibility to the presentation layer or new formatters.

8. **Add tests and tooling support**
   - Write unit tests for critical formatters (portfolio summaries, position confirmations, transfer confirmations) to assert copy structure and formatting.
   - Add integration tests/mocks for the message service to ensure rate limiting and error handling behave as expected.
   - Provide lint rules or simple assertions (e.g. search for forbidden `ctx.reply(` without going through the message service) to prevent regressions.

9. **Document and roll out**
   - Update the developer documentation (`docs/PRD.md`, `docs/SystemDesign.md`, and any ADRs) with the final message pipeline description.
   - Communicate migration guidelines to the team, including how to add new templates, where to place copy, and how to request message sends from scenes/handlers.
   - Plan incremental releases (feature flags or commands toggled to new service) if large flows need staged rollout.

Following the above steps will re-establish a single, testable messaging pathway, making new copy changes or UX improvements far easier while adhering to the system design’s layering rules.
