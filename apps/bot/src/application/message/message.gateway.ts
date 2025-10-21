import {
  MessageDeliveryContext,
  MessagePayload,
  SentMessageMetadata,
} from "@/domain/message";

export interface SendMessageCommand {
  context: MessageDeliveryContext;
  payload: MessagePayload;
}

export interface EditMessageCommand {
  context: MessageDeliveryContext & { messageId: number };
  payload: MessagePayload;
}

export interface DeleteMessageCommand {
  context: MessageDeliveryContext & { messageId: number };
}

export interface MessageGateway {
  send(command: SendMessageCommand): Promise<SentMessageMetadata>;
  edit(command: EditMessageCommand): Promise<void>;
  delete(command: DeleteMessageCommand): Promise<void>;
}
