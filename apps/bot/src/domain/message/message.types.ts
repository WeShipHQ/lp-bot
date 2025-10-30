export type MessageKey = `${string}.${string}` | string;

export type MessageParseMode = "none" | "markdown" | "markdownV2" | "html";

export interface MessageInlineButton {
  text: string;
  callbackData?: string;
  url?: string;
  pay?: boolean;
  switchInlineQuery?: string;
  switchInlineQueryCurrentChat?: string;
}

export type MessageInlineKeyboardRow = MessageInlineButton[];

export interface MessageInlineKeyboard {
  type: "inline";
  rows: MessageInlineKeyboardRow[];
}

export interface MessageReplyKeyboardButton {
  text: string;
  requestContact?: boolean;
  requestLocation?: boolean;
}

export type MessageReplyKeyboardRow = MessageReplyKeyboardButton[];

export interface MessageReplyKeyboard {
  type: "reply";
  rows: MessageReplyKeyboardRow[];
  resize?: boolean;
  oneTime?: boolean;
  selective?: boolean;
}

export type MessageKeyboard = MessageInlineKeyboard | MessageReplyKeyboard;

export interface MessageTextBody {
  kind: "text";
  text: string;
  parseMode?: MessageParseMode;
  disableLinkPreview?: boolean;
}

export interface MessagePhotoBody {
  kind: "photo";
  data: Buffer | { url: string } | { fileId: string };
  caption?: string;
  parseMode?: MessageParseMode;
}

export type MessageBody = MessageTextBody | MessagePhotoBody;

export interface MessagePayload {
  key: MessageKey;
  body: MessageBody;
  keyboard?: MessageKeyboard;
  metadata?: Record<string, unknown>;
}

export interface MessageTemplate<Data = unknown> {
  key: MessageKey;
  defaultParseMode?: MessageParseMode;
  disableLinkPreview?: boolean;
  build(data: Data): MessagePayload;
}

export interface MessageDeliveryContext {
  chatId: number;
  threadId?: number;
  replyToMessageId?: number;
}

export interface SentMessageMetadata {
  chatId: number;
  messageId: number;
}
