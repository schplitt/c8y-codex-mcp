# c8y-codex-mcp

Unofficial MCP server for Cumulocity Codex documentation.

An LLM bridge that fetches Cumulocity docs and exposes MCP tools for efficient document discovery and retrieval.

## Development

Install dependencies and run locally:

```sh
pnpm install
pnpm dev
```

Build production output:

```sh
pnpm build
pnpm preview
```

Run tests:

```sh
pnpm vitest run
```

By default, the MCP endpoint is available at `http://localhost:3000/mcp`.

## How it works

```
Fetch llms.txt live → Parse structure → Resolve requested docs lazily → Cache raw/enriched content per URL with different TTLs → Expose MCP tools
```

This server mirrors Codex structure on demand and serves focused MCP retrieval tools with cached raw and enriched document content via browser rendering.

## Usage

Point your MCP client to your deployed URL (or local URL) and use `/mcp` as the endpoint.

### Visual Studio Code

Create or update `.vscode/mcp.json`:

```json
{
    "servers": {
        "c8y-docs": {
            "type": "http",
            "url": "https://<your-host>/mcp"
        }
    }
}
```

### Claude Code

```sh
claude mcp add --transport http c8y-docs https://<your-host>/mcp
```

### Cursor

Create or update `.cursor/mcp.json`:

```json
{
    "mcpServers": {
        "c8y-docs": {
            "type": "http",
            "url": "https://<your-host>/mcp"
        }
    }
}
```

### Windsurf

Create or update `.codeium/windsurf/mcp_config.json`:

```json
{
    "mcpServers": {
        "c8y-docs": {
            "type": "http",
            "url": "https://<your-host>/mcp"
        }
    }
}
```

### Zed

Add to `.config/zed/settings.json`:

```json
{
    "context_servers": {
        "c8y-docs": {
            "source": "custom",
            "command": "npx",
            "args": ["mcp-remote", "https://<your-host>/mcp"],
            "env": {}
        }
    }
}
```

## MCP tools and prompts

### Tools

- **get-codex-structure**: Returns the complete Codex structure (sections/subsections/subsubsections with links).
- **query-codex**: Keyword-based discovery over structure metadata and linked raw markdown content.
- **get-codex-documents**: Fetches full raw markdown content by URL.
- **get-codex-document-enriched**: Expensive fallback that returns browser-rendered enriched markdown, with optional chunk search and line-based paging.

### Prompts

- **codex-query-workflow**: Reusable prompt template for deterministic tool flow (`query-codex` → `get-codex-documents`, with optional enriched fallback).

## How it works (detailed)

```
Fetch llms.txt live → Parse structure → Resolve requested docs lazily → Cache raw/enriched content per URL with different TTLs → Expose MCP tools
```

1. Fetch and parse Codex structure (`llms.txt`) on demand.
2. Resolve raw markdown content lazily for requested URLs.
3. Optionally render docs in Browser Rendering for enriched markdown extraction.
4. Cache structure and document content with separate TTLs/namespaces.
5. Serve MCP tools/prompts for discovery and retrieval workflows.

Runtime details:

- The `/mcp` endpoint uses Cloudflare `agents/mcp` (`McpAgent`) with a Durable Object-backed runtime.
- Transport/session lifecycle is managed by the agent runtime.
- Tools and prompts are initialized in the agent class.

Browser Rendering enrichment:

- Browser binding name must be `BROWSER`.
- Requested `.md` URLs are rendered as non-`.md` pages, then `main#main-content` is extracted and converted to markdown.
- A fresh browser is launched per render request and closed afterwards.
- If rendering or extraction fails, resolution falls back to direct `.md` fetch.

Caching model:

- Parsed Codex structure (`llms.txt`) is cached for 10 minutes.
- Raw markdown document content is cached per URL for 2 hours.
- Enriched browser-rendered markdown content is cached per URL for 12 hours.
- Content cache entries expire via TTL and are re-computed on next request.

Query and output behavior:

- `query-codex` expects a space-separated keyword query (example: `services app-state permissions`).
- Raw document outputs normalize internal Codex hash links (`#/...`) into absolute human-readable Codex URLs (without `.md`).
- Rendered/enriched cache keys use a dedicated namespace (`c8y:rendered-*`) and never overwrite raw cache entries (`c8y:raw:*`).

Enriched line-based retrieval:

- `get-codex-document-enriched` includes `startLine`, `endLine`, `returnedLines`, and `nextStartLine` metadata.
- Chunking and line pagination are used only in the enriched tool.

## License

MIT
