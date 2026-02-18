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
