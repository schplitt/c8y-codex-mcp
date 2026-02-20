import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { McpAgent } from 'agents/mcp'
import * as z from 'zod'
import pkgjson from '../../../package.json'
import {
  useCodexEnrichedDocuments,
  useCodexRawDocuments,
  useCodexStructure,
} from '../cached'
import {
  collectLinkedUrlsFromDocuments,
  extractCodexMarkdownLinks,
  normalizeCodexLinkToMarkdown,
  toHumanReadableCodexUrl,
} from '../c8y/links'
import { chunkMarkdownByHeadings, searchChunks, sliceLines, splitChunksByLines } from '../rendering/chunk'
import { buildQueryCodexOutput, formatStructureMarkdown, resolveLinkedDocument } from './format'
import { buildSearchCandidates, collectAllStructureUrls, rankMatchesByQuery } from './search'

const DEFAULT_SEARCH_LIMIT = 5
const DEFAULT_QUERY_MAX_LINKED_DOCS = 160
const DEFAULT_CONTENT_CONFIDENCE = 80
const DEFAULT_ENRICHED_CHUNK_MAX_LINES = 80
const DEFAULT_ENRICHED_MAX_LINES = 100
const MAX_ENRICHED_MAX_LINES = 250
const DEFAULT_ENRICHED_LINKED_DOCS = 8
const MAX_ENRICHED_LINKED_DOCS = 20

function normalizeThreshold(confidenceThreshold?: number): number {
  if (!confidenceThreshold || Number.isNaN(confidenceThreshold)) {
    return DEFAULT_CONTENT_CONFIDENCE
  }

  return Math.min(99, Math.max(50, confidenceThreshold))
}

function normalizeTopK(topK?: number): number {
  if (!topK || Number.isNaN(topK)) {
    return 3
  }

  return Math.min(10, Math.max(1, topK))
}

function normalizeMaxLines(maxLines?: number): number {
  if (!maxLines || Number.isNaN(maxLines)) {
    return DEFAULT_ENRICHED_MAX_LINES
  }

  return Math.min(MAX_ENRICHED_MAX_LINES, Math.max(1, maxLines))
}

function normalizeMaxLinkedDocuments(maxLinkedDocuments?: number): number {
  if (!maxLinkedDocuments || Number.isNaN(maxLinkedDocuments)) {
    return DEFAULT_ENRICHED_LINKED_DOCS
  }

  return Math.min(MAX_ENRICHED_LINKED_DOCS, Math.max(1, maxLinkedDocuments))
}

function toFetchUrl(url: string): string {
  return normalizeCodexLinkToMarkdown(url) ?? url
}

export class CodexMcpAgent extends McpAgent {
  server = new McpServer({
    name: pkgjson.name,
    version: pkgjson.version,
    description: pkgjson.description,
  })

  async init() {
    this.server.registerTool(
      'get-codex-structure',
      {
        title: 'Get Codex Structure',
        description: 'Use this first for broad discovery. Returns the complete Codex section/subsection map with links, titles, and descriptions from the shared structure cache.',
      },
      async () => {
        const structure = await useCodexStructure()

        return {
          content: [{ type: 'text', text: formatStructureMarkdown(structure) }],
        }
      },
    )

    this.server.registerTool(
      'get-codex-documents',
      {
        title: 'Get Codex Documents',
        description: 'Fetch full raw markdown by URL when you already know the exact doc links. Prefer query-codex or get-codex-structure first to discover relevant URLs.',
        inputSchema: {
          urls: z.array(z.string()),
        },
      },
      async ({ urls }) => {
        const fetchEntries = urls.map((inputUrl) => ({
          inputUrl,
          fetchUrl: toFetchUrl(inputUrl),
        }))

        const documents = await useCodexRawDocuments(fetchEntries.map((entry) => entry.fetchUrl))

        let resultMD = '# Codex Documents\n\n'
        for (const entry of fetchEntries) {
          const documentEntry = documents[entry.fetchUrl]
          resultMD += `# Document: ${toHumanReadableCodexUrl(entry.inputUrl)}\n\n`
          resultMD += `${resolveLinkedDocument(documentEntry, toHumanReadableCodexUrl(entry.inputUrl))}\n\n`
        }

        return {
          content: [{ type: 'text', text: resultMD }],
        }
      },
    )

    this.server.registerTool(
      'query-codex',
      {
        title: 'Query Codex',
        description: 'Primary discovery tool. Keyword search only (not natural-language questions). Use short terms like component names, APIs, service names, and features, then fetch details via get-codex-documents.',
        inputSchema: {
          query: z.string().min(2).describe('Space-separated keyword terms only, for example: "services app-state permissions".'),
        },
      },
      async ({ query }) => {
        const normalizedQuery = query
          .split(/\s+/)
          .map((keyword) => keyword.trim())
          .filter(Boolean)
          .join(' ')

        if (!normalizedQuery) {
          return {
            content: [{ type: 'text', text: 'Provide keyword search input via `query` as a space-separated string.' }],
            isError: true,
          }
        }

        const structure = await useCodexStructure()
        const structureFetchUrls = collectAllStructureUrls(structure).map(toFetchUrl)
        const baseDocuments = await useCodexRawDocuments(structureFetchUrls)
        const linkedUrls = collectLinkedUrlsFromDocuments(baseDocuments, DEFAULT_QUERY_MAX_LINKED_DOCS)
        const linkedDocuments = linkedUrls.length > 0
          ? await useCodexRawDocuments(linkedUrls.map(toFetchUrl))
          : {}
        const candidates = buildSearchCandidates(structure, {
          ...baseDocuments,
          ...linkedDocuments,
        })
        const matches = rankMatchesByQuery(candidates, normalizedQuery, DEFAULT_SEARCH_LIMIT)

        return {
          content: [{ type: 'text', text: buildQueryCodexOutput(normalizedQuery, matches) }],
        }
      },
    )

    this.server.registerTool(
      'get-codex-document-enriched',
      {
        title: 'Get Codex Document Enriched',
        description: 'Expensive fallback tool: browser-rendered enriched markdown with optional chunk query and line-based retrieval. Uses separate rendered cache keys from raw markdown cache.',
        inputSchema: {
          url: z.string(),
          query: z.string().optional(),
          confidenceThreshold: z.number().int().min(50).max(99).optional(),
          topK: z.number().int().min(1).max(10).optional(),
          includeLinkedDocuments: z.boolean().optional(),
          maxLinkedDocuments: z.number().int().min(1).max(MAX_ENRICHED_LINKED_DOCS).optional(),
          startLine: z.number().int().min(1).optional(),
          endLine: z.number().int().min(1).optional(),
          maxLines: z.number().int().min(1).max(MAX_ENRICHED_MAX_LINES).optional(),
        },
      },
      async ({ url, query, confidenceThreshold, topK, includeLinkedDocuments, maxLinkedDocuments, startLine, endLine, maxLines }) => {
        const fetchUrl = toFetchUrl(url)
        const enrichedDocuments = await useCodexEnrichedDocuments([fetchUrl])
        const entry = enrichedDocuments[fetchUrl]

        if (!entry?.ok || !entry.content) {
          return {
            content: [{ type: 'text', text: `# Enriched Document: ${toHumanReadableCodexUrl(url)}\n\n${resolveLinkedDocument(entry, toHumanReadableCodexUrl(url))}` }],
            isError: true,
          }
        }

        const content = entry.content
        const lines = content.split('\n')
        const totalLines = lines.length
        const effectiveStartLine = startLine ?? 1

        let effectiveEndLine: number
        let nextStartLine: number | null = null

        if (typeof endLine === 'number') {
          effectiveEndLine = Math.max(effectiveStartLine, endLine)
        } else {
          const effectiveMaxLines = normalizeMaxLines(maxLines)
          effectiveEndLine = Math.min(totalLines, effectiveStartLine + effectiveMaxLines - 1)
          nextStartLine = effectiveEndLine < totalLines ? effectiveEndLine + 1 : null
        }

        const selectedContent = sliceLines(content, effectiveStartLine, effectiveEndLine)

        let resultMD = `# Enriched Document: ${toHumanReadableCodexUrl(url)}\n\n`
        resultMD += `- totalLines: ${totalLines}\n`
        resultMD += `- startLine: ${effectiveStartLine}\n`
        resultMD += `- endLine: ${effectiveEndLine}\n`
        resultMD += `- returnedLines: ${Math.max(0, effectiveEndLine - effectiveStartLine + 1)}\n`
        resultMD += `- nextStartLine: ${nextStartLine === null ? 'null' : nextStartLine}\n\n`

        if (query && query.trim()) {
          const matches = searchChunks(
            splitChunksByLines(
              chunkMarkdownByHeadings(content),
              DEFAULT_ENRICHED_CHUNK_MAX_LINES,
            ),
            query,
            normalizeThreshold(confidenceThreshold),
            normalizeTopK(topK),
          )

          resultMD += `## Query Matches: ${query}\n\n`
          if (matches.length === 0) {
            resultMD += '- No chunk matches above confidence threshold.\n\n'
          } else {
            for (const match of matches) {
              resultMD += `- ${match.chunk.heading} — lines ${match.chunk.startLine}-${match.chunk.endLine}\n`
            }
            resultMD += '\n'
          }
        }

        resultMD += '## Content\n\n'
        resultMD += `${selectedContent}\n`

        if (includeLinkedDocuments) {
          const linkedUrls = extractCodexMarkdownLinks(content)
            .filter((linkedUrl) => linkedUrl !== url)
            .slice(0, normalizeMaxLinkedDocuments(maxLinkedDocuments))

          if (linkedUrls.length > 0) {
            const linkedFetchUrls = linkedUrls.map(toFetchUrl)
            const linkedDocuments = await useCodexRawDocuments(linkedFetchUrls)
            resultMD += '\n## Linked Documents\n\n'

            for (let index = 0; index < linkedUrls.length; index += 1) {
              const linkedUrl = linkedUrls[index]!
              const linkedFetchUrl = linkedFetchUrls[index]!
              resultMD += `### ${toHumanReadableCodexUrl(linkedUrl)}\n`
              resultMD += `${resolveLinkedDocument(linkedDocuments[linkedFetchUrl], toHumanReadableCodexUrl(linkedUrl))}\n\n`
            }
          }
        }

        return {
          content: [{ type: 'text', text: resultMD }],
        }
      },
    )

    this.server.registerPrompt(
      'codex-query-workflow',
      {
        title: 'Codex Query Workflow',
        description: 'Reusable prompt template for discovering and retrieving Codex docs through MCP tools.',
        argsSchema: {
          question: z.string().optional(),
        },
      },
      async ({ question }) => {
        const normalizedQuestion = question?.trim()

        return {
          description: 'Prompt for querying Cumulocity Codex through MCP tools in a deterministic flow.',
          messages: [
            {
              role: 'user',
              content: {
                type: 'text',
                text: [
                  'You are querying Cumulocity Codex documentation via MCP.',
                  'Workflow:',
                  '1) Start with query-codex using keyword terms only (not natural language).',
                  '2) Review top matches and collect target links with get-codex-links.',
                  '3) Fetch details with get-codex-documents using those links.',
                  '4) Do not use section/subsection retrieval; link-level retrieval is the supported flow.',
                  '5) Use get-codex-document-enriched only as a rare fallback when content appears as HTML components in docs.',
                  '6) Enrichment is very expensive; avoid it unless needed.',
                  '7) Example: the full icons list may only be visible through enrichment because it is rendered as an HTML component.',
                  normalizedQuestion ? `User question: ${normalizedQuestion}` : 'User question: (provide the current question)',
                ].join('\n'),
              },
            },
          ],
        }
      },
    )
  }
}
