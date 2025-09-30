import {
  GLOBAL_MESSAGES,
  START_MESSAGES,
} from "../../constants/messages.constants";
import { StartFormatter } from "./start.formatter";
import { TemplateEngine } from "./message-template";
import {
  MessageContext,
  FormattedMessage,
  MessageTemplate,
} from "../../../types/messages.types";

export class MessageManager {
  // Global message getters
  static getGlobalMessage(
    category: keyof typeof GLOBAL_MESSAGES,
    key: string
  ): string {
    const categoryMessages = GLOBAL_MESSAGES[category] as Record<
      string,
      string
    >;
    return categoryMessages[key] || GLOBAL_MESSAGES.SYSTEM.ERROR_GENERIC;
  }

  static getErrorMessage(message?: string): string {
    return message || GLOBAL_MESSAGES.SYSTEM.ERROR_GENERIC;
  }

  static getPrivateChatRequiredMessage(): string {
    return GLOBAL_MESSAGES.SYSTEM.PRIVATE_CHAT_REQUIRED;
  }

  static getProcessingMessage(): string {
    return GLOBAL_MESSAGES.SYSTEM.PROCESSING;
  }

  // Start command specific messages
  static getStartWelcomeMessage(context: MessageContext): string {
    return StartFormatter.formatWelcomeMessage(context);
  }

  static getStartReferralMessage(
    type: "success" | "invalid" | "already_used"
  ): string {
    return StartFormatter.formatReferralMessage(type);
  }

  static getStartErrorMessage(errorType: string): string {
    return StartFormatter.formatErrorMessage(errorType);
  }

  // Template-based message rendering
  static renderTemplate(template: MessageTemplate): FormattedMessage {
    return TemplateEngine.renderTemplate(template);
  }

  static getWelcomeTemplate(hasWallet: boolean): MessageTemplate {
    return TemplateEngine.getWelcomeTemplate(hasWallet);
  }

  // Utility methods
  static formatButtonNotForYou(): string {
    return GLOBAL_MESSAGES.FEEDBACK.BUTTON_NOT_FOR_YOU;
  }

  static formatExpiredAction(): string {
    return GLOBAL_MESSAGES.FEEDBACK.EXPIRED_ACTION;
  }

  static formatLoadingMessage(
    type: keyof typeof GLOBAL_MESSAGES.LOADING
  ): string {
    return GLOBAL_MESSAGES.LOADING[type];
  }

  // Validation helpers
  static validateMessageTemplate(
    template: string,
    variables: Record<string, any>
  ): string[] {
    return TemplateEngine.validateTemplate(template, variables);
  }
}
