# c8y-codex-mcp

Unofficial MCP server for Cumulocity Codex documentation.

An LLM bridge that fetches Cumulocity docs, builds a deduplicated snapshot, and exposes MCP tools for efficient document discovery and retrieval.

## How it works

```
Fetch llms.txt → Parse structure → Enrich linked docs → Normalize content → Build snapshot → Expose MCP tools
```

The server:
1. Fetches and parses Cumulocity Codex documentation structure
2. Deduplicates linked content with a promise cache
3. Normalizes content (HTML→Markdown, placeholder replacement)
4. Exposes MCP tools so LLMs can discover and request only needed docs

## MCP tools

- **list-codex-documentation** — List all sections/subsections with descriptions and links
- **search-documentation-sections** — Fuzzy search sections by title/description (returns names only)
- **list-documentation-sections** — Get content for specific sections and subsections
- **get-codex-documentations** — Fetch full content for specified document URLs

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
