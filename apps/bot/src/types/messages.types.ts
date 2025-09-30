export interface MessageTemplate {
  template: string;
  variables?: Record<string, any>;
}

export interface MessageContext {
  userId?: string;
  username?: string;
  walletAddress?: string;
  [key: string]: any;
}

export interface FormattedMessage {
  text: string;
  parseMode?: "Markdown" | "HTML";
  disableWebPagePreview?: boolean;
}

export type MessageKey = string;
export type MessageVariables = Record<string, any>;
