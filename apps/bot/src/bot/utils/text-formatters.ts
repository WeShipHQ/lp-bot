import { escapers, serialiseWith } from "@telegraf/entity";
import type { Serialiser, Node, Message, TextMessage } from "@telegraf/entity/types/types";
// import type { TGInboxSettings } from "src/settings";
// import type { MsgChannel, MsgNonChannel } from "src/type";

/**
 * Escape special characters for MarkdownV2
 */
export function escapeMarkdown(text: string): string {
  // Characters that need escaping in MarkdownV2: _*[]()~`>#+-=|{}.!
  return text.replace(/[_*\[\]()~`>#+=|{}.!-]/g, "\\$&");
}

/**
 * Bold text formatting
 */
export function bold(text: string | number): string {
  const str = typeof text === "number" ? text.toString() : text;
  return `*${escapeMarkdown(str)}*`;
}

/**
 * Italic text formatting
 */
export function italic(text: string | number): string {
  const str = typeof text === "number" ? text.toString() : text;
  return `_${escapeMarkdown(str)}_`;
}

/**
 * Bold + Italic text formatting
 */
export function boldItalic(text: string | number): string {
  const str = typeof text === "number" ? text.toString() : text;
  return `**_${escapeMarkdown(str)}_**`;
}

/**
 * Inline code formatting
 */
export function code(text: string | number): string {
  const str = typeof text === "number" ? text.toString() : text;
  return `\`${str}\``;
}

/**
 * Code block formatting
 */
export function codeBlock(text: string, language?: string): string {
  const lang = language ? language : "";
  return `\`\`\`${lang}\n${text}\n\`\`\``;
}

/**
 * Strikethrough text formatting
 */
export function strikethrough(text: string | number): string {
  const str = typeof text === "number" ? text.toString() : text;
  return `~${escapeMarkdown(str)}~`;
}

/**
 * Underline text formatting
 */
export function underline(text: string | number): string {
  const str = typeof text === "number" ? text.toString() : text;
  return `__${escapeMarkdown(str)}__`;
}

/**
 * Spoiler text formatting
 */
export function spoiler(text: string | number): string {
  const str = typeof text === "number" ? text.toString() : text;
  return `||${escapeMarkdown(str)}||`;
}

/**
 * Link formatting
 */
export function link(text: string, url: string): string {
  return `[${escapeMarkdown(text)}](${url})`;
}

/**
 * Mention user formatting
 */
export function mention(text: string, userId: number): string {
  return `[${escapeMarkdown(text)}](tg://user?id=${userId})`;
}

/**
 * Quote/blockquote formatting
 */
export function quote(text: string): string {
  return `> ${escapeMarkdown(text)}`;
}

/**
 * Multi-line quote formatting
 */
export function blockQuote(text: string): string {
  return text
    .split("\n")
    .map((line) => `> ${escapeMarkdown(line)}`)
    .join("\n");
}

/**
 * Emoji with text formatting
 */
export function emoji(emojiChar: string, text?: string): string {
  if (!text) return emojiChar;
  return `${emojiChar} ${escapeMarkdown(text)}`;
}

/**
 * Create a formatted list
 */
export function list(items: string[], ordered: boolean = false): string {
  return items
    .map((item, index) => {
      const prefix = ordered ? `${index + 1}\\.` : "•";
      return `${prefix} ${escapeMarkdown(item)}`;
    })
    .join("\n");
}

/**
 * Create a formatted table (simple)
 */
export function table(headers: string[], rows: string[][]): string {
  const headerRow = headers.map((h) => escapeMarkdown(h)).join(" \\| ");
  const separator = headers.map(() => "\\-\\-\\-").join(" \\| ");
  const dataRows = rows.map((row) =>
    row.map((cell) => escapeMarkdown(cell)).join(" \\| ")
  );

  return [headerRow, separator, ...dataRows].join("\n");
}

/**
 * Format price with currency symbol and styling
 */
export function formatPriceText(price: number, isPositive?: boolean): string {
  const priceStr =
    // @ts-expect-error
    typeof price === "number" ? price.toFixed(2) : price.toString();

  if (isPositive === true) {
    return `🟢 ${bold(`$${priceStr}`)}`;
  } else if (isPositive === false) {
    return `🔴 ${bold(`$${priceStr}`)}`;
  }

  return bold(`$${priceStr}`);
}

/**
 * Format percentage with color indicators
 */
export function formatPercentageText(percentage: number): string {
  const sign = percentage >= 0 ? "+" : "";
  const emoji = percentage >= 0 ? "🟢" : "🔴";
  const percentStr = `${sign}${percentage.toFixed(2)}%`;

  return `${emoji} ${bold(percentStr)}`;
}

/**
 * Format address with monospace font
 */
export function formatAddress(
  address: string,
  truncate: boolean = true
): string {
  if (truncate && address.length > 12) {
    const start = address.slice(0, 6);
    const end = address.slice(-6);
    return code(`${start}\.\.\.${end}`);
  }
  return code(address);
}

/**
 * Create a section header
 */
export function sectionHeader(title: string, emoji?: string): string {
  const header = emoji ? `${emoji} ${title}` : title;
  return bold(header);
}

/**
 * Create a divider line
 */
export function divider(char: string = "─", length: number = 20): string {
  return char.repeat(length);
}

/**
 * Format key-value pairs
 */
export function keyValue(
  key: string,
  value: string | number,
  emoji?: string
): string {
  const prefix = emoji ? `${emoji} ` : "";
  const valueStr = typeof value === "number" ? value.toString() : value;
  return `${prefix}${bold(key)}: ${valueStr}`;
}

/**
 * Format status with indicator
 */
export function status(text: string, isActive: boolean): string {
  const indicator = isActive ? "🟢" : "🔴";
  return `${indicator} ${text}`;
}

/**
 * Format warning message
 */
export function warning(text: string): string {
  return `⚠️ ${italic(text)}`;
}

/**
 * Format error message
 */
export function error(text: string): string {
  return `❌ ${bold(text)}`;
}

/**
 * Format success message
 */
export function success(text: string): string {
  return `✅ ${bold(text)}`;
}

/**
 * Format info message
 */
export function info(text: string): string {
  return `ℹ️ ${text}`;
}

/**
 * Format loading message
 */
export function loading(text: string): string {
  return `⏳ ${italic(text)}`;
}

/**
 * Create a progress bar
 */
export function progressBar(percentage: number, length: number = 10): string {
  const filled = Math.round((percentage / 100) * length);
  const empty = length - filled;
  const bar = "\\█".repeat(filled) + "\\░".repeat(empty);
  return `${bar} ${percentage.toFixed(1)}%`;
}

/**
 * Format timestamp
 */
export function timestamp(date: Date | string | number): string {
  const d = new Date(date);
  return code(d.toLocaleString());
}

/**
 * Create a button-like text (for inline keyboards reference)
 */
export function button(text: string): string {
  return `[${text}]`;
}

/**
 * Format large numbers with appropriate styling
 */
export function formatLargeNumber(num: number): string {
  if (num >= 1e9) {
    return bold(`${(num / 1e9).toFixed(2)}B`);
  }
  if (num >= 1e6) {
    return bold(`${(num / 1e6).toFixed(2)}M`);
  }
  if (num >= 1e3) {
    return bold(`${(num / 1e3).toFixed(2)}K`);
  }
  return bold(num.toString());
}

/**
 * Combine multiple formatting functions
 */
export function combine(...formatters: string[]): string {
  return formatters.join(" ");
}

/**
 * Create a card-like message structure
 */
export function card(
  title: string,
  content: string[],
  footer?: string
): string {
  const header = sectionHeader(title, "📋");
  const body = content.join("\n");
  const parts = [header, "", body];

  if (footer) {
    parts.push("", italic(footer));
  }

  return parts.join("\n");
}


const markdownSerialiser: Serialiser = (match: string, node?: Node) => {
  switch (node?.type) {
    case "bold":
      return `**${match}**`;
    case "italic":
      return `*${match}*`;
    case "underline":
      return `<u>${match}</u>`;
    case "strikethrough":
      return `~~${match}~~`;
    case "code":
      return `\`${match}\``;
    case "pre":
      if (node.language) return "```" + node.language + "\n" + match + "\n```";
      return "```\n" + match + "\n```";
    case "spoiler":
      return `==${match}==`;
    case "url":
      return match;
    case "text_link":
      return `[${match}](${node.url})`;
    case "text_mention":
      return `[${match}](tg://user?id=${node.user.id})`;
    case "blockquote":
      return `${match
        .split("\n")
        .map((line) => `>${line}`)
        .join("\n")}`;
    case "mention":
    case "custom_emoji":
    case "hashtag":
    case "cashtag":
    case "bot_command":
    case "phone_number":
    case "email":
    default:
      return match;
  }
};

export function toMarkdownV2(msg: TextMessage, settings: any): string {
  // @ts-expect-error
  if (settings.remove_formatting) return msg.text ?? msg.caption ?? "";
  const selectedEscaper = settings.markdown_escaper ? escapers.MarkdownV2 : escapers.HTML;
  return serialiseWith(markdownSerialiser, selectedEscaper)(msg as Message);
}