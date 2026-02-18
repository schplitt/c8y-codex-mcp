# c8y-codex-mcp

Unofficial MCP server for Cumulocity Codex documentation.

This project is a mirror of the official Codex docs at <https://cumulocity.com/codex>.

This project fetches and parses Codex `llms.txt`, enriches linked docs into a deduplicated snapshot, and exposes MCP tools so an LLM can discover and request relevant documentation content.

## What this project does

1. Fetches `https://cumulocity.com/codex/llms.txt`.
2. Parses document structure (`#`, `##`, `###`) and `.md` links.
3. Fetches linked markdown docs with deduplication via a promise cache.
4. Normalizes fetched content:

- first, it tries to detect whether fetched content is HTML
- if detected as HTML, it tries to parse/convert it to Markdown via `@kreuzberg/html-to-markdown-wasm`
- conversion is wrapped in `try/catch`; if detection or conversion is not successful, raw text is kept
- after normalization, single-character Hugo placeholders in the form `{{'<one-char>'}}` are replaced with the literal character
- only one-character placeholders are replaced; multi-character placeholders are preserved

5. Serves the resulting context through MCP tools.

## MCP endpoint

- Route: `GET/POST /mcp` (handled by TMCP HTTP transport)

The root route `GET /` is currently Nitro’s default starter page.

## MCP tools

- `list-codex-documentation`
  - Lists all sections/subsections with titles, descriptions, and links.

- `get-codex-documentations`
  - Input: `urls: string[]`
  - Returns full stored content (or fetch-status error details) for each URL.

- `search-documentation-sections`
  - Input: `patterns: string[]`, optional `limitPerPattern` (1–25, default 8)
  - Uses `fuse.js` fuzzy search over section title + description.
  - Returns matching section names only (no content), including per-pattern groupings.

- `list-documentation-sections`
  - Input: `sections: { title: string; subsections?: string[] }[]`
  - Requires at least one section.
  - If `subsections` is omitted/empty for a section, all subsections for that section are returned.
  - Returns only requested section/subsection content.

## Data model

Snapshot shape:

- `meta`: `builtAt`, `sourceUrl`
- `structure`
  - `title`
  - `description`
  - `sections[]`
    - `title`
    - `description`
    - `links[]` (`title`, `url`)
    - `subsections[]`
      - `title`
      - `description`
      - `links[]` (`title`, `url`)
- `documents[url]`
  - `ok`
  - `content`
  - `statusCode`
  - `statusText`
  - `fetchedAt`
  - `error`

Parsing behavior:

- Keeps only `.md` links.
- Prunes sections/subsections without `.md` links.
- Treats `####+` headings as content within the active `###` subsection.
- Resolves codex-relative links (`#/...`) against codex root.

## Project structure

```text
server/
  routes/
    index.ts
    mcp.ts
  utils/
    c8y/
      index.ts
      parse.ts
      enrich.ts
      resolve.ts
      types.ts
    mcp/
      index.ts
tests/
  llms-parser.test.ts
  enrich-html-conversion.test.ts
  snapshots/
    llms.txt
    html.html
```

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