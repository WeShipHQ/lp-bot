import { injectable } from "inversify";
import {
  DeleteMessageCommand,
  EditMessageCommand,
  MessageGateway,
  SendMessageCommand,
} from "@/application/message/message.gateway";
import {
  MessageBody,
  MessageKeyboard,
  MessageParseMode,
  MessagePayload,
  SentMessageMetadata,
} from "@/domain/message";
import {
  ITelegramClient,
  SendOptions,
} from "@/infrastructure/messaging/telegram-client";

@injectable()
export class TelegramMessageGateway implements MessageGateway {
  constructor(private readonly client: ITelegramClient) {}

  async send(command: SendMessageCommand): Promise<SentMessageMetadata> {
    const messageId = await this.dispatchSend(
      command.context.chatId,
      command.payload,
      {
        reply_to_message_id: command.context.replyToMessageId,
        message_thread_id: command.context.threadId,
      }
    );

    return {
      chatId: command.context.chatId,
      messageId,
    };
  }

  async edit(command: EditMessageCommand): Promise<void> {
    const options = this.createSendOptions(command.payload, {
      reply_to_message_id: command.context.replyToMessageId,
      message_thread_id: command.context.threadId,
    });

    const body = command.payload.body;
    if (body.kind !== "text") {
      throw new Error("Editing non-text messages is not supported");
    }

    await this.client.editMessage(
      command.context.chatId,
      command.context.messageId,
      body.text,
      options
    );
  }

  async delete(command: DeleteMessageCommand): Promise<void> {
    await this.client.deleteMessage(
      command.context.chatId,
      command.context.messageId
    );
  }

  private async dispatchSend(
    chatId: number,
    payload: MessagePayload,
    baseOptions: Partial<SendOptions>
  ): Promise<number> {
    const body = payload.body;
    const options = this.createSendOptions(payload, baseOptions);

    if (body.kind === "text") {
      return this.client.sendMessage(chatId, body.text, options);
    }

    if (body.kind === "photo") {
      const { data, caption } = body;
      const normalized = this.normalizePhoto(data);
      return this.client.sendPhoto(chatId, normalized, {
        ...options,
        caption: caption,
      });
    }

    throw new Error(`Unsupported message body kind: ${(body as MessageBody).kind}`);
  }

  private createSendOptions(
    payload: MessagePayload,
    baseOptions: Partial<SendOptions> = {}
  ): SendOptions {
    const body = payload.body;
    const parseMode = this.resolveParseMode(body.parseMode);
    const disablePreview =
      body.kind === "text" ? body.disableLinkPreview : undefined;

    const options: SendOptions = {
      ...baseOptions,
      parse_mode: parseMode,
      link_preview_options:
        disablePreview !== undefined
          ? { is_disabled: disablePreview }
          : undefined,
      reply_markup: this.buildReplyMarkup(payload.keyboard),
    };

    return options;
  }

  private resolveParseMode(
    mode?: MessageParseMode
  ): SendOptions["parse_mode"] {
    if (!mode || mode === "none") return undefined;
    if (mode === "markdown") return "Markdown";
    if (mode === "markdownV2") return "MarkdownV2";
    if (mode === "html") return "HTML";
    return undefined;
  }

  private buildReplyMarkup(keyboard?: MessageKeyboard) {
    if (!keyboard) return undefined;

    if (keyboard.type === "inline") {
      return {
        inline_keyboard: keyboard.rows.map((row) =>
          row.map((button) => ({
            text: button.text,
            callback_data: button.callbackData,
            url: button.url,
            pay: button.pay,
            switch_inline_query: button.switchInlineQuery,
            switch_inline_query_current_chat:
              button.switchInlineQueryCurrentChat,
          }))
        ),
      };
    }

    if (keyboard.type === "reply") {
      return {
        keyboard: keyboard.rows.map((row) =>
          row.map((button) => ({
            text: button.text,
            request_contact: button.requestContact,
            request_location: button.requestLocation,
          }))
        ),
        resize_keyboard: keyboard.resize,
        one_time_keyboard: keyboard.oneTime,
        selective: keyboard.selective,
      };
    }

    return undefined;
  }

  private normalizePhoto(
    data: Buffer | { url: string } | { fileId: string }
  ): Buffer | { url: string } | { fileId: string } {
    if (data instanceof Buffer) return data;
    return data;
  }
}
