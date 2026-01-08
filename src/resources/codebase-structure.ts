/**
 * Codebase Structure Resource - Expose codebase structure as an MCP resource
 */

import { readFileSync, readdirSync, statSync } from "fs";
import { join, relative, extname } from "path";
import glob from "fast-glob";
import { CodebaseStructure, ServerConfig } from "../types/index.js";

export class CodebaseStructureResource {
  private workspacePath: string;
  private cache: CodebaseStructure | null = null;
  private cacheTime: number = 0;
  private cacheTTL: number = 30000; // 30 seconds

  constructor(config: ServerConfig) {
    this.workspacePath = config.workspacePath;
  }

  /**
   * Get the codebase structure
   */
  async getCodebaseStructure(options?: {
    path?: string;
    includeStats?: boolean;
  }): Promise<CodebaseStructure> {
    const now = Date.now();

    // Return cached result if still valid
    if (this.cache && now - this.cacheTime < this.cacheTTL) {
      return this.cache;
    }

    const basePath = options?.path
      ? join(this.workspacePath, options.path)
      : this.workspacePath;

    // Get all files
    const files = await glob("**/*", {
      cwd: basePath,
      absolute: false,
      onlyFiles: true,
      ignore: [
        "**/node_modules/**",
        "**/dist/**",
        "**/build/**",
        "**/.git/**",
        "**/coverage/**",
      ],
    });

    const fileData = files.map((file) => {
      const fullPath = join(basePath, file);
      const stats = statSync(fullPath);

      return {
        path: file,
        type: this.getFileType(file),
        size: stats.size,
        lastModified: stats.mtimeMs,
      };
    });

    // Get directories
    const directories = await glob("**/*", {
      cwd: basePath,
      absolute: false,
      onlyDirectories: true,
      ignore: [
        "**/node_modules/**",
        "**/dist/**",
        "**/build/**",
        "**/.git/**",
      ],
      deep: 3,
    });

    // Calculate statistics
    const languageBreakdown = this.calculateLanguageBreakdown(files);
    const totalLines = this.countTotalLines(files, basePath);

    const structure: CodebaseStructure = {
      rootPath: this.workspacePath,
      files: fileData,
      directories: directories.sort(),
      statistics: {
        totalFiles: files.length,
        totalLines,
        languageBreakdown,
      },
    };

    // Update cache
    this.cache = structure;
    this.cacheTime = now;

    return structure;
  }

  /**
   * Get symbol information
   */
  async getSymbolInfo(symbol: string): Promise<{
    definition: {
      filePath: string;
      line: number;
      column: number;
    } | null;
    references: Array<{
      filePath: string;
      line: number;
      column: number;
      context: string;
    }>;
  }> {
    // This would use the AST analyzer to find symbol definitions and references
    // For now, return a placeholder

    return {
      definition: null,
      references: [],
    };
  }

  /**
   * Get file type from extension
   */
  private getFileType(filePath: string): string {
    const ext = extname(filePath).toLowerCase();
    const typeMap: Record<string, string> = {
      ".ts": "typescript",
      ".tsx": "typescript-react",
      ".js": "javascript",
      ".jsx": "javascript-react",
      ".json": "json",
      ".md": "markdown",
      ".css": "css",
      ".scss": "scss",
      ".less": "less",
      ".html": "html",
      ".py": "python",
      ".go": "go",
      ".rs": "rust",
      ".java": "java",
      ".cpp": "cpp",
      ".c": "c",
      ".h": "c-header",
      ".yml": "yaml",
      ".yaml": "yaml",
      ".xml": "xml",
      ".sh": "shell",
      ".sql": "sql",
    };

    return typeMap[ext] || "unknown";
  }

  /**
   * Calculate language breakdown
   */
  private calculateLanguageBreakdown(files: string[]): Record<string, number> {
    const breakdown: Record<string, number> = {};

    for (const file of files) {
      const type = this.getFileType(file);
      breakdown[type] = (breakdown[type] || 0) + 1;
    }

    return breakdown;
  }

  /**
   * Count total lines of code
   */
  private countTotalLines(files: string[], basePath: string): number {
    let total = 0;

    for (const file of files) {
      try {
        const fullPath = join(basePath, file);
        const content = readFileSync(fullPath, "utf-8");
        total += content.split("\n").length;
      } catch (error) {
        // Skip files that can't be read
        continue;
      }
    }

    return total;
  }

  /**
   * Clear the cache
   */
  clearCache(): void {
    this.cache = null;
    this.cacheTime = 0;
  }
}
