#!/usr/bin/env node

/**
 * stdio - Hallucination Prevention MCP Server
 *
 * Main entry point for the stdio MCP server.
 * This server helps prevent AI coding agent hallucinations through
 * comprehensive validation of code, imports, functions, and APIs.
 *
 * Usage:
 *   npx stdio
 *   npx stdio --workspace /path/to/project
 *   npx stdio --help
 */

import { resolve } from "path";
import { existsSync } from "fs";
import { cwd } from "process";
import { StdioServer } from "./server.js";
import { ServerConfig } from "./types/index.js";

/**
 * Parse command line arguments
 */
function parseArgs(): { workspace?: string; help?: boolean; version?: boolean } {
  const args = process.argv.slice(2);
  const result: { workspace?: string; help?: boolean; version?: boolean } = {};

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];

    if (arg === "--help" || arg === "-h") {
      result.help = true;
    } else if (arg === "--version" || arg === "-v") {
      result.version = true;
    } else if (arg === "--workspace" || arg === "-w") {
      result.workspace = args[++i];
    } else if (arg.startsWith("--workspace=")) {
      result.workspace = arg.split("=")[1];
    }
  }

  return result;
}

/**
 * Show help message
 */
function showHelp(): void {
  console.error(`
stdio - Hallucination Prevention MCP Server

USAGE:
  npx stdio [OPTIONS]

OPTIONS:
  --workspace, -w <path>   Path to the workspace root (default: current directory)
  --help, -h              Show this help message
  --version, -v           Show version information

DESCRIPTION:
  stdio is an MCP (Model Context Protocol) server that helps prevent AI coding
  agent hallucinations by validating code, imports, function signatures, and API
  usage against the actual codebase.

TOOLS:
  Pre-flight Validation:
    - verify_symbol_exists       Check if a symbol exists in the codebase
    - validate_import_path       Validate import paths
    - check_function_signature   Verify function signatures
    - verify_api_usage           Validate API usage

  Post-Generation Review:
    - review_code_for_hallucinations    Comprehensive code review
    - detect_contradictions             Detect logical contradictions
    - validate_factual_claims           Validate claims against codebase

  Consistency Checks:
    - check_logical_consistency         Check logical consistency
    - validate_type_consistency         Validate type consistency

RESOURCES:
  - codebase://structure    Codebase structure and statistics
  - codebase://exports      All exports in the codebase
  - codebase://imports      All imports in the codebase

CONFIGURATION:
  The server can be configured via:
  1. Command-line arguments (shown above)
  2. Environment variables:
     - STDIO_WORKSPACE    Workspace root path
     - STDIO_LOG_LEVEL    Log level (debug, info, warn, error)
  3. Config file: .stdiorc.json in workspace root

EXAMPLES:
  # Start with current directory as workspace
  npx stdio

  # Start with specific workspace
  npx stdio --workspace /path/to/project

  # Use with Claude Desktop (add to .mcp.json or claude_desktop_config.json):
  {
    "mcpServers": {
      "stdio": {
        "command": "node",
        "args": ["/path/to/stdio/dist/index.js", "--workspace", "/path/to/project"]
      }
    }
  }

For more information, visit: https://github.com/tac0de/epistemic-check-mcp
`);
}

/**
 * Show version information
 */
function showVersion(): void {
  console.error("stdio v1.0.0");
}

/**
 * Get workspace path from args, env, or current directory
 */
function getWorkspacePath(args: { workspace?: string }): string {
  if (args.workspace) {
    const resolved = resolve(args.workspace);
    if (!existsSync(resolved)) {
      console.error(`Error: Workspace path does not exist: ${resolved}`);
      process.exit(1);
    }
    return resolved;
  }

  // Check environment variable
  if (process.env.STDIO_WORKSPACE) {
    return resolve(process.env.STDIO_WORKSPACE);
  }

  // Default to current directory
  return cwd();
}

/**
 * Load config from .stdiorc.json if it exists
 */
async function loadConfig(workspacePath: string): Promise<Partial<ServerConfig>> {
  const configPath = resolve(workspacePath, ".stdiorc.json");

  if (existsSync(configPath)) {
    try {
      const fs = await import("fs");
      const config = JSON.parse(fs.readFileSync(configPath, "utf-8"));
      return config;
    } catch (error) {
      console.error(`Warning: Failed to load config from ${configPath}`);
    }
  }

  return {};
}

/**
 * Main entry point
 */
async function main(): Promise<void> {
  const args = parseArgs();

  if (args.help) {
    showHelp();
    process.exit(0);
  }

  if (args.version) {
    showVersion();
    process.exit(0);
  }

  // Determine workspace path
  const workspacePath = getWorkspacePath(args);

  // Load config file if exists
  const fileConfig = await loadConfig(workspacePath);

  // Create server config
  const config: ServerConfig = {
    workspacePath,
    include: [".ts", ".tsx", ".js", ".jsx"],
    exclude: ["node_modules", "dist", ".git", "build"],
    logLevel: (process.env.STDIO_LOG_LEVEL as any) || "info",
    maxCacheSize: 1000,
    strictMode: (process.env.STDIO_STRICT_MODE as any) || "off",
    requireValidationFor: ["review_code_for_hallucinations", "validate_factual_claims"],
    ...fileConfig,
  };

  // Create and start server
  const server = new StdioServer(config);

  // Handle graceful shutdown
  process.on("SIGINT", async () => {
    console.error("\nShutting down gracefully...");
    await server.stop();
    process.exit(0);
  });

  process.on("SIGTERM", async () => {
    console.error("\nShutting down gracefully...");
    await server.stop();
    process.exit(0);
  });

  // Handle uncaught errors
  process.on("uncaughtException", (error) => {
    console.error("Uncaught exception:", error);
    process.exit(1);
  });

  process.on("unhandledRejection", (reason, promise) => {
    console.error("Unhandled rejection at:", promise, "reason:", reason);
    process.exit(1);
  });

  // Start the server
  try {
    await server.start();
  } catch (error) {
    console.error("Failed to start server:", error);
    process.exit(1);
  }
}

// Start the server
main().catch((error) => {
  console.error("Fatal error:", error);
  process.exit(1);
});
