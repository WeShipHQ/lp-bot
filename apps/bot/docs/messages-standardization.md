# Messaging Standardization Guidelines

These guidelines define how conversational messages must be structured and handled across the Meteora Liquidity Bot after the messaging refactor. They complement `docs/messages-refactoring.md` and provide concrete rules for authors when adding or updating user-facing copy.

## 1. Canonical Message Categories

Every interaction should map to one of the following generic categories. Use these names consistently in code, template keys, and documentation.

| Category | Purpose | Example key | Example text |
| --- | --- | --- | --- |
| `loading` | Indicates that the bot is working on a request and a follow-up result is expected. | `portfolio.loading` | `⏳ Loading portfolio...`
| `success` | Confirms a successful operation. | `wallet.refresh.success` | `✅ Wallet refreshed!`
| `error` | Communicates an unrecoverable failure requiring user attention. | `wallet.refresh.error` | `❌ Failed to update wallet. Please try again.`
| `info` | Shares informational content without implying an action. | `help.links` | `Open the docs at ...`
| `warning` | Highlights an actionable issue that is not fatal. | `token.unverified` | `⚠️ This token is unverified.`
| `confirmation` | Asks for explicit user consent. | `transfer.confirm` | `Confirm token transfer?`
| `prompt` | Requests additional user input. | `transfer.prompt_amount` | `Enter the amount you wish to send.`

Each category should have default phrasing and iconography defined once, then reused. Authors may extend categories (e.g., `success.claim_fees`) but must inherit from the generic templates. Keep emoji usage minimal and meaningful, aligning with existing UX conventions.

## 2. Message Flow Patterns

The standard conversational flow is:

1. **Loading** – Immediately acknowledge the user action with a loading message (`MessageService.send`). The text must clearly state what is being processed.
2. **Process** – Run the business logic. While the operation is in progress, no further messages should be sent.
3. **Completion** – Resolve the loading message by editing it (`MessageService.edit`). Replace the loading content with a success, warning, or error template.

### Error Handling

- If the process fails, edit the loading message to an error message. Do not leave the loading text in place.
- When an unexpected exception occurs *after* the loading message was sent but *before* a message ID is available (e.g., network failure), send a new error message.
- Always acknowledge callback queries (`ctx.answerCbQuery`) even when the result was shown via message edits, so Telegram does not display “Loading…” indefinitely.

### When to Send Instead of Edit

- Use `MessageService.send` for independent updates or notifications that do not replace a previous message (e.g., streaming logs, multi-step prompts).
- Use `MessageService.edit` whenever a message acts as the single status container for a workflow.
- Deleting status messages is optional; prefer editing to preserve history unless the UX requires a clean-up.

## 3. Storage Locations

To keep messaging discoverable and maintainable:

- **Generic templates**: place in `apps/bot/src/presentation/copy/messages` (create this directory if it does not exist). Store them as plain objects or simple factories grouped by domain (e.g., `generic.ts`, `portfolio.ts`), exporting typed constants for reuse.
- **Feature-specific formatters**: live under `apps/bot/src/presentation/formatters`. They should compose the generic templates with feature data and convert them into `MessagePayload` instances.
- **Keyboard builders**: remain in `apps/bot/src/presentation/keyboards`, returning domain keyboard models (`MessageInlineKeyboard`, `MessageReplyKeyboard`).
- **Scenario documentation**: expand `docs/messages-inventory.md` when new categories or flows are introduced to keep a single source of truth.

## 4. Markdown Utilities and Text Helpers

Existing helpers such as `link`, `bold`, `italic`, and number formatting must stay in a dedicated shared utility module so they can be reused without circular dependencies. Follow these rules:

- Leave Markdown/text helpers in `apps/bot/src/utils/misc.ts` (or create `text.ts` under `utils` if separation is needed). They should remain pure and presentation-agnostic.
- Formatters may import these utilities but should not duplicate them.
- Do **not** embed Markdown helper functions inside formatter files unless they are scoped to a very specific template; generic helpers belong in utilities.

## 5. Authoring Checklist

When introducing a new message or flow:

1. Identify the category (`loading`, `success`, etc.) and reuse or extend an existing template key.
2. Add or update the corresponding copy entry in `presentation/copy/messages`.
3. Build or update a formatter to produce a `MessagePayload` using `createTextMessage` and the correct keyboard.
4. Use `MessageService` for delivery, following the loading → process → edit pattern.
5. Update `docs/messages-inventory.md` when adding a new feature or major flow so reviewers can trace message ownership.

Adhering to these standards ensures consistent UX, simplifies translations, and centralizes copy updates for the whole team.