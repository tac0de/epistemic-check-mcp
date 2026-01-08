/**
 * Post-Review Tools - Comprehensive review of generated code for hallucinations
 */

import { z } from "zod";
import {
  ReviewCodeForHallucinationsSchema,
  ValidateFactualClaimsSchema,
} from "../types/schemas.js";
import { ToolResponse, HallucinationIssue, ServerConfig } from "../types/index.js";
import { ExistenceCheckTools } from "./existence-check.js";
import { ConsistencyCheckTools } from "./consistency-check.js";
import { APIValidationTools } from "./api-validation.js";
import { glob } from "fast-glob";

export class PostReviewTools {
  private existenceTools: ExistenceCheckTools;
  private consistencyTools: ConsistencyCheckTools;
  private apiValidationTools: APIValidationTools;
  private workspacePath: string;

  constructor(config: ServerConfig) {
    this.workspacePath = config.workspacePath;
    this.existenceTools = new ExistenceCheckTools(config);
    this.consistencyTools = new ConsistencyCheckTools(config);
    this.apiValidationTools = new APIValidationTools(config);
  }

  /**
   * Review code for hallucinations - comprehensive check
   */
  async reviewCodeForHallucinations(input: {
    code: string;
    language: string;
    context?: string;
    checkImports?: boolean;
    checkSignatures?: boolean;
    checkTypes?: boolean;
  }): Promise<ToolResponse> {
    try {
      const validated = ReviewCodeForHallucinationsSchema.parse(input);
      const {
        code,
        language,
        context,
        checkImports = true,
        checkSignatures = true,
        checkTypes = true,
      } = validated;

      const issues: HallucinationIssue[] = [];

      // 1. Check for missing symbols (hallucinated functions/classes/variables)
      const symbols = this.extractSymbolsFromCode(code);
      for (const symbol of symbols) {
        const result = await this.existenceTools.verifySymbolExists({
          symbol: symbol.name,
          symbolType: symbol.type,
        });

        const resultData = JSON.parse(result.content[0].text);
        if (!resultData.exists) {
          issues.push({
            type: "missing-symbol",
            severity: "error",
            message: `Symbol '${symbol.name}' does not exist in the codebase`,
            suggestion: resultData.suggestion?.[0] || `Check if '${symbol.name}' is spelled correctly or needs to be imported`,
            confidence: 0.9,
          });
        }
      }

      // 2. Check imports
      if (checkImports) {
        const imports = this.extractImportsFromCode(code);
        for (const imp of imports) {
          // Skip node_modules and built-in imports
          if (
            !imp.path.startsWith(".") &&
            !imp.path.startsWith("/") &&
            !imp.path.startsWith("@")
          ) {
            continue;
          }

          const result = await this.existenceTools.validateImportPath({
            importPath: imp.path,
            fromFile: this.workspacePath + "/temp.ts", // Placeholder
          });

          const resultData = JSON.parse(result.content[0].text);
          if (!resultData.valid) {
            issues.push({
              type: "invalid-import",
              severity: "error",
              message: `Import '${imp.path}' could not be resolved`,
              suggestion: resultData.alternatives
                ? `Try: ${resultData.alternatives.join(", ")}`
                : undefined,
              confidence: 0.95,
            });
          }
        }
      }

      // 3. Check type consistency
      if (checkTypes && (language === "typescript" || language === "tsx")) {
        const typeResult = await this.consistencyTools.validateTypeConsistency({
          code,
          language,
        });

        const typeData = JSON.parse(typeResult.content[0].text);
        if (!typeData.consistent) {
          for (const error of typeData.typeErrors) {
            issues.push({
              type: "type-error",
              severity: "warning",
              message: error.error,
              confidence: error.confidence,
            });
          }
        }
      }

      // 4. Check for contradictory statements
      const statements = this.extractStatementsFromCode(code);
      if (statements.length > 1) {
        const contradictionResult =
          await this.consistencyTools.detectContradictions({
            statements,
            context,
          });

        const contradictionData = JSON.parse(contradictionResult.content[0].text);
        if (contradictionData.contradictions.length > 0) {
          for (const contradiction of contradictionData.contradictions) {
            issues.push({
              type: "contradiction",
              severity: "warning",
              message: `Contradiction detected: ${contradiction.reason}`,
              suggestion: "Review the contradictory statements and resolve the conflict",
              confidence: contradiction.confidence,
            });
          }
        }
      }

      // 5. Check for API mismatches
      if (checkSignatures) {
        const apiCalls = this.extractAPICallsFromCode(code);
        for (const call of apiCalls) {
          if (call.library && call.api) {
            const validationResult = await this.apiValidationTools.verifyApiUsage({
              library: call.library,
              api: call.api,
              parameters: call.parameters,
            });

            const validationData = JSON.parse(validationResult.content[0].text);
            if (!validationData.valid) {
              for (const error of validationData.errors || []) {
                issues.push({
                  type: "api-mismatch",
                  severity: "error",
                  message: error,
                  confidence: 0.8,
                });
              }
            }
          }
        }
      }

      // Calculate overall confidence
      const confidence =
        issues.length === 0
          ? 1.0
          : 1 -
            issues.reduce((sum, issue) => sum + issue.confidence, 0) / issues.length;

      // Generate summary
      const errorCount = issues.filter((i) => i.severity === "error").length;
      const warningCount = issues.filter((i) => i.severity === "warning").length;
      const infoCount = issues.filter((i) => i.severity === "info").length;

      const summary = `Found ${issues.length} potential hallucination(s): ${errorCount} error(s), ${warningCount} warning(s), ${infoCount} info`;

      return {
        content: [
          {
            type: "text",
            text: JSON.stringify(
              {
                issues,
                confidence: Math.max(0, confidence),
                summary,
                passed: issues.length === 0,
                breakdown: {
                  errors: errorCount,
                  warnings: warningCount,
                  info: infoCount,
                },
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
              error: "Failed to review code for hallucinations",
              details: error instanceof Error ? error.message : String(error),
            }),
          },
        ],
        isError: true,
      };
    }
  }

  /**
   * Validate factual claims against the codebase
   */
  async validateFactualClaims(input: {
    claims: string[];
    domain?: string;
  }): Promise<ToolResponse> {
    try {
      const validated = ValidateFactualClaimsSchema.parse(input);
      const { claims, domain = "codebase" } = validated;

      const validations: Array<{
        claim: string;
        valid: boolean;
        confidence: number;
        sources?: string[];
        reason?: string;
      }> = [];

      // Get all files in the codebase
      const files = await glob("**/*.{ts,tsx,js,jsx}", {
        cwd: this.workspacePath,
        absolute: true,
        ignore: ["**/node_modules/**", "**/dist/**", "**/build/**", "**/.git/**"],
      });

      for (const claim of claims) {
        const lowerClaim = claim.toLowerCase();

        // Check for claims about file existence
        const fileMatch = claim.match(/file\s+['"]([^'"]+)['"]\s+exists/i);
        if (fileMatch) {
          const filePath = fileMatch[1];
          const exists = files.some((f) => f.includes(filePath));

          validations.push({
            claim,
            valid: exists,
            confidence: 0.95,
            reason: exists
              ? `File '${filePath}' exists in the codebase`
              : `File '${filePath}' not found in the codebase`,
            sources: exists ? [filePath] : undefined,
          });
          continue;
        }

        // Check for claims about function/class existence
        const symbolMatch = claim.match(/(?:function|class|variable)\s+(\w+)\s+exists/i);
        if (symbolMatch) {
          const symbolName = symbolMatch[1];
          const result = await this.existenceTools.verifySymbolExists({
            symbol: symbolName,
          });

          const resultData = JSON.parse(result.content[0].text);

          validations.push({
            claim,
            valid: resultData.exists,
            confidence: resultData.exists ? 0.9 : 0.7,
            reason: resultData.exists
              ? `Symbol '${symbolName}' found in codebase`
              : `Symbol '${symbolName}' not found in codebase`,
            sources: resultData.exists ? [resultData.location] : undefined,
          });
          continue;
        }

        // Check for claims about imports
        const importMatch = claim.match(/import\s+(\w+)\s+from\s+['"]([^'"]+)['"]/i);
        if (importMatch) {
          const symbol = importMatch[1];
          const path = importMatch[2];

          const result = await this.existenceTools.validateImportPath({
            importPath: path,
            fromFile: this.workspacePath + "/temp.ts",
          });

          const resultData = JSON.parse(result.content[0].text);

          validations.push({
            claim,
            valid: resultData.valid,
            confidence: 0.8,
            reason: resultData.valid
              ? `Import path '${path}' is valid`
              : `Import path '${path}' is invalid`,
          });
          continue;
        }

        // Default: uncertain
        validations.push({
          claim,
          valid: true, // Assume valid if we can't verify
          confidence: 0.3,
          reason: "Could not verify this claim automatically",
        });
      }

      const overallValid = validations.every((v) => v.valid);
      const avgConfidence =
        validations.reduce((sum, v) => sum + v.confidence, 0) / validations.length;

      return {
        content: [
          {
            type: "text",
            text: JSON.stringify(
              {
                domain,
                validations,
                summary: `${validations.filter((v) => v.valid).length}/${validations.length} claims validated`,
                overallValid,
                confidence: avgConfidence,
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
              error: "Failed to validate factual claims",
              details: error instanceof Error ? error.message : String(error),
            }),
          },
        ],
        isError: true,
      };
    }
  }

  /**
   * Extract symbols (functions, classes, variables) from code
   */
  private extractSymbolsFromCode(code: string): Array<{
    name: string;
    type: "function" | "class" | "variable";
  }> {
    const symbols: Array<{ name: string; type: "function" | "class" | "variable" }> = [];

    // Extract function calls
    const functionCallPattern = /(\w+)\s*\(/g;
    let match;
    while ((match = functionCallPattern.exec(code)) !== null) {
      const name = match[1];
      if (!this.isBuiltinSymbol(name)) {
        symbols.push({ name, type: "function" });
      }
    }

    // Extract class instantiations
    const classPattern = /new\s+(\w+)\(/g;
    while ((match = classPattern.exec(code)) !== null) {
      const name = match[1];
      if (!this.isBuiltinSymbol(name)) {
        symbols.push({ name, type: "class" });
      }
    }

    // Extract property access (potential variables)
    const propertyPattern = /(\w+)\.\w+/g;
    while ((match = propertyPattern.exec(code)) !== null) {
      const name = match[1];
      if (!this.isBuiltinSymbol(name) && !symbols.find((s) => s.name === name)) {
        symbols.push({ name, type: "variable" });
      }
    }

    return symbols;
  }

  /**
   * Extract imports from code
   */
  private extractImportsFromCode(code: string): Array<{ path: string }> {
    const imports: Array<{ path: string }> = [];

    const patterns = [
      /import\s+.*?from\s+['"]([^'"]+)['"]/g,
      /import\(['"]([^'"]+)['"]\)/g,
      /require\(['"]([^'"]+)['"]\)/g,
    ];

    for (const pattern of patterns) {
      let match;
      while ((match = pattern.exec(code)) !== null) {
        imports.push({ path: match[1] });
      }
    }

    return imports;
  }

  /**
   * Extract statements from code
   */
  private extractStatementsFromCode(code: string): string[] {
    // Split by common delimiters and clean up
    const statements = code
      .split(/[;\n\r]+/)
      .map((s) => s.trim())
      .filter((s) => s.length > 10 && !s.startsWith("//") && !s.startsWith("*"));

    return statements;
  }

  /**
   * Extract API calls from code
   */
  private extractAPICallsFromCode(code: string): Array<{
    library?: string;
    api: string;
    parameters?: Record<string, unknown>;
  }> {
    const calls: Array<{ library?: string; api: string; parameters?: Record<string, unknown> }> = [];

    // Match patterns like: library.function(...)
    const pattern = /(\w+)\.(\w+)\s*\(/g;
    let match;

    while ((match = pattern.exec(code)) !== null) {
      calls.push({
        library: match[1],
        api: match[2],
      });
    }

    return calls;
  }

  /**
   * Check if a symbol is a built-in
   */
  private isBuiltinSymbol(name: string): boolean {
    const builtins = [
      "console",
      "log",
      "error",
      "warn",
      "info",
      "JSON",
      "parse",
      "stringify",
      "parseInt",
      "parseFloat",
      "setTimeout",
      "setInterval",
      "Promise",
      "Array",
      "Object",
      "String",
      "Number",
      "Boolean",
      "Map",
      "Set",
      "Date",
      "Math",
      "undefined",
      "null",
      "true",
      "false",
      "if",
      "else",
      "for",
      "while",
      "return",
      "const",
      "let",
      "var",
      "function",
      "class",
      "new",
      "this",
      "super",
      "extends",
      "import",
      "export",
      "from",
      "async",
      "await",
      "try",
      "catch",
      "throw",
    ];

    return builtins.includes(name);
  }

  /**
   * Clear cache
   */
  clearCache(): void {
    this.existenceTools.clearCache();
  }
}
