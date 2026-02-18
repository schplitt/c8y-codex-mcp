# AGENTS.md

## Project Overview

This project is intentionally minimal.

Primary goal:

- run a workflow that ingests specific documentation
- transform it into an MCP-ready JSON snapshot
- commit/publish that JSON to a separate repository used by an MCP server
- let the MCP server dynamically serve relevant documentation parts from that JSON

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

## Architecture

```
src/
├── c8y/
│   ├── index.ts           # C8Y parse/enrich public entry
│   ├── parse.ts           # Markdown parsing into typed section model
│   ├── enrich.ts          # Linked markdown fetch + Promise cache snapshot builder
│   ├── resolve.ts         # Section/subsection content resolution from snapshot
│   └── types.ts           # Shared types + snapshot types
├── workflow/
│   ├── index.ts           # Workflow entrypoint + runtime config
│   ├── snapshot.ts        # Snapshot JSON generation + retry policy
│   ├── github.ts          # Octokit PR update/create sync logic
│   └── types.ts           # Workflow payload and result types
└── index.ts               # Root package entry point
tests/
├── unit/
│   ├── llms-parser.test.ts
│   └── snapshots/
│       └── llms.txt
├── workers/
│   └── index.spec.ts
├── vitest.unit.config.ts
└── vitest.workers.config.ts
```

### Parsing

- Use `markdown-exit` for markdown parsing.
- Resolve relative codex links (for example `#/advanced-development/...`) against codex root.
- Parse headings up to `###`; treat `####` and deeper as same-level content for the current `###` subsection (do not create deeper structure levels).
- Extract section links from `##` blocks and subsection links from `###` blocks.
- Keep only `.md` links and prune empty sections/subsections.
- Store fetch failures as status metadata in `documents[url]` (non-fail-hard).
- Keep output shape simple and stable for MCP-style consumption.

### Tests (tests/)

- Uses Vitest for testing
- Unit tests are in `tests/unit/**` and worker tests are in `tests/workers/**`
- Use Vitest projects from root `vitest.config.ts`
- Worker tests must use Cloudflare's workers project config so `cloudflare:test` resolves at runtime

### Vitest Projects Setup

- Keep root `vitest.config.ts` as the single test entry point.
- Configure two projects:
  - Node/unit project from `tests/vitest.unit.config.ts`
  - Cloudflare workers project from `tests/vitest.workers.config.ts`
- In projects mode, prefer `defineWorkersProject` for workers-specific config.
- Keep `test` and `test:run` scripts pointing to the root config only.

## Development

```sh
pnpm install    # Install dependencies
pnpm test:run   # Run tests
pnpm build      # Build with tsdown
pnpm lint       # Lint with ESLint
pnpm lint:fix   # Lint and auto-fix
pnpm typecheck  # TypeScript type checking
```

## Code Style

- ESM only (`"type": "module"`)
- TypeScript strict mode enabled
- Uses `tsdown` for building
- Uses `@schplitt/eslint-config` for linting
- Uses `vitest` for testing

## Cloudflare Workers

**⚠️ Important:** Knowledge of Cloudflare Workers APIs and limits may be outdated. Always retrieve current documentation before any Workers, KV, R2, D1, Durable Objects, Queues, Vectorize, AI, or Agents SDK task.

### Documentation

- [Cloudflare Workers](https://developers.cloudflare.com/workers/)
- [Model Context Protocol (MCP)](https://docs.mcp.cloudflare.com/mcp)

### Commands

| Command               | Purpose                   |
| --------------------- | ------------------------- |
| `npx wrangler dev`    | Local development         |
| `npx wrangler deploy` | Deploy to Cloudflare      |
| `npx wrangler types`  | Generate TypeScript types |

Run `wrangler types` after changing bindings in `wrangler.jsonc`.

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
- Run `pnpm test:run` for running tests
- Import modules from `../src`

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

1. **Run tests** after making changes: `pnpm test:run` (runs once, no watch mode)
2. **Run linting** to ensure code quality: `pnpm lint`
3. **Run type checking** before committing: `pnpm typecheck`
4. **Update this file** when adding new modules, APIs, or changing architecture
5. **Keep exports in `src/index.ts`** — all public API should be exported from the main entry point
6. **Add tests** for new functionality in the `tests/` directory
7. **Record learnings** — When the user corrects a mistake or provides context about how something should be done, add it to the "Project Context & Learnings" section below if it's a recurring pattern (not a one-time fix)
8. **Notify documentation changes** — When updating `README.md` or `AGENTS.md`, explicitly call out the changes to the user at the end of your response so they can review and don't overlook them

## Project Context & Learnings

This section captures project-specific knowledge, tool quirks, and lessons learned during development. When the user provides corrections or context about how things should be done in this project, add them here if they are recurring patterns (not a one-time fix).

> **Note:** Before adding something here, consider: Is this a one-time fix, or will it come up again? Only document patterns that are likely to recur or are notable enough to prevent future mistakes.

### Tools & Dependencies

<!-- Add tool-specific notes, required configurations, or gotchas here -->

### Patterns & Conventions

- Keep `src/index.ts` as the single public entry point.
- Keep parser, enrichment, resolver, and workflow logic in separate focused modules.
- Keep data model minimal: structure graph + deduplicated `documents[url]` store.
- Keep test/project configs under `tests/` to avoid root clutter, while root `vitest.config.ts` remains the single entry.
- Keep workflow repo target/marker/source settings configurable via env vars with safe defaults in `wrangler.jsonc`.
- Keep PR ownership detection based on both title marker and branch prefix (not actor identity).

### Common Mistakes to Avoid

<!-- Add things that have been done wrong before and should be avoided -->
