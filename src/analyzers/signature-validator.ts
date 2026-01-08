/**
 * Signature Validator - Validate function/class signatures and API calls
 */

// @ts-nocheck - Babel traverse types are complex and cause issues with strict TypeScript

import * as t from "@babel/types";
import { ASTAnalyzer } from "./ast-analyzer.js";
import { FunctionSignature } from "../types/index.js";

export interface SignatureMatchResult {
  valid: boolean;
  expectedSignature?: string;
  actualSignature: string;
  error?: string;
  confidence: number;
}

export interface APIValidationResult {
  valid: boolean;
  errors: string[];
  warnings: string[];
  suggestions: string[];
}

export class SignatureValidator {
  private analyzer: ASTAnalyzer;
  private signatureCache: Map<string, FunctionSignature[]> = new Map();

  constructor() {
    this.analyzer = new ASTAnalyzer();
  }

  /**
   * Validate a function call against its signature
   */
  validateFunctionCall(
    functionName: string,
    args: string[],
    filePath?: string
  ): SignatureMatchResult {
    if (!filePath) {
      return {
        valid: false,
        actualSignature: `${functionName}(${args.join(", ")})`,
        error: "No file path provided for signature lookup",
        confidence: 0,
      };
    }

    try {
      const signatures = this.getSignatures(filePath);
      const matchingSignature = signatures.find((sig) => sig.name === functionName);

      if (!matchingSignature) {
        return {
          valid: false,
          actualSignature: `${functionName}(${args.join(", ")})`,
          error: `Function '${functionName}' not found in ${filePath}`,
          confidence: 0,
        };
      }

      const expectedArgs = matchingSignature.parameters;
      const actualArgsCount = args.length;
      const expectedMinArgs = expectedArgs.filter((p) => !p.optional).length;
      const expectedMaxArgs = expectedArgs.length;

      // Check argument count
      if (actualArgsCount < expectedMinArgs) {
        return {
          valid: false,
          expectedSignature: this.formatSignature(matchingSignature),
          actualSignature: `${functionName}(${args.join(", ")})`,
          error: `Expected at least ${expectedMinArgs} arguments, got ${actualArgsCount}`,
          confidence: 1,
        };
      }

      if (actualArgsCount > expectedMaxArgs) {
        return {
          valid: false,
          expectedSignature: this.formatSignature(matchingSignature),
          actualSignature: `${functionName}(${args.join(", ")})`,
          error: `Expected at most ${expectedMaxArgs} arguments, got ${actualArgsCount}`,
          confidence: 1,
        };
      }

      return {
        valid: true,
        expectedSignature: this.formatSignature(matchingSignature),
        actualSignature: `${functionName}(${args.join(", ")})`,
        confidence: 1,
      };
    } catch (error) {
      return {
        valid: false,
        actualSignature: `${functionName}(${args.join(", ")})`,
        error: `Failed to validate: ${error instanceof Error ? error.message : String(error)}`,
        confidence: 0,
      };
    }
  }

  /**
   * Validate API usage (e.g., library function calls)
   */
  validateAPIUsage(
    library: string,
    api: string,
    parameters: Record<string, unknown>
  ): APIValidationResult {
    const errors: string[] = [];
    const warnings: string[] = [];
    const suggestions: string[] = [];

    // Common API definitions
    const commonAPIs = this.getCommonAPIs();

    const libraryAPIs = commonAPIs.get(library);
    if (!libraryAPIs) {
      return {
        valid: true, // Can't validate unknown libraries
        errors: [],
        warnings: [`No API definitions available for library '${library}'`],
        suggestions: [],
      };
    }

    const apiDefinition = libraryAPIs.get(api);
    if (!apiDefinition) {
      return {
        valid: true, // API not in our definitions
        errors: [],
        warnings: [`No definition available for '${library}.${api}'`],
        suggestions: [],
      };
    }

    // Validate required parameters
    for (const [paramName, paramDef] of Object.entries(apiDefinition.parameters)) {
      if (paramDef.required && !(paramName in parameters)) {
        errors.push(`Missing required parameter '${paramName}' for ${library}.${api}`);
      }
    }

    // Check for unknown parameters
    for (const paramName of Object.keys(parameters)) {
      if (!apiDefinition.parameters[paramName]) {
        warnings.push(`Unknown parameter '${paramName}' for ${library}.${api}`);
      }
    }

    return {
      valid: errors.length === 0,
      errors,
      warnings,
      suggestions,
    };
  }

  /**
   * Validate a code snippet for signature mismatches
   */
  validateCodeSignatures(code: string, filePath?: string): SignatureMatchResult[] {
    const results: SignatureMatchResult[] = [];

    try {
      const ast = this.analyzer.parse(code, filePath || "inline");

      this.analyzer["traverse"](ast, {
        CallExpression(path) {
          let functionName: string | null = null;

          // Simple function calls: foo()
          if (t.isIdentifier(path.node.callee)) {
            functionName = path.node.callee.name;
          }
          // Member expressions: obj.method()
          else if (t.isMemberExpression(path.node.callee)) {
            if (t.isIdentifier(path.node.callee.property)) {
              functionName = path.node.callee.property.name;
            }
          }

          if (functionName) {
            const args = path.node.arguments.map(() => "unknown");
            const result = this.validateFunctionCall(functionName, args, filePath);
            if (!result.valid && result.confidence > 0) {
              results.push(result);
            }
          }
        },
      });
    } catch (error) {
      // Return empty results on parse error
    }

    return results;
  }

  /**
   * Get all function signatures from a file
   */
  private getSignatures(filePath: string): FunctionSignature[] {
    if (this.signatureCache.has(filePath)) {
      return this.signatureCache.get(filePath)!;
    }

    try {
      const ast = this.analyzer.parseFile(filePath);
      const signatures = this.analyzer.extractFunctionSignatures(ast, filePath);
      this.signatureCache.set(filePath, signatures);
      return signatures;
    } catch (error) {
      return [];
    }
  }

  /**
   * Format a function signature for display
   */
  private formatSignature(signature: FunctionSignature): string {
    const params = signature.parameters
      .map((p) => {
        const name = p.optional ? `${p.name}?` : p.name;
        return p.type ? `${name}: ${p.type}` : name;
      })
      .join(", ");

    let sig = signature.name;

    if (signature.isAsync) {
      sig = `async ${sig}`;
    }

    sig = `${sig}(${params})`;

    if (signature.returnType) {
      sig += `: ${signature.returnType}`;
    }

    return sig;
  }

  /**
   * Get common API definitions
   * This is a simplified database of common Node.js/browser APIs
   */
  private getCommonAPIs(): Map<
    string,
    Map<
      string,
      {
        parameters: Record<string, { required: boolean; type?: string }>;
      }
    >
  > {
    const apis = new Map();

    // fs (Node.js)
    const fs = new Map();
    fs.set("readFile", {
      parameters: {
        path: { required: true, type: "string | Buffer | URL" },
        options: { required: false, type: "Object" },
        callback: { required: true, type: "Function" },
      },
    });
    fs.set("writeFile", {
      parameters: {
        path: { required: true, type: "string | Buffer | URL" },
        data: { required: true, type: "string | Buffer" },
        options: { required: false, type: "Object" },
        callback: { required: true, type: "Function" },
      },
    });
    fs.set("readFileSync", {
      parameters: {
        path: { required: true, type: "string | Buffer | URL" },
        options: { required: false, type: "Object" },
      },
    });
    fs.set("writeFileSync", {
      parameters: {
        path: { required: true, type: "string | Buffer | URL" },
        data: { required: true, type: "string | Buffer" },
        options: { required: false, type: "Object" },
      },
    });
    apis.set("fs", fs);

    // path (Node.js)
    const path = new Map();
    path.set("join", {
      parameters: {
        paths: { required: true, type: "string[]" },
      },
    });
    path.set("resolve", {
      parameters: {
        paths: { required: true, type: "string[]" },
      },
    });
    path.set("dirname", {
      parameters: {
        path: { required: true, type: "string" },
      },
    });
    apis.set("path", path);

    // JSON
    const json = new Map();
    json.set("parse", {
      parameters: {
        text: { required: true, type: "string" },
        reviver: { required: false, type: "Function" },
      },
    });
    json.set("stringify", {
      parameters: {
        value: { required: true, type: "any" },
        replacer: { required: false, type: "Function | Array" },
        space: { required: false, type: "string | number" },
      },
    });
    apis.set("JSON", json);

    // fetch
    const fetch = new Map();
    fetch.set("fetch", {
      parameters: {
        url: { required: true, type: "string | Request" },
        options: { required: false, type: "RequestInit" },
      },
    });
    apis.set("fetch", fetch);

    return apis;
  }

  /**
   * Clear the cache
   */
  clearCache(): void {
    this.signatureCache.clear();
    this.analyzer.clearCache();
  }

  /**
   * Get all signatures in a file
   */
  getAllSignatures(filePath: string): FunctionSignature[] {
    return this.getSignatures(filePath);
  }

  /**
   * Find signature by name in a file
   */
  findSignature(filePath: string, name: string): FunctionSignature | undefined {
    const signatures = this.getSignatures(filePath);
    return signatures.find((sig) => sig.name === name);
  }
}
