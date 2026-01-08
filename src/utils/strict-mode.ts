/**
 * Strict Mode Manager - Enforces validation based on strictness level
 */

import { StrictModeLevel } from "../types/index.js";

export interface StrictModeConfig {
  level: StrictModeLevel;
  requireValidationFor?: string[];
}

export class StrictModeManager {
  private config: StrictModeConfig;
  private toolUsageHistory: Map<string, number> = new Map();
  private validationHistory: Map<string, number> = new Map();

  constructor(config: StrictModeConfig) {
    this.config = config;
  }

  /**
   * Check if a tool should require validation
   */
  requiresValidation(toolName: string): boolean {
    switch (this.config.level) {
      case "off":
        return false;

      case "warn":
        // Log warnings but don't enforce
        this.logIfRequired(toolName);
        return false;

      case "strict":
        // Require validation for code generation tools
        const strictTools = this.config.requireValidationFor || [
          "review_code_for_hallucinations",
          "validate_factual_claims",
        ];
        return strictTools.includes(toolName);

      case "paranoid":
        // Require validation for ALL tools
        return true;

      default:
        return false;
    }
  }

  /**
   * Check if validation was performed before tool usage
   */
  wasValidationPerformed(toolName: string): boolean {
    const validationCount = this.validationHistory.get(toolName) || 0;
    const toolUsageCount = this.toolUsageHistory.get(toolName) || 0;

    // In paranoid mode, always require fresh validation
    if (this.config.level === "paranoid") {
      return validationCount > toolUsageCount;
    }

    // In strict mode, validation must exist
    if (this.config.level === "strict") {
      return validationCount > 0;
    }

    return true;
  }

  /**
   * Record that a tool was used
   */
  recordToolUsage(toolName: string): void {
    const current = this.toolUsageHistory.get(toolName) || 0;
    this.toolUsageHistory.set(toolName, current + 1);
  }

  /**
   * Record that validation was performed
   */
  recordValidation(toolName: string): void {
    const current = this.validationHistory.get(toolName) || 0;
    this.validationHistory.set(toolName, current + 1);
  }

  /**
   * Get a warning message if validation is required but not performed
   */
  getWarning(toolName: string): string | null {
    if (!this.requiresValidation(toolName)) {
      return null;
    }

    if (!this.wasValidationPerformed(toolName)) {
      return [
        `⚠️  Strict Mode Warning: Tool '${toolName}' was called without prior validation.`,
        `Recommended: Call validation tools first (e.g., verify_symbol_exists, validate_import_path)`,
        `Current strictness level: ${this.config.level}`,
      ].join("\n");
    }

    return null;
  }

  /**
   * Check if a tool call violates strict mode
   */
  checkViolation(toolName: string): { violation: boolean; message?: string } {
    this.recordToolUsage(toolName);

    const warning = this.getWarning(toolName);
    if (warning) {
      if (this.config.level === "strict" || this.config.level === "paranoid") {
        // In strict/paranoid mode, this is an error
        return {
          violation: true,
          message: `🚫 Strict Mode Violation: ${warning}`,
        };
      } else {
        // In warn mode, just log it
        console.error(warning);
        return { violation: false };
      }
    }

    return { violation: false };
  }

  /**
   * Get statistics about tool usage and validation
   */
  getStats(): {
    toolUsageCount: number;
    validationCount: number;
    toolsUsed: string[];
    validationsPerformed: string[];
    compliance: number;
  } {
    const totalToolUsage = Array.from(this.toolUsageHistory.values()).reduce((a, b) => a + b, 0);
    const totalValidations = Array.from(this.validationHistory.values()).reduce((a, b) => a + b, 0);
    const toolsUsed = Array.from(this.toolUsageHistory.keys());
    const validationsPerformed = Array.from(this.validationHistory.keys());

    // Compliance = validations / tool usage
    const compliance = totalToolUsage > 0 ? totalValidations / totalToolUsage : 1;

    return {
      toolUsageCount: totalToolUsage,
      validationCount: totalValidations,
      toolsUsed,
      validationsPerformed,
      compliance: Math.round(compliance * 100) / 100,
    };
  }

  /**
   * Reset history
   */
  reset(): void {
    this.toolUsageHistory.clear();
    this.validationHistory.clear();
  }

  /**
   * Update configuration
   */
  updateConfig(config: Partial<StrictModeConfig>): void {
    this.config = { ...this.config, ...config };
  }

  /**
   * Get current configuration
   */
  getConfig(): StrictModeConfig {
    return { ...this.config };
  }

  /**
   * Log if in warn mode
   */
  private logIfRequired(toolName: string): void {
    if (this.config.level === "warn") {
      const validationCount = this.validationHistory.get(toolName) || 0;
      if (validationCount === 0) {
        console.error(
          `⚠️  Warning: '${toolName}' called without validation. Consider calling validation tools first.`
        );
      }
    }
  }
}
