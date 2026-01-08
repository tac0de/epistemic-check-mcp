/**
 * Existence Checking Tools - Verify that symbols, imports, and functions actually exist
 */

import { z } from "zod";
import { readdirSync, statSync } from "fs";
import { join, relative, extname } from "path";
import { glob } from "fast-glob";
import { ASTAnalyzer, ImportTracker } from "../analyzers/index.js";
import {
  Schemas,
  VerifySymbolExistsSchema,
  ValidateImportPathSchema,
  CheckFunctionSignatureSchema,
} from "../types/schemas.js";
import { ToolResponse, SymbolInfo } from "../types/index.js";
import { ServerConfig } from "../types/index.js";

export class ExistenceCheckTools {
  private analyzer: ASTAnalyzer;
  private importTracker: ImportTracker;
  private workspacePath: string;
  private symbolCache: Map<string, SymbolInfo[]> = new Map();

  constructor(config: ServerConfig) {
    this.workspacePath = config.workspacePath;
    this.analyzer = new ASTAnalyzer();
    this.importTracker = new ImportTracker(this.workspacePath);
  }

  /**
   * Verify if a symbol exists in the codebase
   */
  async verifySymbolExists(input: {
    symbol: string;
    filePath?: string;
    symbolType?: "function" | "class" | "variable" | "import" | "type" | "interface";
  }): Promise<ToolResponse> {
    try {
      const validated = VerifySymbolExistsSchema.parse(input);
      const { symbol, filePath, symbolType } = validated;

      // Build symbol index if not cached
      if (this.symbolCache.size === 0) {
        await this.buildSymbolIndex();
      }

      let results: SymbolInfo[] = [];

      // Filter by file path if provided
      if (filePath) {
        const fileSymbols = this.symbolCache.get(filePath) || [];
        results = fileSymbols.filter((s) => s.name === symbol);
      } else {
        // Search all files
        for (const fileSymbols of this.symbolCache.values()) {
          results.push(...fileSymbols.filter((s) => s.name === symbol));
        }
      }

      // Filter by symbol type if provided
      if (symbolType && symbolType !== "import") {
        results = results.filter((s) => s.type === symbolType);
      }

      const exists = results.length > 0;

      if (exists) {
        // Find the best match (prefer exported symbols and correct type)
        const sorted = results.sort((a, b) => {
          if (a.exported && !b.exported) return -1;
          if (!a.exported && b.exported) return 1;
          return 0;
        });

        const bestMatch = sorted[0];

        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(
                {
                  exists: true,
                  symbol: bestMatch.name,
                  type: bestMatch.type,
                  location: `${bestMatch.filePath}:${bestMatch.line || 0}`,
                  exported: bestMatch.exported,
                  signature: bestMatch.signature,
                  otherMatches: results.length > 1 ? results.length - 1 : 0,
                },
                null,
                2
              ),
            },
          ],
        };
      } else {
        // Try to find similar symbols (suggestions)
        const suggestions = this.findSimilarSymbols(symbol, filePath, symbolType);

        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(
                {
                  exists: false,
                  symbol,
                  suggestion: suggestions.length > 0 ? suggestions : undefined,
                },
                null,
                2
              ),
            },
          ],
        };
      }
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
              error: "Failed to verify symbol",
              details: error instanceof Error ? error.message : String(error),
            }),
          },
        ],
        isError: true,
      };
    }
  }

  /**
   * Validate an import path
   */
  async validateImportPath(input: {
    importPath: string;
    fromFile: string;
    resolveAliases?: boolean;
  }): Promise<ToolResponse> {
    try {
      const validated = ValidateImportPathSchema.parse(input);
      const { importPath, fromFile, resolveAliases } = validated;

      const result = this.importTracker.resolveImportPath(importPath, fromFile);

      const response: any = {
        importPath,
        fromFile,
        valid: result.exists,
      };

      if (result.exists) {
        response.resolvedPath = result.resolvedPath;
        response.relativePath = relative(this.workspacePath, result.resolvedPath!);
      } else {
        response.error = result.error;
        response.alternatives = result.alternatives;

        // Try to find similar files
        const similarFiles = this.findSimilarFiles(importPath, fromFile);
        if (similarFiles.length > 0) {
          response.alternatives = similarFiles;
        }
      }

      return {
        content: [
          {
            type: "text",
            text: JSON.stringify(response, null, 2),
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
              error: "Failed to validate import path",
              details: error instanceof Error ? error.message : String(error),
            }),
          },
        ],
        isError: true,
      };
    }
  }

  /**
   * Check function signature
   */
  async checkFunctionSignature(input: {
    functionName: string;
    args: string[];
    filePath?: string;
  }): Promise<ToolResponse> {
    try {
      const validated = CheckFunctionSignatureSchema.parse(input);
      const { functionName, args, filePath } = validated;

      if (!filePath) {
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(
                {
                  valid: false,
                  functionName,
                  error: "File path is required to check function signature",
                  suggestion: "Provide the file path where the function is defined",
                },
                null,
                2
              ),
            },
          ],
        };
      }

      // Build symbol index if not cached
      if (this.symbolCache.size === 0) {
        await this.buildSymbolIndex();
      }

      // Find the function
      const fileSymbols = this.symbolCache.get(filePath) || [];
      const functionSymbol = fileSymbols.find(
        (s) => s.name === functionName && s.type === "function"
      );

      if (!functionSymbol) {
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(
                {
                  valid: false,
                  functionName,
                  error: `Function '${functionName}' not found in ${filePath}`,
                  suggestion: "Check if the function name is correct or if it exists in the file",
                },
                null,
                2
              ),
            },
          ],
        };
      }

      // Compare signature
      const expectedSignature = functionSymbol.signature || "";
      const actualSignature = `${functionName}(${args.join(", ")})`;

      // Basic parameter count check
      const paramMatch = expectedSignature.match(/\(([^)]*)\)/);
      const expectedParamCount = paramMatch
        ? paramMatch[1].split(",").filter((p) => p.trim() && !p.includes("?")).length
        : 0;

      const valid = args.length >= expectedParamCount;

      return {
        content: [
          {
            type: "text",
            text: JSON.stringify(
              {
                valid,
                functionName,
                actualSignature,
                expectedSignature,
                location: `${filePath}:${functionSymbol.line || 0}`,
                exported: functionSymbol.exported,
                suggestion: !valid
                  ? `Expected at least ${expectedParamCount} arguments, got ${args.length}`
                  : undefined,
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
              error: "Failed to check function signature",
              details: error instanceof Error ? error.message : String(error),
            }),
          },
        ],
        isError: true,
      };
    }
  }

  /**
   * Build symbol index for the entire workspace
   */
  private async buildSymbolIndex(): Promise<void> {
    const files = await this.getSourceFiles();

    for (const filePath of files) {
      try {
        const ast = this.analyzer.parseFile(filePath);
        const symbols = this.analyzer.extractSymbols(ast, filePath);
        if (symbols.length > 0) {
          this.symbolCache.set(filePath, symbols);
        }
      } catch (error) {
        // Skip files that can't be parsed
        continue;
      }
    }
  }

  /**
   * Get all source files in the workspace
   */
  private async getSourceFiles(): Promise<string[]> {
    const extensions = ["ts", "tsx", "js", "jsx", "mts", "mjs", "cjs"];
    const patterns = extensions.map((ext) => `**/*.${ext}`);

    return glob(patterns, {
      cwd: this.workspacePath,
      absolute: true,
      ignore: ["**/node_modules/**", "**/dist/**", "**/build/**", "**/.git/**"],
    });
  }

  /**
   * Find similar symbols (for suggestions)
   */
  private findSimilarSymbols(
    symbol: string,
    filePath?: string,
    symbolType?: string
  ): string[] {
    const suggestions: string[] = [];
    const threshold = 0.6; // Similarity threshold

    for (const [file, symbols] of this.symbolCache.entries()) {
      if (filePath && file !== filePath) continue;

      for (const s of symbols) {
        if (symbolType && s.type !== symbolType) continue;

        const similarity = this.calculateSimilarity(symbol, s.name);
        if (similarity >= threshold) {
          suggestions.push(`${s.name} (${s.type} in ${relative(this.workspacePath, file)})`);
        }
      }
    }

    return suggestions.slice(0, 5); // Return top 5
  }

  /**
   * Find similar files
   */
  private findSimilarFiles(importPath: string, fromFile: string): string[] {
    // This is a simplified implementation
    // A real implementation would use more sophisticated fuzzy matching
    const suggestions: string[] = [];

    const fromDir = join(this.workspacePath, importPath);
    const targetName = importPath.split("/").pop() || "";

    try {
      const files = readdirSync(this.workspacePath, { recursive: true }) as string[];

      for (const file of files) {
        if (file.includes(targetName) && file !== targetName) {
          suggestions.push(file);
        }
      }
    } catch (error) {
      // Ignore errors
    }

    return suggestions.slice(0, 5);
  }

  /**
   * Calculate string similarity (Levenshtein distance)
   */
  private calculateSimilarity(str1: string, str2: string): number {
    const len1 = str1.length;
    const len2 = str2.length;
    const matrix: number[][] = [];

    for (let i = 0; i <= len1; i++) {
      matrix[i] = [i];
    }
    for (let j = 0; j <= len2; j++) {
      matrix[0][j] = j;
    }

    for (let i = 1; i <= len1; i++) {
      for (let j = 1; j <= len2; j++) {
        if (str1.charAt(i - 1) === str2.charAt(j - 1)) {
          matrix[i][j] = matrix[i - 1][j - 1];
        } else {
          matrix[i][j] = Math.min(
            matrix[i - 1][j - 1] + 1,
            matrix[i][j - 1] + 1,
            matrix[i - 1][j] + 1
          );
        }
      }
    }

    const maxLen = Math.max(len1, len2);
    return 1 - matrix[len1][len2] / maxLen;
  }

  /**
   * Clear cache
   */
  clearCache(): void {
    this.symbolCache.clear();
    this.analyzer.clearCache();
    this.importTracker.clearCache();
  }
}
