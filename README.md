# c8y-codex-mcp

Unofficial MCP server for Cumulocity Codex documentation.

An LLM bridge that fetches Cumulocity docs and exposes MCP tools for efficient document discovery and retrieval.

## How it works

```
Fetch llms.txt live → Parse structure → Resolve requested docs lazily → Cache browser-rendered content per URL → Expose MCP tools
```

The server:

1. Fetches and parses Cumulocity Codex structure on demand (no llms cache)
2. Resolves document content only for requested links
3. Caches successful browser-rendered docs per URL in KV with TTL
4. Falls back to direct fetch if rendering fails and logs render failures

## Browser Rendering enrichment

When running on Cloudflare Workers with a Browser Rendering binding, document resolution uses Playwright to render each requested `.md` link as its non-`.md` page URL, extracts `main#main-content`, and converts that HTML to markdown.

- Browser binding name must be `BROWSER`
- A fresh browser is launched per render request and closed afterwards
- If rendering/extraction fails, resolution falls back to direct `.md` fetch and logs the failure

## Caching model

- `llms.txt` structure is always fetched live and is not cached
- Linked document content is cached per URL in KV
- Only successful browser-rendered content is cached
- Content cache entries expire via TTL and are re-computed on next request

## Remote MCP runtime

The `/mcp` endpoint uses Cloudflare's `agents/mcp` (`McpAgent`) pattern with a Durable Object-backed MCP runtime.

- Transport/session lifecycle is managed by the agent runtime
- MCP tools are initialized in the agent class
- Wrangler config includes a Durable Object class + binding for the MCP agent

## MCP tools

- **list-codex-index** — List the documentation index (sections/subsections, descriptions, links)
- **search-codex-sections** — Fuzzy search section titles/descriptions (returns section names only)
- **get-codex-sections** — Get section/subsection content by section title
- **get-codex-documents** — Get full stored document content by document URL

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
