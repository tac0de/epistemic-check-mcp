/**
 * API Validation Tools - Validate API usage and function calls
 */

import { z } from "zod";
import { SignatureValidator } from "../analyzers/index.js";
import {
  VerifyApiUsageSchema,
} from "../types/schemas.js";
import { ToolResponse, ServerConfig } from "../types/index.js";

export class APIValidationTools {
  private signatureValidator: SignatureValidator;
  private workspacePath: string;

  constructor(config: ServerConfig) {
    this.workspacePath = config.workspacePath;
    this.signatureValidator = new SignatureValidator();
  }

  /**
   * Verify API usage against known library APIs
   */
  async verifyApiUsage(input: {
    library: string;
    api: string;
    parameters?: Record<string, unknown>;
  }): Promise<ToolResponse> {
    try {
      const validated = VerifyApiUsageSchema.parse(input);
      const { library, api, parameters = {} } = validated;

      const result = this.signatureValidator.validateAPIUsage(library, api, parameters);

      return {
        content: [
          {
            type: "text",
            text: JSON.stringify(
              {
                library,
                api,
                valid: result.valid,
                errors: result.errors,
                warnings: result.warnings,
                suggestions: result.suggestions,
                confidence: result.valid ? 1 : 0.8,
              },
              null,
              2
            ),
          },
        ],
      };
    } catch (error) {
      if (error instanceof z.ZodError) {
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify({
                error: "Invalid input",
                details: error.errors,
              }),
            },
          ],
          isError: true,
        };
      }

      return {
        content: [
          {
            type: "text",
            text: JSON.stringify({
              error: "Failed to verify API usage",
              details: error instanceof Error ? error.message : String(error),
            }),
          },
        ],
        isError: true,
      };
    }
  }

  /**
   * Validate a code snippet for API usage issues
   */
  async validateCodeSnippets(input: {
    code: string;
    language: string;
  }): Promise<ToolResponse> {
    try {
      const { code, language } = input;

      if (language !== "typescript" && language !== "javascript" && language !== "tsx" && language !== "jsx") {
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(
                {
                  valid: true,
                  message: `Language '${language}' is not yet supported for validation`,
                  supportedLanguages: ["typescript", "javascript", "tsx", "jsx"],
                },
                null,
                2
              ),
            },
          ],
        };
      }

      const issues = this.signatureValidator.validateCodeSignatures(code);

      return {
        content: [
          {
            type: "text",
            text: JSON.stringify(
              {
                valid: issues.length === 0,
                issuesCount: issues.length,
                issues: issues.map((issue) => ({
                  error: issue.error,
                  expectedSignature: issue.expectedSignature,
                  actualSignature: issue.actualSignature,
                })),
                confidence: 0.9,
              },
              null,
              2
            ),
          },
        ],
      };
    } catch (error) {
      return {
        content: [
          {
            type: "text",
            text: JSON.stringify({
              error: "Failed to validate code snippets",
              details: error instanceof Error ? error.message : String(error),
            }),
          },
        ],
        isError: true,
      };
    }
  }

  /**
   * Clear cache
   */
  clearCache(): void {
    this.signatureValidator.clearCache();
  }
}
