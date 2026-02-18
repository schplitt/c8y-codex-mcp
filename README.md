# linkExtractionAndFetching

Minimal utility that fetches Cumulocity Codex `llms.txt`, parses it, builds a deduplicated markdown document store, and returns a snapshot for section/subsection resolution.

## Workflow purpose

This project is used in an automation workflow that:

1. Ingests specific documentation sources.
2. Transforms them into an MCP-ready JSON snapshot.
3. Commits/publishes that JSON to a separate repository used by an MCP server.
4. Lets that MCP server dynamically serve relevant parts of the documentation from the JSON snapshot.

## Daily workflow automation

This Worker uses Cloudflare Workflows plus a cron trigger:

- Cron: `0 12 * * *` (12:00 UTC every day)
- Trigger path: `scheduled` handler creates a Workflow instance
- Workflow class: `DocsSyncWorkflow`

Workflow behavior:

1. Generate the snapshot JSON.
2. Retry snapshot generation up to 3 times.
3. Abort run if snapshot creation still fails.
4. For each target repo, attempt PR sync once (no retries for that step).
5. If a managed PR exists (marker + branch prefix), update it; otherwise create one.

### Managed PR identity

- Title marker: `[auto-c8y-docs]`
- Branch prefix: `auto-c8y-docs-workflow`

Both are used to identify workflow-owned open PRs.

## Worker endpoints

- `GET /` → health/status text.
- `POST /run` → manually start a workflow instance immediately.
- `GET /?instanceId=<id>` → query workflow instance status.

## Configuration

### Required secret

- `GITHUB_TOKEN`: token used by Octokit to update/create PRs.

Dashboard path: Worker -> Settings -> Variables and Secrets -> Secrets.

Set it with Wrangler:

```sh
pnpm wrangler secret put GITHUB_TOKEN
```

### Constants in code

Repository target, branch, JSON file path, PR marker, and branch prefix are constants in [src/workflow/index.ts](src/workflow/index.ts).

## Trying repo updates locally

1. Set `GITHUB_TOKEN` for your local/dev environment.
2. Set target repo vars in `wrangler.jsonc`.
3. Run `pnpm dev`.
4. Trigger a run: `curl -X POST http://localhost:8787/run`.
5. Copy `instanceId` from response.
6. Check status: `curl "http://localhost:8787/?instanceId=<id>"`.
7. Confirm PR was updated/created in target repo.

## Output shape

The snapshot contains:

- `title` (document `#` heading)
- `description` (first paragraph after `#`)
- `sections[]` from `##` headings
  - `title`
  - `description` (first paragraph after `##` and before first `###`)
  - `links[]` extracted from bullet lists in that `##` block
    - `title`
    - `url` (only `.md` links)
  - `subsections[]` from `###` headings
    - `title`
    - `description` (first paragraph after `###`)
    - `links[]` extracted from bullet lists in that `###` block
      - `title`
      - `url` (only `.md` links)

Sections/subsections with no `.md` links are pruned.

`####` and deeper headings do not create new structure levels; their list links are folded into the current `###` subsection.

The returned snapshot object includes:

- `meta` (`builtAt`, `sourceUrl`)
- `structure` (document/sections/subsections/links)
- `documents[url]`:
  - `ok`
  - `content`
  - `statusCode`
  - `statusText`
  - `fetchedAt`
  - `error`

## API

- `fetchParseAndEnrichCodexLlms(sourceUrl?, parseOptions?)`

This is the single public entry from `src/index.ts` and returns structure + documents snapshot in one call.

Internal helpers used by tests/MCP layer:

- `parseCodexLlmsMarkdown(...)`
- `enrichCodexDocumentWithLinkedMarkdown(...)`
- `resolveSectionMarkdown(snapshot, sectionTitle)`
- `resolveSubsectionMarkdown(snapshot, sectionTitle, subsectionTitle)`

Default source URL:

- `https://cumulocity.com/codex/llms.txt`

## Notes

- Uses `markdown-exit` token parsing.
- Resolves codex-relative links (including `#/...`) against codex root.
- Uses Promise-cache deduplication (`Map<link, Promise<DocumentEntry>>`) internally during enrichment.
- Keeps fetch failures in `documents[url]` status metadata instead of throwing.
- Keeps parsing rules intentionally minimal and deterministic.

## Development

```sh
pnpm install
pnpm test:run
pnpm lint
pnpm typecheck
```

## Testing

- `pnpm test` runs Vitest in watch mode via the root `vitest.config.ts`.
- `pnpm test:run` runs once (non-watch) via the same root config.
- The root config uses Vitest projects:
  - `tests/vitest.unit.config.ts` for Node/unit tests (`tests/unit/**`)
  - `tests/vitest.workers.config.ts` for Cloudflare Workers tests (`tests/workers/**`)