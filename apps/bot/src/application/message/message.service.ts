import { injectable } from "inversify";
import {
  MessageDeliveryContext,
  MessagePayload,
  SentMessageMetadata,
} from "@/domain/message";
import {
  DeleteMessageCommand,
  EditMessageCommand,
  MessageGateway,
  SendMessageCommand,
} from "./message.gateway";

export interface SendCommandOptions {
  context: MessageDeliveryContext;
  payload: MessagePayload;
}

export interface EditCommandOptions {
  context: MessageDeliveryContext & { messageId: number };
  payload: MessagePayload;
}

export interface DeleteCommandOptions {
  context: MessageDeliveryContext & { messageId: number };
}

@injectable()
export class MessageService {
  constructor(private readonly gateway: MessageGateway) {}

  async send(options: SendCommandOptions): Promise<SentMessageMetadata> {
    const command: SendMessageCommand = {
      context: options.context,
      payload: options.payload,
    };

    return this.gateway.send(command);
  }

  async edit(options: EditCommandOptions): Promise<void> {
    const command: EditMessageCommand = {
      context: options.context,
      payload: options.payload,
    };

    await this.gateway.edit(command);
  }

  async delete(options: DeleteCommandOptions): Promise<void> {
    const command: DeleteMessageCommand = {
      context: options.context,
    };

    await this.gateway.delete(command);
  }
}
