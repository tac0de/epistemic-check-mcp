/**
 * AST Analyzer - Parse and analyze TypeScript/JavaScript code
 */

// @ts-nocheck - Babel traverse types are complex and cause issues with strict TypeScript
import * as parser from "@babel/parser";
import traverse from "@babel/traverse";
import * as t from "@babel/types";
import { readFileSync } from "fs";
import { AnalysisError, SymbolInfo, FunctionSignature } from "../types/index.js";
import type { NodePath } from "@babel/traverse";

export class ASTAnalyzer {
  private cache: Map<string, t.File> = new Map();

  /**
   * Parse code and return AST
   */
  parse(code: string, filePath: string): t.File {
    // Check cache first
    if (this.cache.has(filePath)) {
      return this.cache.get(filePath)!;
    }

    try {
      const ast = parser.parse(code, {
        sourceType: "module",
        plugins: ["typescript", "jsx"],
      });

      // Cache the AST
      this.cache.set(filePath, ast);
      return ast;
    } catch (error) {
      throw new AnalysisError(
        `Failed to parse file: ${error instanceof Error ? error.message : String(error)}`,
        filePath
      );
    }
  }

  /**
   * Parse file from disk
   */
  parseFile(filePath: string): t.File {
    try {
      const code = readFileSync(filePath, "utf-8");
      return this.parse(code, filePath);
    } catch (error) {
      if (error instanceof AnalysisError) {
        throw error;
      }
      throw new AnalysisError(
        `Failed to read file: ${error instanceof Error ? error.message : String(error)}`,
        filePath
      );
    }
  }

  /**
   * Extract all symbols (functions, classes, variables) from AST
   */
  extractSymbols(ast: t.File, filePath: string): SymbolInfo[] {
    const symbols: SymbolInfo[] = [];

    const visitors = {
      // Function declarations
      FunctionDeclaration(path: NodePath<t.FunctionDeclaration>) {
        if (path.node.id) {
          symbols.push({
            name: path.node.id.name,
            type: "function",
            filePath,
            line: path.node.loc?.start.line,
            column: path.node.loc?.start.column,
            signature: this.generateFunctionSignature(path.node),
            exported: false, // Will be updated by export checker
          });
        }
      },

      // Variable declarations
      VariableDeclaration(path: NodePath<t.VariableDeclaration>) {
        path.node.declarations.forEach((declaration) => {
          if (t.isIdentifier(declaration.id)) {
            symbols.push({
              name: declaration.id.name,
              type: "variable",
              filePath,
              line: declaration.loc?.start.line,
              column: declaration.loc?.start.column,
              exported: false,
            });
          }
        });
      },

      // Class declarations
      ClassDeclaration(path: NodePath<t.ClassDeclaration>) {
        if (path.node.id) {
          symbols.push({
            name: path.node.id.name,
            type: "class",
            filePath,
            line: path.node.loc?.start.line,
            column: path.node.loc?.start.column,
            exported: false,
          });
        }

        // Extract class methods
        path.node.body.body.forEach((member) => {
          if (
            t.isClassMethod(member) &&
            t.isIdentifier(member.key) &&
            !member.computed
          ) {
            symbols.push({
              name: member.key.name,
              type: "function",
              filePath,
              line: member.loc?.start.line,
              column: member.loc?.start.column,
              signature: this.generateMethodSignature(member),
              exported: false,
            });
          }
        });
      },

      // TypeScript type declarations
      TSInterfaceDeclaration(path: NodePath<t.TSInterfaceDeclaration>) {
        if (path.node.id) {
          symbols.push({
            name: path.node.id.name,
            type: "interface",
            filePath,
            line: path.node.loc?.start.line,
            column: path.node.loc?.start.column,
            exported: false,
          });
        }
      },

      TSTypeAliasDeclaration(path: NodePath<t.TSTypeAliasDeclaration>) {
        if (path.node.id) {
          symbols.push({
            name: path.node.id.name,
            type: "type",
            filePath,
            line: path.node.loc?.start.line,
            column: path.node.loc?.start.column,
            exported: false,
          });
        }
      },

      // Export named declarations
      ExportNamedDeclaration(path: NodePath<t.ExportNamedDeclaration>) {
        if (path.node.declaration) {
          if (t.isFunctionDeclaration(path.node.declaration) && path.node.declaration.id) {
            const symbol = symbols.find(s => s.name === path.node.declaration!.id!.name);
            if (symbol) symbol.exported = true;
          } else if (t.isClassDeclaration(path.node.declaration) && path.node.declaration.id) {
            const symbol = symbols.find(s => s.name === path.node.declaration!.id!.name);
            if (symbol) symbol.exported = true;
          } else if (t.isVariableDeclaration(path.node.declaration)) {
            path.node.declaration.declarations.forEach((declaration) => {
              if (t.isIdentifier(declaration.id)) {
                const symbol = symbols.find(s => s.name === declaration.id.name);
                if (symbol) symbol.exported = true;
              }
            });
          }
        }

        // Handle export { symbol } statements
        path.node.specifiers.forEach((specifier) => {
          if (t.isExportSpecifier(specifier)) {
            const symbol = symbols.find(s => s.name === specifier.local.name);
            if (symbol) symbol.exported = true;
          }
        });
      },

      // Export default declarations
      ExportDefaultDeclaration(path: NodePath<t.ExportDefaultDeclaration>) {
        if (t.isFunctionDeclaration(path.node.declaration) && path.node.declaration.id) {
          const symbol = symbols.find(s => s.name === path.node.declaration!.id!.name);
          if (symbol) symbol.exported = true;
        } else if (t.isClassDeclaration(path.node.declaration) && path.node.declaration.id) {
          const symbol = symbols.find(s => s.name === path.node.declaration!.id!.name);
          if (symbol) symbol.exported = true;
        }
      },
    };

    // @ts-ignore - traverse default type issue
    traverse.default(ast, visitors);

    return symbols;
  }

  /**
   * Extract function signatures from AST
   */
  extractFunctionSignatures(ast: t.File, filePath: string): FunctionSignature[] {
    const signatures: FunctionSignature[] = [];

    const visitors = {
      FunctionDeclaration(path: NodePath<t.FunctionDeclaration>) {
        if (path.node.id) {
          signatures.push({
            name: path.node.id.name,
            parameters: path.node.params.map((param) => ({
              name: t.isIdentifier(param) ? param.name : "unknown",
              type: this.extractTypeAnnotation(param),
              optional: t.isIdentifier(param) && param.optional ? true : false,
            })),
            returnType: this.extractReturnType(path.node),
            filePath,
            line: path.node.loc?.start.line,
            isAsync: path.node.async,
            isGenerator: path.node.generator,
          });
        }
      },

      ClassMethod(path: NodePath<t.ClassMethod>) {
        if (t.isIdentifier(path.node.key)) {
          signatures.push({
            name: path.node.key.name,
            parameters: path.node.params.map((param) => ({
              name: t.isIdentifier(param) ? param.name : "unknown",
              type: this.extractTypeAnnotation(param),
              optional: t.isIdentifier(param) && param.optional ? true : false,
            })),
            returnType: this.extractReturnType(path.node),
            filePath,
            line: path.node.loc?.start.line,
            isAsync: path.node.async,
            isGenerator: path.node.generator,
          });
        }
      },
    };

    // @ts-ignore - traverse default type issue
    traverse.default(ast, visitors);

    return signatures;
  }

  /**
   * Find all references to a symbol
   */
  findReferences(ast: t.File, symbolName: string): Array<{
    line: number;
    column: number;
    context: string;
  }> {
    const references: Array<{ line: number; column: number; context: string }> = [];

    const visitors = {
      Identifier(path: NodePath<t.Identifier>) {
        if (path.node.name === symbolName) {
          // Check if this is a reference (not a declaration)
          if (
            !t.isFunctionDeclaration(path.parent) &&
            !t.isClassDeclaration(path.parent) &&
            !t.isVariableDeclarator(path.parent)
          ) {
            references.push({
              line: path.node.loc?.start.line || 0,
              column: path.node.loc?.start.column || 0,
              context: `Line ${path.node.loc?.start.line || 0}`,
            });
          }
        }
      },
    };

    // @ts-ignore - traverse default type issue
    traverse.default(ast, visitors);

    return references;
  }

  /**
   * Generate a human-readable function signature
   */
  private generateFunctionSignature(node: t.FunctionDeclaration | t.FunctionExpression | t.ArrowFunctionExpression): string {
    const name = t.isIdentifier(node.id) ? node.id.name : "anonymous";
    const params = node.params
      .map((param) => {
        if (t.isIdentifier(param)) {
          return param.optional ? `${param.name}?` : param.name;
        }
        return "(...)";
      })
      .join(", ");

    let signature = `${name}(${params})`;

    if (node.async) {
      signature = `async ${signature}`;
    }

    if (node.generator && !t.isArrowFunctionExpression(node)) {
      signature = `function* ${signature}`;
    } else if (!t.isArrowFunctionExpression(node)) {
      signature = `function ${signature}`;
    }

    const returnType = this.extractReturnType(node);
    if (returnType) {
      signature += `: ${returnType}`;
    }

    return signature;
  }

  /**
   * Generate method signature
   */
  private generateMethodSignature(node: t.ClassMethod | t.ClassPrivateMethod): string {
    const name = t.isIdentifier(node.key) ? node.key.name : "anonymous";
    const params = node.params
      .map((param) => {
        if (t.isIdentifier(param)) {
          return param.optional ? `${param.name}?` : param.name;
        }
        return "(...)";
      })
      .join(", ");

    let signature = `${name}(${params})`;

    if (node.async) {
      signature = `async ${signature}`;
    }

    if (node.generator) {
      signature = `*${signature}`;
    }

    const returnType = this.extractReturnType(node);
    if (returnType) {
      signature += `: ${returnType}`;
    }

    return signature;
  }

  /**
   * Extract type annotation from a parameter
   */
  private extractTypeAnnotation(param: t.Pattern): string | undefined {
    if (
      t.isIdentifier(param) &&
      param.typeAnnotation &&
      t.isTSTypeAnnotation(param.typeAnnotation)
    ) {
      return this.tsTypeToString(param.typeAnnotation.typeAnnotation);
    }
    return undefined;
  }

  /**
   * Extract return type from function
   */
  private extractReturnType(
    node: t.Function | t.FunctionDeclaration | t.FunctionExpression | t.ArrowFunctionExpression | t.ClassMethod | t.ClassPrivateMethod
  ): string | undefined {
    if (
      node.returnType &&
      t.isTSTypeAnnotation(node.returnType)
    ) {
      return this.tsTypeToString(node.returnType.typeAnnotation);
    }
    return undefined;
  }

  /**
   * Convert TypeScript type to string
   */
  private tsTypeToString(type: t.TSType): string {
    if (t.isTSStringKeyword(type)) return "string";
    if (t.isTSNumberKeyword(type)) return "number";
    if (t.isTSBooleanKeyword(type)) return "boolean";
    if (t.isTSVoidKeyword(type)) return "void";
    if (t.isTSAnyKeyword(type)) return "any";
    if (t.isTSUnknownKeyword(type)) return "unknown";
    if (t.isTSTypeReference(type) && t.isIdentifier(type.typeName)) {
      return type.typeName.name;
    }
    if (t.isTSArrayType(type)) {
      return `${this.tsTypeToString(type.elementType)}[]`;
    }
    if (t.isTSUnionType(type)) {
      return type.types.map((t) => this.tsTypeToString(t)).join(" | ");
    }
    return "unknown";
  }

  /**
   * Clear the cache
   */
  clearCache(): void {
    this.cache.clear();
  }

  /**
   * Get cache size
   */
  getCacheSize(): number {
    return this.cache.size;
  }
}
