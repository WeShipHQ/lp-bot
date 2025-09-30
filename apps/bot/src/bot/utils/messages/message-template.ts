import {
  MessageTemplate,
  MessageVariables,
  FormattedMessage,
} from "@/types/messages.types";

export class TemplateEngine {
  private static readonly VARIABLE_PATTERN = /\{\{(\w+)\}\}/g;

  /**
   * Renders a template with provided variables
   */
  static render(template: string, variables: MessageVariables = {}): string {
    return template.replace(this.VARIABLE_PATTERN, (match, variableName) => {
      const value = variables[variableName];
      return value !== undefined ? String(value) : match;
    });
  }

  /**
   * Renders a message template with context
   */
  static renderTemplate(messageTemplate: MessageTemplate): FormattedMessage {
    const text = this.render(
      messageTemplate.template,
      messageTemplate.variables
    );

    return {
      text,
      parseMode: "Markdown",
      disableWebPagePreview: true,
    };
  }

  /**
   * Sample template for welcome message with dynamic content
   */
  static getWelcomeTemplate(hasWallet: boolean): MessageTemplate {
    const baseTemplate = `🎉 **Welcome to Meteora Liquidity Bot!**

🚀 Your gateway to automated liquidity provision on Solana

{{walletSection}}

📋 **What you can do:**
• 📊 View trending pools
• 💼 Manage your portfolio  
• 🔄 Create and manage positions
• 💰 Track your earnings

Use the menu below to get started! 👇{{referralMessage}}`;

    const walletSection = hasWallet
      ? `💼 **Your Wallet**
📍 Address: \`{{walletAddress}}\`
💰 Balance: {{balance}}

`
      : `🔗 **Get Started**
Connect your wallet to begin providing liquidity and earning fees!

`;

    return {
      template: baseTemplate,
      variables: {
        walletSection,
        referralMessage: "",
      },
    };
  }

  /**
   * Validates if a template has all required variables
   */
  static validateTemplate(
    template: string,
    variables: MessageVariables
  ): string[] {
    const matches = template.match(this.VARIABLE_PATTERN);
    if (!matches) return [];

    const requiredVariables = matches.map((match) =>
      match.replace(/\{\{|\}\}/g, "")
    );

    return requiredVariables.filter(
      (variable) => variables[variable] === undefined
    );
  }

  /**
   * Escapes markdown special characters in variables
   */
  static escapeMarkdown(text: string): string {
    return text.replace(/[_*[\]()~`>#+=|{}.!-]/g, "\\$&");
  }
}
