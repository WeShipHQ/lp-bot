import { 
  MessageTemplate, 
  FormattedMessage, 
  ValidationResult, 
  MessageFormatter,
  MessageConfig,
  MessageVariables 
} from '../types/messages.types';

export class TemplateEngine implements MessageFormatter {
  private static instance: TemplateEngine;
  private templateCache = new Map<string, (variables: Record<string, any>) => string>();

  static getInstance(): TemplateEngine {
    if (!TemplateEngine.instance) {
      TemplateEngine.instance = new TemplateEngine();
    }
    return TemplateEngine.instance;
  }

  /**
   * Format a template string with variables
   */
  format(template: string, variables: Record<string, any> = {}): string {
    // Check cache first
    const cacheKey = template;
    let compiledTemplate = this.templateCache.get(cacheKey);

    if (!compiledTemplate) {
      compiledTemplate = this.compileTemplate(template);
      this.templateCache.set(cacheKey, compiledTemplate);
    }

    try {
      return compiledTemplate(variables);
    } catch (error) {
      console.error('Template formatting error:', error);
      return template; // Return original template on error
    }
  }

  /**
   * Validate template and variables
   */
  validate(template: string, variables: Record<string, any> = {}): ValidationResult {
    const errors: string[] = [];
    const missingVariables: string[] = [];

    // Find all variable placeholders
    const variableMatches = template.match(/\{([^}]+)\}/g) || [];
    const requiredVariables = variableMatches.map(match => 
      match.slice(1, -1).split('|')[0].trim()
    );

    // Check for missing variables
    for (const variable of requiredVariables) {
      if (this.getNestedValue(variables, variable) === undefined) {
        missingVariables.push(variable);
      }
    }

    // Check for circular references
    if (this.hasCircularReferences(template, variables)) {
      errors.push('Circular reference detected in template variables');
    }

    return {
      isValid: errors.length === 0 && missingVariables.length === 0,
      missingVariables,
      errors
    };
  }

  /**
   * Render a complete message configuration
   */
  renderMessage(config: MessageConfig, variables: MessageVariables = {}): FormattedMessage {
    let text: string;

    if (config.template) {
      text = this.format(config.template, { ...config.variables, ...variables });
    } else if (config.text) {
      text = config.text;
    } else {
      throw new Error('Message config must have either text or template');
    }

    return {
      text,
      parseMode: config.parseMode,
      disableWebPagePreview: config.disableWebPagePreview,
      disableNotification: config.disableNotification
    };
  }

  /**
   * Compile template into a function for better performance
   */
  private compileTemplate(template: string): (variables: Record<string, any>) => string {
    return (variables: Record<string, any>) => {
      return template.replace(/\{([^}]+)\}/g, (match, expression) => {
        try {
          return this.evaluateExpression(expression.trim(), variables);
        } catch (error) {
          console.warn(`Failed to evaluate expression: ${expression}`, error);
          return match; // Return original placeholder on error
        }
      });
    };
  }

  /**
   * Evaluate template expressions with support for:
   * - Simple variables: {name}
   * - Nested properties: {user.name}
   * - Formatters: {amount|currency}
   * - Conditional: {hasWallet ? walletInfo : 'No wallet'}
   */
  private evaluateExpression(expression: string, variables: Record<string, any>): string {
    // Handle formatters (e.g., {amount|currency})
    if (expression.includes('|')) {
      const [varPath, formatter] = expression.split('|').map(s => s.trim());
      const value = this.getNestedValue(variables, varPath);
      return this.applyFormatter(value, formatter);
    }

    // Handle conditional expressions (e.g., {hasWallet ? walletInfo : 'No wallet'})
    if (expression.includes('?')) {
      return this.evaluateConditional(expression, variables);
    }

    // Handle simple variable access
    const value = this.getNestedValue(variables, expression);
    return value !== undefined ? String(value) : `{${expression}}`;
  }

  /**
   * Get nested value from object using dot notation
   */
  private getNestedValue(obj: Record<string, any>, path: string): any {
    return path.split('.').reduce((current, key) => {
      return current && current[key] !== undefined ? current[key] : undefined;
    }, obj);
  }

  /**
   * Apply formatting to values
   */
  private applyFormatter(value: any, formatter: string): string {
    if (value === undefined || value === null) {
      return '';
    }

    switch (formatter.toLowerCase()) {
      case 'currency':
        return this.formatCurrency(Number(value));
      case 'percentage':
        return this.formatPercentage(Number(value));
      case 'number':
        return this.formatNumber(Number(value));
      case 'date':
        return this.formatDate(value);
      case 'relative':
        return this.formatRelativeTime(value);
      case 'address':
        return this.formatAddress(String(value));
      case 'upper':
        return String(value).toUpperCase();
      case 'lower':
        return String(value).toLowerCase();
      case 'capitalize':
        return this.capitalize(String(value));
      default:
        return String(value);
    }
  }

  /**
   * Evaluate conditional expressions
   */
  private evaluateConditional(expression: string, variables: Record<string, any>): string {
    const [condition, rest] = expression.split('?').map(s => s.trim());
    const [trueValue, falseValue] = rest.split(':').map(s => s.trim());

    const conditionResult = this.evaluateCondition(condition, variables);
    const selectedValue = conditionResult ? trueValue : falseValue;

    // Remove quotes if present
    return selectedValue.replace(/^['"]|['"]$/g, '');
  }

  /**
   * Evaluate condition for conditional expressions
   */
  private evaluateCondition(condition: string, variables: Record<string, any>): boolean {
    // Simple existence check
    const value = this.getNestedValue(variables, condition);
    return Boolean(value);
  }

  /**
   * Check for circular references in template variables
   */
  private hasCircularReferences(template: string, variables: Record<string, any>): boolean {
    // Simple circular reference detection
    // In a production system, this would be more sophisticated
    const variableNames = Object.keys(variables);
    const templateVars = (template.match(/\{([^}]+)\}/g) || [])
      .map(match => match.slice(1, -1).split('|')[0].trim());

    return templateVars.some(templateVar => 
      variableNames.includes(templateVar) && 
      typeof variables[templateVar] === 'string' &&
      variables[templateVar].includes(`{${templateVar}}`)
    );
  }

  // Formatting helper methods
  private formatCurrency(value: number): string {
    if (value >= 1e9) return `$${(value / 1e9).toFixed(2)}B`;
    if (value >= 1e6) return `$${(value / 1e6).toFixed(2)}M`;
    if (value >= 1e3) return `$${(value / 1e3).toFixed(2)}K`;
    return `$${value.toFixed(2)}`;
  }

  private formatPercentage(value: number): string {
    return `${value.toFixed(2)}%`;
  }

  private formatNumber(value: number): string {
    if (value >= 1e9) return `${(value / 1e9).toFixed(2)}B`;
    if (value >= 1e6) return `${(value / 1e6).toFixed(2)}M`;
    if (value >= 1e3) return `${(value / 1e3).toFixed(2)}K`;
    return value.toLocaleString();
  }

  private formatDate(value: any): string {
    const date = new Date(value);
    return date.toLocaleDateString();
  }

  private formatRelativeTime(value: any): string {
    const date = new Date(value);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMins / 60);
    const diffDays = Math.floor(diffHours / 24);

    if (diffMins < 1) return 'just now';
    if (diffMins < 60) return `${diffMins}m ago`;
    if (diffHours < 24) return `${diffHours}h ago`;
    return `${diffDays}d ago`;
  }

  private formatAddress(address: string): string {
    if (address.length <= 16) return address;
    return `${address.slice(0, 8)}...${address.slice(-8)}`;
  }

  private capitalize(str: string): string {
    return str.charAt(0).toUpperCase() + str.slice(1).toLowerCase();
  }

  /**
   * Clear template cache (useful for testing or memory management)
   */
  clearCache(): void {
    this.templateCache.clear();
  }

  /**
   * Get cache statistics
   */
  getCacheStats(): { size: number; keys: string[] } {
    return {
      size: this.templateCache.size,
      keys: Array.from(this.templateCache.keys())
    };
  }
}

export const templateEngine = TemplateEngine.getInstance();