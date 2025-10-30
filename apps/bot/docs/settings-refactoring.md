# Settings Command Refactoring Guide

Version: 1.0
Last Updated: 2025-10-21

Context
This guide explains how to refactor the /settings command to comply with the new system design described in apps/bot/docs/RefactoringPlan.md, especially section "5. Module-by-Module Refactoring". It also includes improvement suggestions and an example of how to add a new setting in a consistent, extensible way.

Goals
- Presentation-only responsibility in handlers
- Route actions to focused application use cases
- Keep formatting in presentation/formatters
- Keep Telegram UI in presentation/keyboards
- Use namespaced callback actions to avoid conflicts
- Be easy to extend with new settings

Target Architecture (recap)
- presentation: Telegram UI, handlers, keyboards, formatters
- application: use cases (thin orchestrators) for reading/updating settings
- domain: entities and rules (for user preferences; minimal changes needed)
- infrastructure/adapters: concrete services (Privy, DB) used by use cases

Step-by-step Refactoring

1) Define namespaced callback contracts
- Create presentation/constants/settings.constants.ts
- Use a short namespace prefix, e.g., st, and centralize both builders and regex patterns
- Example:
  - st:vault:set
  - st:gas:set:low|medium|high
  - st:schedule:set:15m|1h|4h|12h|1d|custom
  - st:refresh
This prevents cross-command conflicts and standardizes action parsing.

2) Move Telegram keyboards to presentation/keyboards
- Create a dedicated keyboard builder: presentation/keyboards/settings-menu.ts
- Keep it free of business logic; it should only construct InlineKeyboardMarkup from simple inputs (current settings values)

3) Move text/message formatting to presentation/formatters
- Create presentation/formatters/settings.formatter.ts
- Accept a simple DTO (vaultAddress, gasPriority, rebalancingSchedule) and produce the Telegram message string
- Do not query services here; it should be pure formatting

4) Add focused application use cases
- Create application/settings/get-user-settings.use-case.ts: Read user settings (from Privy customMetadata or DB if applicable) and return a normalized object. Provide sensible defaults if not set
- Create application/settings/update-user-setting.use-case.ts: Provide explicit methods like setVaultAddress, setGasPriority, setRebalancingSchedule. Validate inputs in the application layer (e.g., Solana address format) and persist via infrastructure services (Privy)
- Keep these use cases small and testable; they should not know about Telegram

5) Wire use cases in DI container
- Register the new use case classes in infrastructure/di/container.ts similar to other use cases so presentation can resolve them via container.get(...)

6) Refactor presentation/handlers/settings.ts
- Replace in-file logic with a thin orchestrator that:
  - Calls GetUserSettingsUseCase to load current settings
  - Uses SettingsFormatter to produce the message
  - Uses getSettingsKeyboard(...) to render the inline keyboard
  - Handles callback_data via regex patterns from settings.constants
  - For text-based inputs (e.g., vault address or custom schedule), store a small state in ctx.session.settingsState and process inputs in a dedicated handler

7) Update command registration
- In presentation/commands/settings.ts:
  - Register /settings to call the main handler
  - Register bot.action with a combined regex pattern that matches all settings callbacks from settings.constants
  - Add bot.on(message('text'), ...) to process interactive text steps (vault address input, custom schedule input)

8) Keep domain changes optional and minimal
- The domain/user entity already models some preferences (autoRebalanceEnabled, thresholds, strategies). Settings that are not part of the domain yet (e.g., gas priority, vault address) can live in Privy metadata temporarily
- When a setting proves stable, graduate it into the domain model and DB-backed repository. The application use cases should hide this storage detail

9) Error handling and UX
- Answer callback queries quickly (ctx.answerCbQuery)
- Edit the existing message where possible; fall back to replying a new message if edit fails
- Use safe defaults if settings cannot be loaded and show a non-breaking message

10) Testing considerations
- Unit test use cases with mocked Privy client
- Unit test formatters as pure functions
- Handler tests can validate correct parsing of callback_data and calls to use cases

Improvements to adopt (applies to /settings and other commands)
- Namespaced callback actions: Standardize across all commands (e.g., wallet actions should become wallet:refresh, wallet:transfer:... or a compact prefix w:refresh). This avoids collisions where two commands accidentally reuse the same callback_data
- Centralized constants: Keep builders and regex patterns in presentation/constants so they can be reused by keyboards and handlers
- Message editing policy: Prefer editing the current message for interactive flows to reduce clutter; only send a new message when editing fails or when it’s a new thread of interaction
- Session state naming: Use command-scoped keys in session (e.g., settingsState) to avoid conflicts with flows like transferState
- Validation at the edges: Validate user inputs in application use cases; keep handlers free of business logic

Example: Adding a new setting (Notifications toggle)
1. Contract
- Add in settings.constants:
  - ST_CALLBACKS.notificationsToggle => st:notifications:toggle
  - ST_PATTERNS.notificationsToggle => /^st:notifications:toggle$/

2. Use case method
- In update-user-setting.use-case.ts add:
  - async setNotificationsEnabled(telegramId: string, enabled: boolean)
- Persist to Privy metadata for now (notificationsEnabled: boolean); later migrate to domain User.preferences and DB

3. Keyboard and formatter
- Add a row in getSettingsKeyboard(...) that shows current status and a toggle button
- Update SettingsFormatter.formatOverview(...) to include the status line

4. Handler
- In handleSettingsCallback, match ST_PATTERNS.notificationsToggle, call the use case, refresh the settings message

Following this pattern, you can add settings without modifying unrelated layers and keep /settings clean and maintainable.

What we improved in this refactor
- Introduced namespaced, regex-validated callback actions for settings
- Split presentation (handlers, keyboards, formatters) from application use cases
- Added a single place to render settings state and a single place to persist it
- Made it trivial to add new settings by touching constants, use cases, formatter, and keyboard only
