import { parseCodexLlmsMarkdown } from './parse'
import { enrichCodexDocumentWithLinkedMarkdown } from '../rendering/enrich'
import type { CodexSnapshot, ParsedCodexDocument } from './types'

const DEFAULT_LLMS_URL = 'https://cumulocity.com/codex/llms.txt'

export async function fetchAndParseCodexLlms(
  sourceUrl: string = DEFAULT_LLMS_URL,
): Promise<ParsedCodexDocument> {
  const response = await fetch(sourceUrl)

  if (!response.ok) {
    throw new Error(`Failed to fetch llms markdown from ${sourceUrl} (status ${response.status})`)
  }

  const markdown = await response.text()
  return parseCodexLlmsMarkdown(markdown)
}

export async function fetchParseAndEnrichCodexLlms(
  sourceUrl: string = DEFAULT_LLMS_URL,
): Promise<CodexSnapshot> {
  const parsed = await fetchAndParseCodexLlms(sourceUrl)

  return enrichCodexDocumentWithLinkedMarkdown(parsed, { sourceUrl })
}
