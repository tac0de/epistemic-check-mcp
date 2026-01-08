import { z } from "zod";

// ============================================================================
// Reusable Schema Fragments
// ============================================================================

const FilePathSchema = z.string().min(1).describe("Path to a file");
const SymbolNameSchema = z.string().min(1).describe("Name of a symbol");
const CodeSnippetSchema = z.string().describe("Code snippet");

const SymbolTypeEnum = z.enum([
  "function",
  "class",
  "variable",
  "import",
  "type",
  "interface",
]) as z.ZodEnum<["function", "class", "variable", "import", "type", "interface"]>;

const LanguageEnum = z.enum([
  "typescript",
  "javascript",
  "tsx",
  "jsx",
  "python",
  "go",
  "rust",
]) as z.ZodEnum<["typescript", "javascript", "tsx", "jsx", "python", "go", "rust"]>;

const SeverityEnum = z.enum(["error", "warning", "info"]) as z.ZodEnum<
  ["error", "warning", "info"]
>;

// ============================================================================
// Pre-Flight Validation Tool Schemas
// ============================================================================

// verify_symbol_exists
export const VerifySymbolExistsSchema = z.object({
  symbol: SymbolNameSchema,
  filePath: FilePathSchema.optional(),
  symbolType: SymbolTypeEnum.optional().default("function"),
});

// validate_import_path
export const ValidateImportPathSchema = z.object({
  importPath: z.string().min(1).describe("Import path to validate"),
  fromFile: FilePathSchema.describe("File containing the import"),
  resolveAliases: z.boolean().optional().default(false),
});

// check_function_signature
export const CheckFunctionSignatureSchema = z.object({
  functionName: SymbolNameSchema,
  args: z.array(z.string()).describe("Argument types or names"),
  filePath: FilePathSchema.optional(),
});

// verify_api_usage
export const VerifyApiUsageSchema = z.object({
  library: z.string().min(1).describe("Library name (e.g., 'fs', 'react')"),
  api: z.string().min(1).describe("API or function name"),
  parameters: z.record(z.unknown()).optional().describe("Parameters passed to the API"),
});

// ============================================================================
// Post-Review Tool Schemas
// ============================================================================

// review_code_for_hallucinations
export const ReviewCodeForHallucinationsSchema = z.object({
  code: CodeSnippetSchema,
  language: LanguageEnum,
  context: z.string().optional().describe("Additional context for the review"),
  checkImports: z.boolean().optional().default(true),
  checkSignatures: z.boolean().optional().default(true),
  checkTypes: z.boolean().optional().default(true),
});

// detect_contradictions
export const DetectContradictionsSchema = z.object({
  statements: z.array(z.string().min(1)).min(1).describe("Statements to check"),
  context: z.string().optional().describe("Additional context"),
});

// validate_factual_claims
export const ValidateFactualClaimsSchema = z.object({
  claims: z.array(z.string().min(1)).min(1).describe("Claims to validate"),
  domain: z.string().optional().default("codebase").describe("Domain to validate against"),
});

// ============================================================================
// Consistency Check Tool Schemas
// ============================================================================

// check_logical_consistency
export const CheckLogicalConsistencySchema = z.object({
  codeBlocks: z.array(CodeSnippetSchema).min(1).describe("Code blocks to compare"),
  assertions: z.array(z.string()).optional().describe("Expected invariants"),
});

// validate_type_consistency
export const ValidateTypeConsistencySchema = z.object({
  code: CodeSnippetSchema,
  filePath: FilePathSchema.optional(),
  language: LanguageEnum,
});

// ============================================================================
// Resource Query Schemas
// ============================================================================

// codebase://structure
export const CodebaseStructureQuerySchema = z.object({
  path: z.string().optional().describe("Subdirectory to query"),
  includeStats: z.boolean().optional().default(true),
});

// codebase://exports
export const ExportsQuerySchema = z.object({
  filePath: FilePathSchema.optional().describe("Specific file to query"),
  pattern: z.string().optional().describe("Pattern to filter exports"),
});

// codebase://imports
export const ImportsQuerySchema = z.object({
  filePath: FilePathSchema.optional().describe("Specific file to query"),
  includeExternal: z.boolean().optional().default(true),
});

// codebase://symbols
export const SymbolsQuerySchema = z.object({
  symbol: SymbolNameSchema,
  includeReferences: z.boolean().optional().default(true),
});

// ============================================================================
// Configuration Schemas
// ============================================================================

export const ServerConfigSchema = z.object({
  workspacePath: z.string().min(1),
  include: z.array(z.string()).default([".ts", ".tsx", ".js", ".jsx"]),
  exclude: z.array(z.string()).default(["node_modules", "dist", ".git", "build"]),
  logLevel: z.enum(["debug", "info", "warn", "error"]).default("info"),
  maxCacheSize: z.number().int().positive().default(1000),
});

// ============================================================================
// Response Schemas (for validation)
// ============================================================================

export const ToolResponseSchema = z.object({
  content: z.array(
    z.object({
      type: z.literal("text"),
      text: z.string(),
    })
  ),
  isError: z.boolean().optional(),
});

export const SymbolInfoSchema = z.object({
  name: z.string(),
  type: SymbolTypeEnum,
  filePath: z.string(),
  line: z.number().optional(),
  column: z.number().optional(),
  signature: z.string().optional(),
  exported: z.boolean(),
});

export const ValidationResultSchema = z.object({
  valid: z.boolean(),
  confidence: z.number().min(0).max(1),
  errors: z.array(z.string()),
  warnings: z.array(z.string()),
  suggestions: z.array(z.string()),
});

export const HallucinationIssueSchema = z.object({
  type: z.enum([
    "missing-symbol",
    "invalid-import",
    "signature-mismatch",
    "contradiction",
    "type-error",
    "api-mismatch",
  ]),
  severity: SeverityEnum,
  message: z.string(),
  location: z
    .object({
      filePath: z.string(),
      line: z.number().optional(),
      column: z.number().optional(),
    })
    .optional(),
  suggestion: z.string().optional(),
  confidence: z.number().min(0).max(1),
});

export const CodeReviewResultSchema = z.object({
  issues: z.array(HallucinationIssueSchema),
  confidence: z.number().min(0).max(1),
  summary: z.string(),
  corrected: z.string().optional(),
});

// ============================================================================
// Export all schemas for use in tools
// ============================================================================

export const Schemas = {
  // Pre-flight
  verifySymbolExists: VerifySymbolExistsSchema,
  validateImportPath: ValidateImportPathSchema,
  checkFunctionSignature: CheckFunctionSignatureSchema,
  verifyApiUsage: VerifyApiUsageSchema,

  // Post-review
  reviewCodeForHallucinations: ReviewCodeForHallucinationsSchema,
  detectContradictions: DetectContradictionsSchema,
  validateFactualClaims: ValidateFactualClaimsSchema,

  // Consistency
  checkLogicalConsistency: CheckLogicalConsistencySchema,
  validateTypeConsistency: ValidateTypeConsistencySchema,

  // Resources
  codebaseStructure: CodebaseStructureQuerySchema,
  exports: ExportsQuerySchema,
  imports: ImportsQuerySchema,
  symbols: SymbolsQuerySchema,

  // Configuration
  serverConfig: ServerConfigSchema,

  // Responses
  toolResponse: ToolResponseSchema,
  symbolInfo: SymbolInfoSchema,
  validationResult: ValidationResultSchema,
  hallucinationIssue: HallucinationIssueSchema,
  codeReviewResult: CodeReviewResultSchema,
};
