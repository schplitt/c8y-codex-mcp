# AGENTS.md

## Project Overview

This project is intentionally minimal.

Primary goal:

- fetch Cumulocity Codex `llms.txt`
- parse it into a compact structure model
- resolve linked documentation lazily with per-URL caching
- expose MCP tools that let an LLM discover the best section/subsection matches and request only needed content

It parses codex markdown/txt into a typed document model with:

- document `title`
- document `description`
- `sections[]` (from `##`)
  - `title`
  - `description`
  - `links[]` (section-level `.md` links)
  - `subsections[]` (from `###`)
    - `title`
    - `description`
    - `links[]` (`title`, `url`, `.md` only)
    - `subsubsections[]` (derived one-level from subsection links)
      - `title`
      - `description`
      - `links[]` (`title`, `url`, `.md` only)

  Linked docs are resolved lazily (on request) and cached per URL:
  - structure (`llms.txt`) is fetched live and not cached
  - document content is cached independently in KV with TTL
  - only successful browser-rendered content is persisted in cache

Browser Rendering path:

- lazy document resolution attempts to load `env.BROWSER` from `cloudflare:workers`
- when available, it renders each `.md` URL as non-`.md` via `@cloudflare/playwright`
- it extracts `main#main-content` HTML and feeds that into existing HTML→Markdown normalization
- if rendering/extraction is unavailable or fails, resolution falls back to direct `.md` fetch
- render failures are logged with structured metadata (phase/url/error)

Additionally:

- enrichment first tries to detect whether fetched content is HTML
- if detected as HTML, it tries to parse/convert it to Markdown using `@kreuzberg/html-to-markdown-wasm`
- conversion is best-effort (`try/catch`); fallback is raw fetched text
- after normalization, single-character Hugo placeholders in the form `{{'<one-char>'}}` are replaced with their literal character
- only one-character placeholders are replaced; multi-character placeholders are preserved

## Architecture

```
server/
├── routes/
│   ├── index.ts           # Basic Nitro root route
│   └── mcp.ts             # MCP route forwarding to CodexMcpAgent
└── utils/
  ├── rendering/
  │   ├── browser.ts     # Browser rendering helpers + pools
  │   ├── chunk.ts       # Markdown chunking + chunk search helpers
  │   ├── enrich.ts      # Raw/enriched document resolution orchestration
  │   └── enrich-browser.ts # Browser-rendered caching/resolution helpers
    ├── c8y/
    │   ├── index.ts       # Fetch + parse llms structure entry
    │   ├── parse.ts       # Markdown parsing into typed section model
  │   ├── enrich.ts      # Compatibility re-export to rendering/enrich
    │   ├── resolve.ts     # Section/subsection content resolution from snapshot
    │   └── types.ts       # Shared types + snapshot types
    └── mcp/
      └── agent.ts       # Cloudflare McpAgent class + MCP tools
tests/
├── llms-parser.test.ts
├── enrich-html-conversion.test.ts
└── snapshots/
  ├── llms.txt
  └── html.html
```

### Parsing

- Use `markdown-exit` for markdown parsing.
- Resolve relative codex links (for example `#/advanced-development/...`) against codex root.
- Parse headings up to `###`; treat `####` and deeper as same-level content for the current `###` subsection (do not create deeper structure levels).
- Extract section links from `##` blocks and subsection links from `###` blocks.
- Keep only `.md` links and prune empty sections/subsections.
- Store fetch failures as status metadata in `documents[url]` (non-fail-hard).
- Keep output shape simple and stable for MCP-style consumption.

### MCP Tools

- `get-codex-structure` (same complete structure output as index from shared structure cache)
- `query-codex` (MiniSearch-backed full-text discovery over metadata + linked raw markdown, returning section/subsection title, description, and URLs)
- `get-codex-links` (section/subsection link discovery without fetching document content)
- `get-codex-documents` (full raw markdown documents by URL)
- `get-codex-document-enriched` (browser-rendered enriched retrieval fallback with line/chunk controls)
- `codex-query-workflow` prompt (reusable MCP prompt template guiding query→link-discovery→document-fetch usage)

### Runtime

- Nitro server with `srcDir: "server"`
- MCP endpoint `/mcp` served by `CodexMcpAgent.serve('/mcp')` from `server/routes/mcp.ts`
- MCP runtime uses Durable Object-backed `agents/mcp` (`CodexMcpAgent` class)
- `llms.txt` structure is fetched live (no persistent structure cache)
- linked doc content is cached per URL in KV with TTL

## Development

```sh
pnpm install    # Install dependencies
pnpm dev        # Run Nitro dev server
pnpm build      # Build Nitro server
pnpm preview    # Preview production build
pnpm vitest run # Run tests once
```

## Code Style

- ESM only (`"type": "module"`)
- TypeScript strict mode enabled
- Uses Nitro for building/runtime
- Uses `vitest` for testing

## Cloudflare Workers

**⚠️ Important:** Knowledge of Cloudflare Workers APIs and limits may be outdated. Always retrieve current documentation before any Workers, KV, R2, D1, Durable Objects, Queues, Vectorize, AI, or Agents SDK task.

### Documentation

- [Cloudflare Workers](https://developers.cloudflare.com/workers/)
- [Model Context Protocol (MCP)](https://docs.mcp.cloudflare.com/mcp)

### Node.js Compatibility

See [Cloudflare Workers Node.js APIs](https://developers.cloudflare.com/workers/runtime-apis/nodejs/) for compatibility details.

### Error Handling

- **Error 1102** (CPU/Memory exceeded): Check limits at [/workers/platform/limits/](https://developers.cloudflare.com/workers/platform/limits/)
- **All errors**: [Cloudflare Workers Errors](https://developers.cloudflare.com/workers/observability/errors/)

### Product Documentation

Retrieve API references and limits from the product docs:

- [KV](https://developers.cloudflare.com/kv/)
- [R2](https://developers.cloudflare.com/r2/)
- [D1](https://developers.cloudflare.com/d1/)
- [Durable Objects](https://developers.cloudflare.com/durable-objects/)
- [Queues](https://developers.cloudflare.com/queues/)
- [Vectorize](https://developers.cloudflare.com/vectorize/)
- [Workers AI](https://developers.cloudflare.com/workers-ai/)
- [Agents](https://developers.cloudflare.com/agents/)

## Testing

- Write tests in the `tests/` directory
- Use `*.test.ts` file naming convention
- Run `pnpm vitest run` for running tests
- Import modules from `../server/utils/...`

Example test structure:

```ts
import { expect, test } from 'vitest'
import { myFunction } from '../src'

test('should do something', () => {
  expect(myFunction()).toBe(expectedValue)
})
```

## Maintaining Documentation

When making changes to the project:

- **`AGENTS.md`** — Update with technical details, architecture, and best practices for AI agents
  - Project architecture and file structure
  - Internal patterns and conventions
  - Development workflows
  - Testing strategies
  - Build/deployment processes
  - Code organization principles
  - Tool configurations and quirks

- **`README.md`** — Update with user-facing documentation for end users:
  - ✅ New exported utilities or functions from the package
  - ✅ New configuration options users can set
  - ✅ New CLI commands or features
  - ✅ Changes to existing API behavior
  - ✅ Environment variables users can set
  - ✅ Any feature users can configure, use, or interact with
  - ✅ Installation or setup instructions
  - ✅ Usage examples and code snippets

## Agent Guidelines

When working on this project:

1. **Run tests** after making changes: `pnpm vitest run`
2. **Run build** after making changes: `pnpm build`
3. **Run type checking** before committing if configured separately in scripts
4. **Update this file** when adding new modules, APIs, or changing architecture
5. **Keep public server logic under `server/utils`** and routes under `server/routes`
6. **Add tests** for new functionality in the `tests/` directory
7. **Record learnings** — When the user corrects a mistake or provides context about how something should be done, add it to the "Project Context & Learnings" section below if it's a recurring pattern (not a one-time fix)
8. **Notify documentation changes** — When updating `README.md` or `AGENTS.md`, explicitly call out the changes to the user at the end of your response so they can review and don't overlook them

## Project Context & Learnings

This section captures project-specific knowledge, tool quirks, and lessons learned during development. When the user provides corrections or context about how things should be done in this project, add them here if they are recurring patterns (not a one-time fix).

> **Note:** Before adding something here, consider: Is this a one-time fix, or will it come up again? Only document patterns that are likely to recur or are notable enough to prevent future mistakes.

### Tools & Dependencies

<!-- Add tool-specific notes, required configurations, or gotchas here -->

### Patterns & Conventions

- Keep parser, enrichment, resolver, and MCP tool logic in separate focused modules.
- Keep data model minimal: structure graph + deduplicated `documents[url]` store.
- Keep MCP tool outputs simple text/markdown with deterministic behavior.
- Keep structure tools (`get-codex-structure`, search tools) reading from the same shared structure cache object.
- Keep `query-codex` as full-text discovery over metadata + raw markdown content, while still returning compact match metadata (title, description, URLs) so callers decide what to fetch next.
- Keep `query-codex` input keyword-oriented (short tokens) and avoid natural-language prompts in tool calls.
- Prefer link-based retrieval flow (`query-codex` → `get-codex-links` → `get-codex-documents`) over section/subsection bulk content fetching.
- For deeper recall, allow one-hop expansion of internal Codex links (`#/...`) to `.md` when building search corpus.
- For `get-codex-sections`, require at least one section and treat missing/empty subsection lists as "all subsections"; when subsections are explicitly provided, default to subsection-only docs unless `includeSectionDocuments` is set.
- Keep raw markdown retrieval tools simple (no chunking/pagination).
- Keep chunking + line-based pagination only in `get-codex-document-enriched`.
- In enriched retrieval, linked-document expansion should remain optional and bounded (`maxLinkedDocuments`) to avoid oversized responses.
- Keep rendered/enriched cache keys in a dedicated namespace so they never overwrite raw markdown cache entries.
- Use MiniSearch for fuzzy/full-text ranking in discovery and chunk search.
- Keep cache TTL split: raw markdown 2h, enriched markdown 12h, structure 10m.
- Keep HTML-to-Markdown conversion best-effort in enrichment; never fail the fetch pipeline because conversion fails.
- Keep coverage for HTML normalization with fixture-based tests so HTML detection and conversion behavior stays stable.
- Keep Hugo placeholder replacement strict: match and replace only `{{'<one-char>'}}` placeholders.
- Keep enrichment fetch concurrency bounded to avoid worker hangs from unbounded parallel link processing.
- Keep structure and linked-document cache concerns separate: never block index/search tools on bulk content enrichment.
- Do not introduce dependency injection parameters solely for testability unless explicitly requested.
- Do not introduce dynamic imports for Cloudflare env bindings as a test workaround unless explicitly requested.
- In Vitest, prefer local per-test/per-file mocks (`vi.mock`, `vi.stubGlobal`) over global setup files.

### Common Mistakes to Avoid

<!-- Add things that have been done wrong before and should be avoided -->

- Do not add Vitest `setupFiles` for this project unless explicitly requested.
- Do not refactor runtime APIs to injected parameters unless explicitly requested.
- Do not replace static Cloudflare env imports with dynamic imports unless explicitly requested.
