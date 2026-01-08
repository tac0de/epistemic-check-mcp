/**
 * MCP Server Setup - Configure and register all tools and resources
 */

import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
  ListResourcesRequestSchema,
  ReadResourceRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import { ExistenceCheckTools, APIValidationTools, ConsistencyCheckTools, PostReviewTools } from "./tools/index.js";
import { CodebaseStructureResource, ExportsMapResource } from "./resources/index.js";
import { ServerConfig } from "./types/index.js";
import { StrictModeManager } from "./utils/strict-mode.js";

export class StdioServer {
  private server: Server;
  private config: ServerConfig;
  private existenceTools: ExistenceCheckTools;
  private apiValidationTools: APIValidationTools;
  private consistencyTools: ConsistencyCheckTools;
  private postReviewTools: PostReviewTools;
  private codebaseResource: CodebaseStructureResource;
  private exportsResource: ExportsMapResource;
  private strictModeManager: StrictModeManager;

  constructor(config: ServerConfig) {
    this.config = config;

    // Initialize strict mode manager
    this.strictModeManager = new StrictModeManager({
      level: config.strictMode || "off",
      requireValidationFor: config.requireValidationFor,
    });

    // Initialize tools
    this.existenceTools = new ExistenceCheckTools(config);
    this.apiValidationTools = new APIValidationTools(config);
    this.consistencyTools = new ConsistencyCheckTools(config);
    this.postReviewTools = new PostReviewTools(config);

    // Initialize resources
    this.codebaseResource = new CodebaseStructureResource(config);
    this.exportsResource = new ExportsMapResource(config);

    // Create MCP server
    this.server = new Server(
      {
        name: "stdio",
        version: "1.0.0",
      },
      {
        capabilities: {
          tools: {},
          resources: {},
        },
      }
    );

    this.setupHandlers();
  }

  /**
   * Set up request handlers
   */
  private setupHandlers(): void {
    // List available tools
    this.server.setRequestHandler(ListToolsRequestSchema, async () => {
      return {
        tools: [
          // Pre-flight validation tools
          {
            name: "verify_symbol_exists",
            description: "Verify if a symbol (function, class, variable) exists in the codebase",
            inputSchema: {
              type: "object",
              properties: {
                symbol: {
                  type: "string",
                  description: "Name of the symbol to verify",
                },
                filePath: {
                  type: "string",
                  description: "Optional file path to limit search",
                },
                symbolType: {
                  type: "string",
                  enum: ["function", "class", "variable", "import", "type", "interface"],
                  description: "Type of symbol",
                },
              },
              required: ["symbol"],
            },
          },
          {
            name: "validate_import_path",
            description: "Validate an import path and provide alternatives if invalid",
            inputSchema: {
              type: "object",
              properties: {
                importPath: {
                  type: "string",
                  description: "Import path to validate",
                },
                fromFile: {
                  type: "string",
                  description: "File containing the import",
                },
              },
              required: ["importPath", "fromFile"],
            },
          },
          {
            name: "check_function_signature",
            description: "Check if a function call matches its signature",
            inputSchema: {
              type: "object",
              properties: {
                functionName: {
                  type: "string",
                  description: "Name of the function",
                },
                args: {
                  type: "array",
                  items: { type: "string" },
                  description: "Arguments passed to the function",
                },
                filePath: {
                  type: "string",
                  description: "File where the function is defined",
                },
              },
              required: ["functionName", "args"],
            },
          },
          {
            name: "verify_api_usage",
            description: "Verify API usage against known library APIs",
            inputSchema: {
              type: "object",
              properties: {
                library: {
                  type: "string",
                  description: "Library name (e.g., 'fs', 'react')",
                },
                api: {
                  type: "string",
                  description: "API or function name",
                },
                parameters: {
                  type: "object",
                  description: "Parameters passed to the API",
                },
              },
              required: ["library", "api"],
            },
          },
          // Post-review tools
          {
            name: "review_code_for_hallucinations",
            description: "Comprehensive review of code for potential hallucinations",
            inputSchema: {
              type: "object",
              properties: {
                code: {
                  type: "string",
                  description: "Code to review",
                },
                language: {
                  type: "string",
                  enum: ["typescript", "javascript", "tsx", "jsx", "python", "go", "rust"],
                  description: "Programming language",
                },
                context: {
                  type: "string",
                  description: "Additional context for the review",
                },
                checkImports: {
                  type: "boolean",
                  description: "Check import statements",
                },
                checkSignatures: {
                  type: "boolean",
                  description: "Check function signatures",
                },
                checkTypes: {
                  type: "boolean",
                  description: "Check type consistency",
                },
              },
              required: ["code", "language"],
            },
          },
          {
            name: "detect_contradictions",
            description: "Detect logical contradictions in statements",
            inputSchema: {
              type: "object",
              properties: {
                statements: {
                  type: "array",
                  items: { type: "string" },
                  description: "Statements to check for contradictions",
                },
                context: {
                  type: "string",
                  description: "Additional context",
                },
              },
              required: ["statements"],
            },
          },
          {
            name: "validate_factual_claims",
            description: "Validate factual claims against the codebase",
            inputSchema: {
              type: "object",
              properties: {
                claims: {
                  type: "array",
                  items: { type: "string" },
                  description: "Claims to validate",
                },
                domain: {
                  type: "string",
                  description: "Domain to validate against",
                },
              },
              required: ["claims"],
            },
          },
          // Consistency check tools
          {
            name: "check_logical_consistency",
            description: "Check logical consistency across code blocks",
            inputSchema: {
              type: "object",
              properties: {
                codeBlocks: {
                  type: "array",
                  items: { type: "string" },
                  description: "Code blocks to compare",
                },
                assertions: {
                  type: "array",
                  items: { type: "string" },
                  description: "Expected invariants",
                },
              },
              required: ["codeBlocks"],
            },
          },
          {
            name: "validate_type_consistency",
            description: "Validate type consistency in code",
            inputSchema: {
              type: "object",
              properties: {
                code: {
                  type: "string",
                  description: "Code to validate",
                },
                filePath: {
                  type: "string",
                  description: "Optional file path",
                },
                language: {
                  type: "string",
                  enum: ["typescript", "javascript", "tsx", "jsx"],
                  description: "Programming language",
                },
              },
              required: ["code", "language"],
            },
          },
        ],
      };
    });

    // List available resources
    this.server.setRequestHandler(ListResourcesRequestSchema, async () => {
      return {
        resources: [
          {
            uri: "codebase://structure",
            name: "Codebase Structure",
            description: "Structure and statistics of the codebase",
            mimeType: "application/json",
          },
          {
            uri: "codebase://exports",
            name: "Codebase Exports",
            description: "All exports in the codebase",
            mimeType: "application/json",
          },
          {
            uri: "codebase://imports",
            name: "Codebase Imports",
            description: "All imports in the codebase",
            mimeType: "application/json",
          },
        ],
      };
    });

    // Handle tool calls
    // @ts-ignore - MCP SDK type mismatch with our ToolResponse type
    this.server.setRequestHandler(CallToolRequestSchema, async (request) => {
      const { name, arguments: args } = request.params;

      // Check strict mode compliance
      const violation = this.strictModeManager.checkViolation(name);
      if (violation.violation) {
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify({
                error: "Strict mode violation",
                message: violation.message,
                strictLevel: this.strictModeManager.getConfig().level,
              }),
            },
          ],
          isError: true,
        };
      }

      // Record validation when validation tools are called
      if (
        name === "verify_symbol_exists" ||
        name === "validate_import_path" ||
        name === "check_function_signature" ||
        name === "verify_api_usage" ||
        name === "review_code_for_hallucinations" ||
        name === "validate_factual_claims"
      ) {
        this.strictModeManager.recordValidation(name);
      }

      try {
        switch (name) {
          // Pre-flight validation tools
          case "verify_symbol_exists":
            return await this.existenceTools.verifySymbolExists(args as any);
          case "validate_import_path":
            return await this.existenceTools.validateImportPath(args as any);
          case "check_function_signature":
            return await this.existenceTools.checkFunctionSignature(args as any);
          case "verify_api_usage":
            return await this.apiValidationTools.verifyApiUsage(args as any);

          // Post-review tools
          case "review_code_for_hallucinations":
            return await this.postReviewTools.reviewCodeForHallucinations(args as any);
          case "detect_contradictions":
            return await this.consistencyTools.detectContradictions(args as any);
          case "validate_factual_claims":
            return await this.postReviewTools.validateFactualClaims(args as any);

          // Consistency check tools
          case "check_logical_consistency":
            return await this.consistencyTools.checkLogicalConsistency(args as any);
          case "validate_type_consistency":
            return await this.consistencyTools.validateTypeConsistency(args as any);

          default:
            return {
              content: [
                {
                  type: "text",
                  text: JSON.stringify({ error: `Unknown tool: ${name}` }),
                },
              ],
              isError: true,
            };
        }
      } catch (error) {
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify({
                error: `Tool execution failed: ${error instanceof Error ? error.message : String(error)}`,
              }),
            },
          ],
          isError: true,
        };
      }
    });

    // Handle resource reads
    this.server.setRequestHandler(ReadResourceRequestSchema, async (request) => {
      const { uri } = request.params;

      try {
        switch (uri) {
          case "codebase://structure": {
            const structure = await this.codebaseResource.getCodebaseStructure();
            return {
              contents: [
                {
                  uri,
                  mimeType: "application/json",
                  text: JSON.stringify(structure, null, 2),
                },
              ],
            };
          }

          case "codebase://exports": {
            const exports = await this.exportsResource.getExports();
            const exportsObj = Object.fromEntries(
              Array.from(exports.entries()).map(([path, exps]) => [
                path,
                exps,
              ])
            );
            return {
              contents: [
                {
                  uri,
                  mimeType: "application/json",
                  text: JSON.stringify(exportsObj, null, 2),
                },
              ],
            };
          }

          case "codebase://imports": {
            const imports = await this.exportsResource.getImports();
            const importsObj = Object.fromEntries(
              Array.from(imports.entries()).map(([path, imps]) => [
                path,
                imps,
              ])
            );
            return {
              contents: [
                {
                  uri,
                  mimeType: "application/json",
                  text: JSON.stringify(importsObj, null, 2),
                },
              ],
            };
          }

          default:
            return {
              contents: [
                {
                  uri,
                  mimeType: "text/plain",
                  text: JSON.stringify({ error: `Unknown resource: ${uri}` }),
                },
              ],
            };
        }
      } catch (error) {
        return {
          contents: [
            {
              uri,
              mimeType: "text/plain",
              text: JSON.stringify({
                error: `Resource read failed: ${error instanceof Error ? error.message : String(error)}`,
              }),
            },
          ],
        };
      }
    });
  }

  /**
   * Start the server
   */
  async start(): Promise<void> {
    const transport = new StdioServerTransport();
    await this.server.connect(transport);

    // Log server start (to stderr to not interfere with stdio)
    console.error(`stdio MCP server started for workspace: ${this.config.workspacePath}`);
  }

  /**
   * Stop the server
   */
  async stop(): Promise<void> {
    await this.server.close();
    console.error("stdio MCP server stopped");
  }

  /**
   * Clear all caches
   */
  clearCaches(): void {
    this.existenceTools.clearCache();
    this.apiValidationTools.clearCache();
    this.postReviewTools.clearCache();
    this.codebaseResource.clearCache();
    this.exportsResource.clearCache();
  }
}
