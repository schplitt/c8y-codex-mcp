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
        description: [
          'ALWAYS call this FIRST before any other tool.',
          'Returns the complete Codex section/subsection map: titles, descriptions, and all linked URLs.',
          'This gives you a full overview of what is available so you can plan exactly which sections and subtopics to fetch.',
          'Without this you will miss relevant subtopics and waste queries on the wrong areas.',
          'The result is cached and fast — there is no cost to calling it first every time.',
        ].join(' '),
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
        description: [
          'Primary retrieval tool. Fetch full raw markdown for one or more URLs at once.',
          'Use after query-codex or get-codex-structure to retrieve discovered URLs.',
          'Choose the returned URLs that are relevant to your task.',
          'Do NOT assume a parent topic document (e.g. /topic) contains content from its subtopics.',
          'If you need a subtopic, fetch that specific subtopic URL (e.g. /topic/subtopic1, /topic/subtopic2) explicitly.',
          'This tool is fast and preferred in almost all cases.',
          'Only fall back to get-codex-document-enriched when content is HTML-rendered and unreadable as plain markdown.',
        ].join(' '),
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
        description: [
          'Keyword-only full-text search (NOT semantic/NLP search).',
          'Use short, specific keyword terms — component names, API names, service names, feature names.',
          'To cover a topic from multiple angles, pass MULTIPLE queries at once (e.g. ["icons", "design system assets"]).',
          'Each query is matched independently; results are merged and deduplicated.',
          'Do NOT combine unrelated terms into a single query string — that will match documents containing ALL those terms and miss relevant results.',
          'Results include section, subsection, and subtopic URLs.',
          'After querying, inspect the returned URLs and fetch the ones relevant to your task with get-codex-documents.',
          'If a needed result is a subtopic URL, fetch that URL directly — parent docs do not include subtopic content.',
          'Only use get-codex-document-enriched as a last resort for pages with HTML-rendered content (e.g. icon lists).',
        ].join(' '),
        inputSchema: {
          queries: z.array(z.string().min(2)).min(1).describe(
            'One or more independent keyword-term sets. Each entry is a space-separated keyword string, e.g. ["icons", "design system assets"]. Run multiple queries to cover different aspects of the same topic.',
          ),
        },
      },
      async ({ queries }) => {
        const normalizedQueries = queries
          .map((q) =>
            q
              .split(/\s+/)
              .map((keyword) => keyword.trim())
              .filter(Boolean)
              .join(' '),
          )
          .filter(Boolean)

        if (normalizedQueries.length === 0) {
          return {
            content: [{ type: 'text', text: 'Provide at least one keyword query in the `queries` array.' }],
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

        // Keep matches grouped per input query so callers can see which keyword set
        // produced which results instead of interpreting one merged result list.
        const queryGroups = normalizedQueries.map((normalizedQuery) => ({
          query: normalizedQuery,
          matches: rankMatchesByQuery(candidates, normalizedQuery, DEFAULT_SEARCH_LIMIT),
        }))

        return {
          content: [{ type: 'text', text: buildQueryCodexOutput(queryGroups) }],
        }
      },
    )

    this.server.registerTool(
      'get-codex-document-enriched',
      {
        title: 'Get Codex Document Enriched',
        description: [
          'LAST RESORT ONLY. Do NOT use this instead of get-codex-documents.',
          'Use exclusively when a page contains HTML-rendered content that is unreadable as plain markdown,',
          'for example: icon galleries, component previews, or tables generated by browser-rendered components.',
          'In 99% of cases get-codex-documents is correct, faster, and more readable.',
          'Only switch to this tool when the plain markdown content clearly lacks visible data',
          '(e.g. an icon list shows as empty because icons are rendered via HTML components).',
          'This tool is expensive: browser-renders the page, caches separately from raw markdown cache.',
          'Supports optional chunk query, line-based pagination, and linked document expansion.',
        ].join(' '),
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
                  '',
                  'Workflow:',
                  '1) ALWAYS start with get-codex-structure. It returns the full section/subsection map with all available URLs. Read it carefully — it tells you what exists and where to look before you query or fetch anything.',
                  '2) Use query-codex with keyword terms only (NOT natural language). Pass MULTIPLE queries at once for different aspects of the same topic, e.g. ["icons", "design system assets"]. Each query is matched independently so do not combine unrelated terms in one query string.',
                  '3) Review all returned matches. Note ALL listed URLs — do NOT skip subtopic URLs.',
                  '4) Fetch ALL relevant URLs with get-codex-documents in a single call. Parent topic docs (/topic) do NOT contain subtopic content — each subtopic (/topic/subtopic1, /topic/subtopic2, ...) must be fetched individually.',
                  '5) Only use get-codex-document-enriched as a LAST RESORT when page content is visibly missing because it is rendered by HTML components in the browser (e.g. icon galleries). In all other cases use get-codex-documents.',
                  '6) get-codex-document-enriched is expensive. Never use it by default or out of habit.',
                  '',
                  'Example: the full icons list may only be visible through enrichment because it is rendered as an HTML component.',
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
