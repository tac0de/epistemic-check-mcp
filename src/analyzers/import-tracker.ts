/**
 * Import Tracker - Track and resolve imports/exports in a codebase
 */

// @ts-nocheck - Babel traverse types are complex and cause issues with strict TypeScript

import * as t from "@babel/types";
import { resolve, dirname, join, relative } from "path";
import { existsSync } from "fs";
import { ASTAnalyzer } from "./ast-analyzer.js";
import { ImportInfo, ExportInfo, AnalysisError } from "../types/index.js";

export interface ImportResolutionResult {
  resolvedPath: string | null;
  exists: boolean;
  alternatives?: string[];
  error?: string;
}

export class ImportTracker {
  private analyzer: ASTAnalyzer;
  private exportsCache: Map<string, ExportInfo[]> = new Map();
  private importsCache: Map<string, ImportInfo[]> = new Map();
  private workspaceRoot: string;

  constructor(workspaceRoot: string) {
    this.analyzer = new ASTAnalyzer();
    this.workspaceRoot = workspaceRoot;
  }

  /**
   * Extract all imports from a file
   */
  extractImports(filePath: string): ImportInfo[] {
    // Check cache first
    if (this.importsCache.has(filePath)) {
      return this.importsCache.get(filePath)!;
    }

    try {
      const ast = this.analyzer.parseFile(filePath);
      const imports: ImportInfo[] = [];

      this.analyzer["traverse"](ast, {
        // ES6 imports
        ImportDeclaration(path) {
          const source = path.node.source.value;
          const specifiers = path.node.specifiers.map((spec) => {
            if (t.isImportDefaultSpecifier(spec)) {
              return spec.local.name;
            } else if (t.isImportNamespaceSpecifier(spec)) {
              return `* as ${spec.local.name}`;
            } else if (t.isImportSpecifier(spec)) {
              return spec.imported.name === spec.local.name
                ? spec.imported.name
                : `${spec.imported.name} as ${spec.local.name}`;
            }
            return "";
          }).filter(Boolean);

          imports.push({
            path: source,
            source,
            specifiers,
            isTypeOnly: path.node.importKind === "type",
            line: path.node.loc?.start.line,
          });
        },

        // Dynamic imports
        CallExpression(path) {
          if (
            t.isIdentifier(path.node.callee, { name: "import" }) &&
            path.node.arguments.length > 0
          ) {
            const firstArg = path.node.arguments[0];
            if (t.isStringLiteral(firstArg)) {
              imports.push({
                path: firstArg.value,
                source: firstArg.value,
                specifiers: ["dynamic"],
                isTypeOnly: false,
                line: path.node.loc?.start.line,
              });
            }
          }
        },

        // require() calls
        CallExpression(path) {
          if (
            t.isIdentifier(path.node.callee, { name: "require" }) &&
            path.node.arguments.length > 0
          ) {
            const firstArg = path.node.arguments[0];
            if (t.isStringLiteral(firstArg)) {
              imports.push({
                path: firstArg.value,
                source: firstArg.value,
                specifiers: ["require"],
                isTypeOnly: false,
                line: path.node.loc?.start.line,
              });
            }
          }
        },
      });

      this.importsCache.set(filePath, imports);
      return imports;
    } catch (error) {
      if (error instanceof AnalysisError) {
        throw error;
      }
      throw new AnalysisError(
        `Failed to extract imports: ${error instanceof Error ? error.message : String(error)}`,
        filePath
      );
    }
  }

  /**
   * Extract all exports from a file
   */
  extractExports(filePath: string): ExportInfo[] {
    // Check cache first
    if (this.exportsCache.has(filePath)) {
      return this.exportsCache.get(filePath)!;
    }

    try {
      const ast = this.analyzer.parseFile(filePath);
      const exports: ExportInfo[] = [];

      this.analyzer["traverse"](ast, {
        // Export named declarations
        ExportNamedDeclaration(path) {
          if (path.node.declaration) {
            if (t.isFunctionDeclaration(path.node.declaration) && path.node.declaration.id) {
              exports.push({
                name: path.node.declaration.id.name,
                type: "function",
                filePath,
                line: path.node.declaration.loc?.start.line,
                signature: this.analyzer["generateFunctionSignature"](path.node.declaration),
              });
            } else if (t.isClassDeclaration(path.node.declaration) && path.node.declaration.id) {
              exports.push({
                name: path.node.declaration.id.name,
                type: "class",
                filePath,
                line: path.node.declaration.loc?.start.line,
              });
            } else if (t.isVariableDeclaration(path.node.declaration)) {
              path.node.declaration.declarations.forEach((declaration) => {
                if (t.isIdentifier(declaration.id)) {
                  exports.push({
                    name: declaration.id.name,
                    type: "variable",
                    filePath,
                    line: declaration.loc?.start.line,
                  });
                }
              });
            } else if (t.isTSTypeAliasDeclaration(path.node.declaration)) {
              exports.push({
                name: path.node.declaration.id.name,
                type: "type",
                filePath,
                line: path.node.declaration.loc?.start.line,
              });
            } else if (t.isTSInterfaceDeclaration(path.node.declaration)) {
              exports.push({
                name: path.node.declaration.id.name,
                type: "interface",
                filePath,
                line: path.node.declaration.loc?.start.line,
              });
            }
          }

          // Handle export { symbol } from 'module' or export { symbol }
          path.node.specifiers.forEach((specifier) => {
            if (t.isExportSpecifier(specifier)) {
              exports.push({
                name: specifier.exported.name,
                type: "variable", // Default to variable, could be refined
                filePath,
                line: specifier.loc?.start.line,
              });
            }
          });
        },

        // Export default declarations
        ExportDefaultDeclaration(path) {
          if (t.isFunctionDeclaration(path.node.declaration) && path.node.declaration.id) {
            exports.push({
              name: "default",
              type: "function",
              filePath,
              line: path.node.declaration.loc?.start.line,
              signature: this.analyzer["generateFunctionSignature"](path.node.declaration),
            });
          } else if (t.isClassDeclaration(path.node.declaration) && path.node.declaration.id) {
            exports.push({
              name: "default",
              type: "class",
              filePath,
              line: path.node.declaration.loc?.start.line,
            });
          } else if (t.isIdentifier(path.node.declaration)) {
            exports.push({
              name: "default",
              type: "variable",
              filePath,
              line: path.node.loc?.start.line,
            });
          }
        },

        // Export all declarations
        ExportAllDeclaration(path) {
          // Re-export all exports from another module
          const source = path.node.source.value;
          exports.push({
            name: "*",
            type: "variable",
            filePath: source,
            line: path.node.loc?.start.line,
          });
        },
      });

      this.exportsCache.set(filePath, exports);
      return exports;
    } catch (error) {
      if (error instanceof AnalysisError) {
        throw error;
      }
      throw new AnalysisError(
        `Failed to extract exports: ${error instanceof Error ? error.message : String(error)}`,
        filePath
      );
    }
  }

  /**
   * Resolve an import path to an actual file path
   */
  resolveImportPath(importPath: string, fromFile: string): ImportResolutionResult {
    // Node.js built-in modules
    const builtInModules = [
      "fs", "path", "http", "https", "url", "querystring", "util", "events",
      "stream", "buffer", "crypto", "os", "cluster", "child_process", "net",
      "dgram", "dns", "tls", "zlib", "readline", "vm", "process", "assert",
      "timers", "async_hooks", "worker_threads", "console"
    ];

    if (builtInModules.includes(importPath) || importPath.startsWith("node:")) {
      return {
        resolvedPath: importPath,
        exists: true,
      };
    }

    // External packages (doesn't start with . or /)
    if (!importPath.startsWith(".") && !importPath.startsWith("/")) {
      return {
        resolvedPath: importPath,
        exists: true, // We can't verify external packages
      };
    }

    const fromDir = dirname(fromFile);
    let resolvedPath = resolve(fromDir, importPath);

    // Try different extensions
    const extensions = [".ts", ".tsx", ".js", ".jsx", ".mts", ".mjs", ".cjs", ""];
    let foundPath: string | null = null;

    for (const ext of extensions) {
      const pathWithExt = resolvedPath + ext;
      if (existsSync(pathWithExt)) {
        foundPath = pathWithExt;
        break;
      }
    }

    // Try index files
    if (!foundPath) {
      for (const ext of extensions) {
        const indexPath = join(resolvedPath, `index${ext}`);
        if (existsSync(indexPath)) {
          foundPath = indexPath;
          break;
        }
      }
    }

    // Try package.json exports
    if (!foundPath) {
      const packageJsonPath = join(resolvedPath, "package.json");
      if (existsSync(packageJsonPath)) {
        // Could parse package.json and check exports
        // For simplicity, just mark as existing
        foundPath = resolvedPath;
      }
    }

    if (foundPath) {
      return {
        resolvedPath: foundPath,
        exists: true,
      };
    }

    // File not found, try to find alternatives
    const alternatives = this.findAlternativePaths(resolvedPath, fromDir);

    return {
      resolvedPath: null,
      exists: false,
      alternatives,
      error: `Import path '${importPath}' could not be resolved from ${fromFile}`,
    };
  }

  /**
   * Find alternative file paths for a non-existent import
   */
  private findAlternativePaths(targetPath: string, searchDir: string): string[] {
    const alternatives: string[] = [];
    const targetName = targetPath.split("/").pop() || "";
    const parentDir = targetPath.substring(0, targetPath.lastIndexOf("/")) || searchDir;

    // Find files with similar names
    // This is a simplified implementation
    // A real implementation would use the file system

    return alternatives;
  }

  /**
   * Build a dependency graph for the codebase
   */
  buildDependencyGraph(filePaths: string[]): Map<string, Set<string>> {
    const graph = new Map<string, Set<string>>();

    for (const filePath of filePaths) {
      const imports = this.extractImports(filePath);
      const dependencies = new Set<string>();

      for (const imp of imports) {
        // Skip external packages
        if (!imp.path.startsWith(".") && !imp.path.startsWith("/")) {
          continue;
        }

        const resolved = this.resolveImportPath(imp.path, filePath);
        if (resolved.exists && resolved.resolvedPath) {
          dependencies.add(resolved.resolvedPath);
        }
      }

      graph.set(filePath, dependencies);
    }

    return graph;
  }

  /**
   * Find files that import a specific file
   */
  findImporters(filePath: string, allFiles: string[]): string[] {
    const importers: string[] = [];
    const relativePath = relative(this.workspaceRoot, filePath);

    for (const file of allFiles) {
      const imports = this.extractImports(file);

      for (const imp of imports) {
        const resolved = this.resolveImportPath(imp.path, file);
        if (resolved.resolvedPath === filePath) {
          importers.push(file);
          break;
        }
      }
    }

    return importers;
  }

  /**
   * Check if a specific export exists in a file
   */
  exportExists(filePath: string, exportName: string): boolean {
    const exports = this.extractExports(filePath);
    return exports.some((exp) => exp.name === exportName);
  }

  /**
   * Find which file exports a specific symbol
   */
  findExportingFile(symbolName: string, searchPaths: string[]): string | null {
    for (const path of searchPaths) {
      const exports = this.extractExports(path);
      if (exports.some((exp) => exp.name === symbolName)) {
        return path;
      }
    }
    return null;
  }

  /**
   * Clear caches
   */
  clearCache(): void {
    this.exportsCache.clear();
    this.importsCache.clear();
    this.analyzer.clearCache();
  }

  /**
   * Get all exports in the codebase
   */
  getAllExports(filePaths: string[]): Map<string, ExportInfo[]> {
    const allExports = new Map<string, ExportInfo[]>();

    for (const filePath of filePaths) {
      try {
        const exports = this.extractExports(filePath);
        if (exports.length > 0) {
          allExports.set(filePath, exports);
        }
      } catch (error) {
        // Skip files that can't be parsed
        continue;
      }
    }

    return allExports;
  }

  /**
   * Get all imports in the codebase
   */
  getAllImports(filePaths: string[]): Map<string, ImportInfo[]> {
    const allImports = new Map<string, ImportInfo[]>();

    for (const filePath of filePaths) {
      try {
        const imports = this.extractImports(filePath);
        if (imports.length > 0) {
          allImports.set(filePath, imports);
        }
      } catch (error) {
        // Skip files that can't be parsed
        continue;
      }
    }

    return allImports;
  }
}
