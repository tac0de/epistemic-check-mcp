/**
 * Core types for the stdio MCP server
 */

// Tool-related types
export interface ToolResponse {
  content: Array<{
    type: "text";
    text: string;
  }>;
  isError?: boolean;
}

export interface SymbolInfo {
  name: string;
  type: "function" | "class" | "variable" | "import" | "type" | "interface";
  filePath: string;
  line?: number;
  column?: number;
  signature?: string;
  exported: boolean;
}

export interface ImportInfo {
  path: string;
  source: string;
  specifiers: string[];
  isTypeOnly: boolean;
  line?: number;
}

export interface ExportInfo {
  name: string;
  type: "function" | "class" | "variable" | "type" | "interface";
  filePath: string;
  line?: number;
  signature?: string;
}

export interface FunctionSignature {
  name: string;
  parameters: Array<{
    name: string;
    type?: string;
    optional: boolean;
  }>;
  returnType?: string;
  filePath: string;
  line?: number;
  isAsync: boolean;
  isGenerator: boolean;
}

// Analysis result types
export interface HallucinationIssue {
  type: "missing-symbol" | "invalid-import" | "signature-mismatch" | "contradiction" | "type-error" | "api-mismatch";
  severity: "error" | "warning" | "info";
  message: string;
  location?: {
    filePath: string;
    line?: number;
    column?: number;
  };
  suggestion?: string;
  confidence: number;
}

export interface CodeReviewResult {
  issues: HallucinationIssue[];
  confidence: number;
  summary: string;
  corrected?: string;
}

export interface ValidationResult {
  valid: boolean;
  confidence: number;
  errors: string[];
  warnings: string[];
  suggestions: string[];
}

// Resource types
export interface CodebaseStructure {
  rootPath: string;
  files: Array<{
    path: string;
    type: string;
    size: number;
    lastModified: number;
  }>;
  directories: string[];
  statistics: {
    totalFiles: number;
    totalLines: number;
    languageBreakdown: Record<string, number>;
  };
}

export interface SymbolReference {
  symbol: string;
  definition: {
    filePath: string;
    line: number;
    column: number;
  };
  references: Array<{
    filePath: string;
    line: number;
    column: number;
    context: string;
  }>;
}

// Configuration types
export type StrictModeLevel = "off" | "warn" | "strict" | "paranoid";

export interface ServerConfig {
  workspacePath: string;
  include: string[];
  exclude: string[];
  logLevel: "debug" | "info" | "warn" | "error";
  maxCacheSize: number;
  strictMode?: StrictModeLevel;
  requireValidationFor?: string[]; // Tool names that require validation in strict mode
}

export interface ToolContext {
  workspacePath: string;
  config: ServerConfig;
}

// Error types
export class ServerError extends Error {
  constructor(
    message: string,
    public code: string,
    public details?: unknown
  ) {
    super(message);
    this.name = "ServerError";
  }
}

export class AnalysisError extends Error {
  constructor(
    message: string,
    public filePath?: string,
    public line?: number
  ) {
    super(message);
    this.name = "AnalysisError";
  }
}
