/**
 * Consistency Check Tools - Detect logical contradictions and type inconsistencies
 */

import { z } from "zod";
import {
  DetectContradictionsSchema,
  CheckLogicalConsistencySchema,
  ValidateTypeConsistencySchema,
} from "../types/schemas.js";
import { ToolResponse, HallucinationIssue, ServerConfig } from "../types/index.js";

export class ConsistencyCheckTools {
  private workspacePath: string;

  constructor(config: ServerConfig) {
    this.workspacePath = config.workspacePath;
  }

  /**
   * Detect contradictions in statements
   */
  async detectContradictions(input: {
    statements: string[];
    context?: string;
  }): Promise<ToolResponse> {
    try {
      const validated = DetectContradictionsSchema.parse(input);
      const { statements, context } = validated;

      const contradictions: Array<{
        statement1: string;
        statement2: string;
        reason: string;
        confidence: number;
      }> = [];

      // Check for direct contradictions
      for (let i = 0; i < statements.length; i++) {
        for (let j = i + 1; j < statements.length; j++) {
          const contradiction = this.checkForContradiction(statements[i], statements[j]);
          if (contradiction) {
            contradictions.push({
              statement1: statements[i],
              statement2: statements[j],
              reason: contradiction,
              confidence: 0.7,
            });
          }
        }
      }

      // Check for code-specific contradictions
      const codeContradictions = this.checkCodeContradictions(statements);
      contradictions.push(...codeContradictions);

      return {
        content: [
          {
            type: "text",
            text: JSON.stringify(
              {
                contradictions,
                count: contradictions.length,
                consistent: contradictions.length === 0,
                confidence: contradictions.length === 0 ? 1 : 0.8,
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
              error: "Failed to detect contradictions",
              details: error instanceof Error ? error.message : String(error),
            }),
          },
        ],
        isError: true,
      };
    }
  }

  /**
   * Check logical consistency across code blocks
   */
  async checkLogicalConsistency(input: {
    codeBlocks: string[];
    assertions?: string[];
  }): Promise<ToolResponse> {
    try {
      const validated = CheckLogicalConsistencySchema.parse(input);
      const { codeBlocks, assertions } = validated;

      const inconsistencies: Array<{
        location: string;
        issue: string;
        severity: "error" | "warning" | "info";
        confidence: number;
      }> = [];

      // Check each code block
      for (let i = 0; i < codeBlocks.length; i++) {
        const block = codeBlocks[i];

        // Check for variable redeclaration
        const variableDeclarations = this.extractVariableDeclarations(block);
        const duplicates = this.findDuplicates(variableDeclarations);
        if (duplicates.length > 0) {
          inconsistencies.push({
            location: `Block ${i + 1}`,
            issue: `Duplicate variable declarations: ${duplicates.join(", ")}`,
            severity: "warning",
            confidence: 0.9,
          });
        }

        // Check for type inconsistencies
        const typeInconsistencies = this.checkTypeInconsistencies(block);
        inconsistencies.push(...typeInconsistencies.map((issue) => ({
          location: `Block ${i + 1}`,
          issue,
          severity: "warning" as const,
          confidence: 0.7,
        })));
      }

      // Check consistency between blocks
      for (let i = 0; i < codeBlocks.length; i++) {
        for (let j = i + 1; j < codeBlocks.length; j++) {
          const crossBlockIssues = this.checkCrossBlockConsistency(
            codeBlocks[i],
            codeBlocks[j],
            i,
            j
          );
          inconsistencies.push(...crossBlockIssues);
        }
      }

      // Check against assertions
      if (assertions && assertions.length > 0) {
        const assertionViolations = this.checkAssertions(codeBlocks, assertions);
        inconsistencies.push(...assertionViolations);
      }

      return {
        content: [
          {
            type: "text",
            text: JSON.stringify(
              {
                consistent: inconsistencies.length === 0,
                inconsistencies,
                count: inconsistencies.length,
                summary: inconsistencies.length === 0
                  ? "No inconsistencies detected"
                  : `Found ${inconsistencies.length} potential inconsistency(ies)`,
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
              error: "Failed to check logical consistency",
              details: error instanceof Error ? error.message : String(error),
            }),
          },
        ],
        isError: true,
      };
    }
  }

  /**
   * Validate type consistency in code
   */
  async validateTypeConsistency(input: {
    code: string;
    filePath?: string;
    language: string;
  }): Promise<ToolResponse> {
    try {
      const validated = ValidateTypeConsistencySchema.parse(input);
      const { code, filePath, language } = validated;

      const typeErrors: Array<{
        location: string;
        error: string;
        confidence: number;
      }> = [];

      // Extract type annotations and check for consistency
      const typeAnnotations = this.extractTypeAnnotations(code);

      // Check for mismatched type usages
      for (const annotation of typeAnnotations) {
        const usages = this.findTypeUsages(code, annotation.variable);

        for (const usage of usages) {
          if (this.isTypeMismatch(annotation.type, usage.type)) {
            typeErrors.push({
              location: usage.location,
              error: `Type mismatch: '${annotation.variable}' is declared as '${annotation.type}' but used as '${usage.type}'`,
              confidence: 0.8,
            });
          }
        }
      }

      return {
        content: [
          {
            type: "text",
            text: JSON.stringify(
              {
                consistent: typeErrors.length === 0,
                typeErrors,
                count: typeErrors.length,
                language,
                filePath,
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
              error: "Failed to validate type consistency",
              details: error instanceof Error ? error.message : String(error),
            }),
          },
        ],
        isError: true,
      };
    }
  }

  /**
   * Check for contradiction between two statements
   */
  private checkForContradiction(statement1: string, statement2: string): string | null {
    const s1 = statement1.toLowerCase().trim();
    const s2 = statement2.toLowerCase().trim();

    // Direct negation patterns
    const negationPatterns = [
      ["is", "is not"],
      ["are", "are not"],
      ["will", "will not"],
      ["can", "cannot"],
      ["exists", "does not exist"],
      ["true", "false"],
      ["enabled", "disabled"],
      ["active", "inactive"],
    ];

    for (const [positive, negative] of negationPatterns) {
      if (s1.includes(positive) && s2.includes(negative) && this.hasCommonSubject(s1, s2)) {
        return `Potential contradiction: '${positive}' vs '${negative}'`;
      }
      if (s2.includes(positive) && s1.includes(negative) && this.hasCommonSubject(s1, s2)) {
        return `Potential contradiction: '${negative}' vs '${positive}'`;
      }
    }

    // Code-specific contradictions
    if (s1.includes("import") && s2.includes("does not exist")) {
      return `Importing something that doesn't exist`;
    }
    if (s2.includes("import") && s1.includes("does not exist")) {
      return `Importing something that doesn't exist`;
    }

    return null;
  }

  /**
   * Check if two statements have a common subject
   */
  private hasCommonSubject(s1: string, s2: string): boolean {
    const words1 = s1.split(/\s+/);
    const words2 = s2.split(/\s+/);

    // Look for common nouns/function names
    for (const word1 of words1) {
      if (word1.length > 3 && words2.includes(word1)) {
        return true;
      }
    }
    return false;
  }

  /**
   * Check for code-specific contradictions
   */
  private checkCodeContradictions(statements: string[]): Array<{
    statement1: string;
    statement2: string;
    reason: string;
    confidence: number;
  }> {
    const contradictions: Array<{
      statement1: string;
      statement2: string;
      reason: string;
      confidence: number;
    }> = [];

    // Extract function calls and imports
    const functionCalls: string[] = [];
    const imports: string[] = [];

    for (const statement of statements) {
      const calls = this.extractFunctionCalls(statement);
      functionCalls.push(...calls);

      const imps = this.extractImports(statement);
      imports.push(...imps);
    }

    // Check if functions are called but not imported
    for (const call of functionCalls) {
      const isImported = imports.some((imp) => imp.includes(call));
      if (!isImported && !this.isBuiltinFunction(call)) {
        const importStatement = statements.find((s) => s.includes("import"));
        if (importStatement) {
          contradictions.push({
            statement1: `Function ${call} is called`,
            statement2: `Function ${call} is not imported`,
            reason: "Function called without being imported",
            confidence: 0.6,
          });
        }
      }
    }

    return contradictions;
  }

  /**
   * Extract variable declarations from code
   */
  private extractVariableDeclarations(code: string): string[] {
    const declarations: string[] = [];

    const patterns = [
      /(?:const|let|var)\s+(\w+)/g,
      /(\w+)\s*:\s*\w+/g, // TypeScript type annotations
    ];

    for (const pattern of patterns) {
      let match;
      while ((match = pattern.exec(code)) !== null) {
        declarations.push(match[1]);
      }
    }

    return declarations;
  }

  /**
   * Find duplicate values in an array
   */
  private findDuplicates(arr: string[]): string[] {
    const seen = new Set<string>();
    const duplicates: string[] = [];

    for (const item of arr) {
      if (seen.has(item)) {
        if (!duplicates.includes(item)) {
          duplicates.push(item);
        }
      } else {
        seen.add(item);
      }
    }

    return duplicates;
  }

  /**
   * Check for type inconsistencies in a code block
   */
  private checkTypeInconsistencies(code: string): string[] {
    const issues: string[] = [];

    // Check for reassignment with different types
    const reassignments = code.match(/(\w+)\s*=\s*[^;]+;/g);
    if (reassignments) {
      const assignments = new Map<string, string[]>();

      for (const reassignment of reassignments) {
        const match = reassignment.match(/(\w+)\s*=/);
        if (match) {
          const variable = match[1];
          if (!assignments.has(variable)) {
            assignments.set(variable, []);
          }
          assignments.get(variable)!.push(reassignment);
        }
      }

      for (const [variable, assigns] of assignments.entries()) {
        if (assigns.length > 1) {
          issues.push(`Variable '${variable}' is reassigned multiple times`);
        }
      }
    }

    return issues;
  }

  /**
   * Check consistency between two code blocks
   */
  private checkCrossBlockConsistency(
    block1: string,
    block2: string,
    index1: number,
    index2: number
  ): Array<{
    location: string;
    issue: string;
    severity: "error" | "warning" | "info";
    confidence: number;
  }> {
    const issues: Array<{
      location: string;
      issue: string;
      severity: "error" | "warning" | "info";
      confidence: number;
    }> = [];

    const vars1 = this.extractVariableDeclarations(block1);
    const vars2 = this.extractVariableDeclarations(block2);

    // Check for shadowing
    for (const v of vars2) {
      if (vars1.includes(v)) {
        issues.push({
          location: `Blocks ${index1 + 1} and ${index2 + 1}`,
          issue: `Variable '${v}' is declared in both blocks (potential shadowing)`,
          severity: "warning",
          confidence: 0.7,
        });
      }
    }

    return issues;
  }

  /**
   * Check if code blocks satisfy assertions
   */
  private checkAssertions(
    codeBlocks: string[],
    assertions: string[]
  ): Array<{
    location: string;
    issue: string;
    severity: "error" | "warning" | "info";
    confidence: number;
  }> {
    const issues: Array<{
      location: string;
      issue: string;
      severity: "error" | "warning" | "info";
      confidence: number;
    }> = [];

    for (const assertion of assertions) {
      const lowerAssertion = assertion.toLowerCase();

      // Check for "no X" assertions
      const noMatch = lowerAssertion.match(/no\s+(\w+)/);
      if (noMatch) {
        const prohibited = noMatch[1];
        for (let i = 0; i < codeBlocks.length; i++) {
          if (codeBlocks[i].toLowerCase().includes(prohibited)) {
            issues.push({
              location: `Block ${i + 1}`,
              issue: `Assertion violated: found '${prohibited}' which should not be present`,
              severity: "error",
              confidence: 0.8,
            });
          }
        }
      }
    }

    return issues;
  }

  /**
   * Extract type annotations from code
   */
  private extractTypeAnnotations(code: string): Array<{
    variable: string;
    type: string;
  }> {
    const annotations: Array<{ variable: string; type: string }> = [];

    const pattern = /(\w+)\s*:\s*(\w+)/g;
    let match;

    while ((match = pattern.exec(code)) !== null) {
      annotations.push({
        variable: match[1],
        type: match[2],
      });
    }

    return annotations;
  }

  /**
   * Find type usages for a variable
   */
  private findTypeUsages(code: string, variable: string): Array<{
    location: string;
    type: string;
  }> {
    const usages: Array<{ location: string; type: string }> = [];

    // This is a simplified implementation
    // A real implementation would use AST analysis

    return usages;
  }

  /**
   * Check if two types are compatible
   */
  private isTypeMismatch(type1: string, type2: string): boolean {
    // Basic type compatibility check
    const compatibleTypes: Record<string, string[]> = {
      string: ["String"],
      number: ["Number", "Int", "Float"],
      boolean: ["Boolean", "Bool"],
      object: ["Object", "any"],
    };

    if (type1 === type2) return false;
    if (compatibleTypes[type1]?.includes(type2)) return false;
    if (compatibleTypes[type2]?.includes(type1)) return false;

    return true;
  }

  /**
   * Extract function calls from a statement
   */
  private extractFunctionCalls(statement: string): string[] {
    const calls: string[] = [];
    const pattern = /(\w+)\s*\(/g;

    let match;
    while ((match = pattern.exec(statement)) !== null) {
      calls.push(match[1]);
    }

    return calls;
  }

  /**
   * Extract imports from a statement
   */
  private extractImports(statement: string): string[] {
    const imports: string[] = [];

    const patterns = [
      /import\s+.*?from\s+['"]([^'"]+)['"]/g,
      /require\(['"]([^'"]+)['"]\)/g,
    ];

    for (const pattern of patterns) {
      let match;
      while ((match = pattern.exec(statement)) !== null) {
        imports.push(match[1]);
      }
    }

    return imports;
  }

  /**
   * Check if a function is a built-in
   */
  private isBuiltinFunction(name: string): boolean {
    const builtins = [
      "console",
      "log",
      "error",
      "warn",
      "info",
      "debug",
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
    ];

    return builtins.includes(name);
  }
}
