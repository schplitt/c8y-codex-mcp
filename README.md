# c8y-codex-mcp

Unofficial MCP server for Cumulocity Codex documentation.

An LLM bridge that fetches Cumulocity docs and exposes MCP tools for efficient document discovery and retrieval.

## How it works

```
Fetch llms.txt live → Parse structure → Resolve requested docs lazily → Cache raw/enriched content per URL with different TTLs → Expose MCP tools
```

The server:

1. Fetches and parses Cumulocity Codex structure on demand
2. Resolves raw markdown content for requested links
3. Caches raw markdown docs for 2 hours
4. Caches enriched browser-rendered markdown docs for 12 hours (separate cache namespace from raw markdown)

## Browser Rendering enrichment

When running on Cloudflare Workers with a Browser Rendering binding, document resolution uses Playwright to render each requested `.md` link as its non-`.md` page URL, extracts `main#main-content`, and converts that HTML to markdown.

- Browser binding name must be `BROWSER`
- A fresh browser is launched per render request and closed afterwards
- If rendering/extraction fails, resolution falls back to direct `.md` fetch and logs the failure

## Caching model

- Parsed Codex structure (`llms.txt`) is cached for 10 minutes
- Raw markdown document content is cached per URL for 2 hours
- Enriched browser-rendered document content is cached per URL for 12 hours
- Content cache entries expire via TTL and are re-computed on next request

## Remote MCP runtime

The `/mcp` endpoint uses Cloudflare's `agents/mcp` (`McpAgent`) pattern with a Durable Object-backed MCP runtime.

- Transport/session lifecycle is managed by the agent runtime
- MCP tools are initialized in the agent class
- Wrangler config includes a Durable Object class + binding for the MCP agent

## MCP tools

- **get-codex-structure** — Return the same complete structure from the shared structure cache (section/subsection/subsubsection)
- **query-codex** — Primary keyword-based discovery search over section/subsection metadata and linked raw markdown content (including one-hop internal Codex links found in docs)
- **get-codex-links** — Return resolved links by section/subsection titles without fetching content
- **get-codex-documents** — Get full raw markdown content by URL(s)
- **get-codex-document-enriched** — Browser-rendered enriched retrieval with line/chunk controls (fallback when raw markdown is insufficient)

For `query-codex`, provide `query` as a single space-separated keyword string (for example: `services app-state permissions`) instead of natural-language questions. Default retrieval flow is `query-codex` → `get-codex-links` → `get-codex-documents`.

Raw document outputs normalize internal Codex hash links (`#/...`) into absolute human-readable Codex URLs (without `.md`) and do not expose internal fetch-source URLs.

Rendered/enriched cache keys use a dedicated namespace (`c8y:rendered-*`) and do not overwrite raw markdown cache entries (`c8y:raw:*`).

### MCP prompts

- **codex-query-workflow** — Reusable prompt template that guides clients through deterministic tool usage (`query-codex` → `get-codex-links` → `get-codex-documents` → optional enriched fallback)

### Enriched line-based retrieval

`get-codex-document-enriched` supports line-based retrieval metadata at the top of each response:

- `startLine`: first returned line
- `endLine`: last returned line
- `returnedLines`: count of returned lines
- `nextStartLine`: start line for the next page (`null` when complete)

Chunking and line pagination are intentionally only used in the enriched tool.

## Local development

```sh
pnpm install
pnpm dev
```

Build production output:

```sh
pnpm build
pnpm preview
```

Run tests directly with Vitest:

```sh
pnpm vitest run
```
