# AGENTS.md

## Project Overview

This project is intentionally minimal.

Primary goal:

- fetch Cumulocity Codex `llms.txt`
- parse it into a compact structure model
- enrich linked documentation into a deduplicated snapshot
- expose MCP tools that let an LLM discover section names and request only needed content

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

  It builds a snapshot by fetching section/subsection links with a Promise cache:
  - `cache`: `Map<link, Promise<DocumentEntry>>`
  - repeated links share one in-flight/completed fetch
  - all fetched docs are stored once in `documents[url]` with status metadata

Browser Rendering path:

- `fetchParseAndEnrichCodexLlms` attempts to load `env.MYBROWSER` from `cloudflare:workers`
- when available, it renders each `.md` URL as non-`.md` via `@cloudflare/playwright`
- it extracts `main#main-content` HTML and feeds that into existing HTML→Markdown normalization
- if rendering/extraction is unavailable or fails, enrichment falls back to direct `.md` fetch
- browser sessions are reused via a shared module-level Playwright browser instance

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
│   └── mcp.ts             # MCP HTTP endpoint route
└── utils/
    ├── c8y/
    │   ├── index.ts       # Fetch + parse + enrich entry + cached context
    │   ├── parse.ts       # Markdown parsing into typed section model
    │   ├── enrich.ts      # Linked doc fetch + Promise cache + HTML→Markdown normalization
    │   ├── resolve.ts     # Section/subsection content resolution from snapshot
    │   └── types.ts       # Shared types + snapshot types
    └── mcp/
        └── index.ts       # MCP server + tool definitions
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

- `list-codex-index`
- `get-codex-documents`
- `search-codex-sections` (fuzzy match on section title/description; names only)
- `get-codex-sections` (requested sections; optional subsections per section)

### Runtime

- Nitro server with `srcDir: "server"`
- MCP endpoint served at route `server/routes/mcp.ts`
- Codex context cached with Nitro `defineCachedFunction`

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
- Keep `search-codex-sections` returning section names only (no content), so callers can request content in a follow-up step.
- For `get-codex-sections`, require at least one section and treat missing/empty subsection lists as "all subsections".
- Keep HTML-to-Markdown conversion best-effort in enrichment; never fail the fetch pipeline because conversion fails.
- Keep coverage for HTML normalization with fixture-based tests so HTML detection and conversion behavior stays stable.
- Keep Hugo placeholder replacement strict: match and replace only `{{'<one-char>'}}` placeholders.
- Do not introduce dependency injection parameters solely for testability unless explicitly requested.
- Do not introduce dynamic imports for Cloudflare env bindings as a test workaround unless explicitly requested.
- In Vitest, prefer local per-test/per-file mocks (`vi.mock`, `vi.stubGlobal`) over global setup files.

### Common Mistakes to Avoid

<!-- Add things that have been done wrong before and should be avoided -->

- Do not add Vitest `setupFiles` for this project unless explicitly requested.
- Do not refactor runtime APIs to injected parameters unless explicitly requested.
- Do not replace static Cloudflare env imports with dynamic imports unless explicitly requested.
