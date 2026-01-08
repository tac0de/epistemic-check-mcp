/**
 * Exports/Imports Map Resource - Expose exports and imports as MCP resources
 */

import { glob } from "fast-glob";
import { ImportTracker } from "../analyzers/index.js";
import { ImportInfo, ExportInfo, ServerConfig } from "../types/index.js";

export class ExportsMapResource {
  private importTracker: ImportTracker;
  private workspacePath: string;
  private exportsCache: Map<string, ExportInfo[]> = new Map();
  private importsCache: Map<string, ImportInfo[]> = new Map();
  private cacheTime: number = 0;
  private cacheTTL: number = 60000; // 60 seconds

  constructor(config: ServerConfig) {
    this.workspacePath = config.workspacePath;
    this.importTracker = new ImportTracker(this.workspacePath);
  }

  /**
   * Get exports from a file or all files
   */
  async getExports(options?: {
    filePath?: string;
    pattern?: string;
  }): Promise<Map<string, ExportInfo[]>> {
    const now = Date.now();

    // Clear cache if expired
    if (now - this.cacheTime > this.cacheTTL) {
      this.exportsCache.clear();
      this.importsCache.clear();
    }

    // Build cache if empty
    if (this.exportsCache.size === 0) {
      await this.buildCaches();
    }

    const result = new Map<string, ExportInfo[]>();

    if (options?.filePath) {
      // Return exports for a specific file
      const exports = this.exportsCache.get(options.filePath) || [];
      result.set(options.filePath, exports);
    } else if (options?.pattern) {
      // Filter exports by pattern
      for (const [filePath, exports] of this.exportsCache.entries()) {
        const filtered = exports.filter((exp) =>
          exp.name.toLowerCase().includes(options.pattern!.toLowerCase())
        );
        if (filtered.length > 0) {
          result.set(filePath, filtered);
        }
      }
    } else {
      // Return all exports
      return new Map(this.exportsCache);
    }

    return result;
  }

  /**
   * Get imports from a file or all files
   */
  async getImports(options?: {
    filePath?: string;
    includeExternal?: boolean;
  }): Promise<Map<string, ImportInfo[]>> {
    const now = Date.now();

    // Clear cache if expired
    if (now - this.cacheTime > this.cacheTTL) {
      this.exportsCache.clear();
      this.importsCache.clear();
    }

    // Build cache if empty
    if (this.importsCache.size === 0) {
      await this.buildCaches();
    }

    const result = new Map<string, ImportInfo[]>();

    if (options?.filePath) {
      // Return imports for a specific file
      const imports = this.importsCache.get(options.filePath) || [];
      result.set(options.filePath, options.includeExternal !== false ? imports : imports.filter(imp => this.isInternalImport(imp.path)));
    } else {
      // Return all imports
      for (const [filePath, imports] of this.importsCache.entries()) {
        const filtered = options?.includeExternal === false
          ? imports.filter(imp => this.isInternalImport(imp.path))
          : imports;
        result.set(filePath, filtered);
      }
    }

    return result;
  }

  /**
   * Get all exports indexed by name
   */
  async getExportsByName(): Promise<Map<string, Array<{ filePath: string; export: ExportInfo }>>> {
    const now = Date.now();

    // Clear cache if expired
    if (now - this.cacheTime > this.cacheTTL) {
      this.exportsCache.clear();
      this.importsCache.clear();
    }

    // Build cache if empty
    if (this.exportsCache.size === 0) {
      await this.buildCaches();
    }

    const byName = new Map<string, Array<{ filePath: string; export: ExportInfo }>>();

    for (const [filePath, exports] of this.exportsCache.entries()) {
      for (const exp of exports) {
        if (!byName.has(exp.name)) {
          byName.set(exp.name, []);
        }
        byName.get(exp.name)!.push({ filePath, export: exp });
      }
    }

    return byName;
  }

  /**
   * Get dependency graph
   */
  async getDependencyGraph(): Promise<Map<string, Set<string>>> {
    const files = await this.getSourceFiles();
    return this.importTracker.buildDependencyGraph(files);
  }

  /**
   * Find files that import a specific file
   */
  async findImporters(filePath: string): Promise<string[]> {
    const files = await this.getSourceFiles();
    return this.importTracker.findImporters(filePath, files);
  }

  /**
   * Find which file exports a specific symbol
   */
  async findExportingFile(symbolName: string): Promise<string | null> {
    const files = await this.getSourceFiles();
    return this.importTracker.findExportingFile(symbolName, files);
  }

  /**
   * Build caches for exports and imports
   */
  private async buildCaches(): Promise<void> {
    const files = await this.getSourceFiles();

    for (const filePath of files) {
      try {
        const exports = this.importTracker.extractExports(filePath);
        if (exports.length > 0) {
          this.exportsCache.set(filePath, exports);
        }

        const imports = this.importTracker.extractImports(filePath);
        if (imports.length > 0) {
          this.importsCache.set(filePath, imports);
        }
      } catch (error) {
        // Skip files that can't be parsed
        continue;
      }
    }

    this.cacheTime = Date.now();
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
   * Check if an import is internal (from the same project)
   */
  private isInternalImport(importPath: string): boolean {
    return importPath.startsWith(".") || importPath.startsWith("/");
  }

  /**
   * Clear the cache
   */
  clearCache(): void {
    this.exportsCache.clear();
    this.importsCache.clear();
    this.importTracker.clearCache();
  }
}
