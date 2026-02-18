import { enrichCodexDocumentWithLinkedMarkdown } from './enrich'
import { parseCodexLlmsMarkdown } from './parse'
import type { CodexSnapshot } from './types'

const DEFAULT_LLMS_URL = 'https://cumulocity.com/codex/llms.txt'

export async function fetchParseAndEnrichCodexLlms(
  sourceUrl: string = DEFAULT_LLMS_URL,
): Promise<CodexSnapshot> {
  const response = await fetch(sourceUrl)

  if (!response.ok) {
    throw new Error(`Failed to fetch llms markdown from ${sourceUrl} (status ${response.status})`)
  }

  const markdown = await response.text()
  const parsed = parseCodexLlmsMarkdown(markdown)

  return enrichCodexDocumentWithLinkedMarkdown(parsed, { sourceUrl })
}
