# @tac0de/epistemic-check-mcp - Hallucination Prevention MCP Server

An MCP (Model Context Protocol) server that prevents AI coding agent hallucinations through comprehensive validation of code, imports, functions, and APIs against the actual codebase.

## Overview

AI coding agents sometimes "hallucinate" - they generate code that references non-existent functions, use incorrect import paths, or call APIs with wrong signatures. `stdio` solves this by providing validation tools and resources that check code against the actual codebase before it's suggested.

## Installation

```bash
npm install -g @tac0de/epistemic-check-mcp
# or use with npx (no installation needed)
npx @tac0de/epistemic-check-mcp
```

## Configuration

Add to your `.mcp.json` or `claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "epistemic-check": {
      "command": "npx",
      "args": ["-y", "@tac0de/epistemic-check-mcp"]
    }
  }
}
```

With a custom workspace:

```json
{
  "mcpServers": {
    "epistemic-check": {
      "command": "npx",
      "args": ["-y", "@tac0de/epistemic-check-mcp", "--workspace", "/path/to/project"]
    }
  }
}
```

### Optional Configuration File

Create `.stdiorc.json` in your workspace root:

```json
{
  "include": [".ts", ".tsx", ".js", ".jsx"],
  "exclude": ["node_modules", "dist", ".git", "build"],
  "logLevel": "info",
  "strictMode": "warn"
}
```

### Strict Mode

Configure strictness level to automatically enforce validation:

| Mode | Description |
|------|-------------|
| `off` | Validation is optional (default) |
| `warn` | Logs warnings when validation is skipped |
| `strict` | Requires validation for code review tools |
| `paranoid` | Requires validation for ALL tools |

Set via environment variable:
```bash
export STDIO_STRICT_MODE=strict
```

Or in `.stdiorc.json`:
```json
{
  "strictMode": "strict",
  "requireValidationFor": ["review_code_for_hallucinations", "validate_factual_claims"]
}
```

## API Tools

### Pre-Flight Validation

**verify_symbol_exists** - Check if a function, class, or variable exists

```json
{
  "symbol": "myFunction",
  "filePath": "./src/utils.ts",
  "symbolType": "function"
}
```

**validate_import_path** - Verify import paths are valid

```json
{
  "importPath": "./utils/helper",
  "fromFile": "./src/index.ts"
}
```

**check_function_signature** - Ensure function calls match their signatures

```json
{
  "functionName": "myFunction",
  "args": ["string", "number"],
  "filePath": "./src/utils.ts"
}
```

**verify_api_usage** - Validate API usage against known libraries

```json
{
  "library": "fs",
  "api": "readFileSync",
  "parameters": { "path": "/path/to/file", "encoding": "utf-8" }
}
```

### Post-Generation Review

**review_code_for_hallucinations** - Comprehensive code review

```json
{
  "code": "import { myFunction } from './utils';\nconst result = myFunction('test', 42);",
  "language": "typescript"
}
```

**detect_contradictions** - Find logical contradictions in statements

```json
{
  "statements": [
    "The function exists in utils.ts",
    "The function does not exist anywhere"
  ]
}
```

**validate_factual_claims** - Validate claims against the codebase

```json
{
  "claims": [
    "File 'src/index.ts' exists",
    "Function 'myFunction' is exported from utils.ts"
  ]
}
```

### Consistency Checking

**check_logical_consistency** - Check consistency across code blocks

```json
{
  "codeBlocks": ["const x: number = 5;", "x = 'string';"]
}
```

**validate_type_consistency** - Validate type consistency in code

```json
{
  "code": "const x: string = 'hello'; x = 42;",
  "language": "typescript"
}
```

## Resources

**codebase://structure** - Get codebase structure and statistics

**codebase://exports** - Query all exports in the codebase

**codebase://imports** - Query all imports in the codebase

## License

MIT License - see LICENSE file for details

## Links

- [npm](https://www.npmjs.com/package/@tac0de/epistemic-check-mcp)
- [GitHub](https://github.com/tac0de/epistemic-check-mcp)
- [Model Context Protocol](https://modelcontextprotocol.io/)

---

Made with ❤️ by tac0de
