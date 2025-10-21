import {
  MessageKey,
  MessageKeyboard,
  MessageParseMode,
  MessagePayload,
} from "@/domain/message";

interface TextMessageOptions {
  parseMode?: MessageParseMode;
  keyboard?: MessageKeyboard;
  disableLinkPreview?: boolean;
  metadata?: Record<string, unknown>;
}

export function createTextMessage(
  key: MessageKey,
  text: string,
  options: TextMessageOptions = {}
): MessagePayload {
  return {
    key,
    body: {
      kind: "text",
      text,
      parseMode: options.parseMode,
      disableLinkPreview: options.disableLinkPreview,
    },
    keyboard: options.keyboard,
    metadata: options.metadata,
  };
}
