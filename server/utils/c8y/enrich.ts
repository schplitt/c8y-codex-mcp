import type {
  CodexSnapshot,
  DocumentEntry,
  EnrichCodexDocumentWithLinkedMarkdownOptions,
  LinkedMarkdownPromiseCache,
  ParsedCodexDocument,
} from './types'
import { getMainContentHTMLofPage } from '../browser'
import { htmlToMarkdown } from '../html-parser'

export async function enrichCodexDocumentWithLinkedMarkdown(
  document: ParsedCodexDocument,
  options: EnrichCodexDocumentWithLinkedMarkdownOptions = {},
): Promise<CodexSnapshot> {
  const cache: LinkedMarkdownPromiseCache = new Map<string, Promise<DocumentEntry>>()
  const allLinks = collectAllLinks(document)

  const getLinkedMarkdown = (url: string): Promise<DocumentEntry> => {
    const cachedPromise = cache.get(url)

    if (cachedPromise) {
      return cachedPromise
    }

    const pendingPromise = (async (): Promise<DocumentEntry> => {
      const fetchedAt = new Date().toISOString()

      try {
        const renderedMainContentHtml = await getMainContentHTMLofPage(url)

        if (renderedMainContentHtml) {
          return {
            ok: true,
            content: await htmlToMarkdown(renderedMainContentHtml),
            statusCode: 200,
            statusText: 'OK',
            fetchedAt,
            error: null,
          }
        }

        const response = await fetch(url)

        if (!response.ok) {
          return {
            ok: false,
            content: null,
            statusCode: response.status,
            statusText: response.statusText || null,
            fetchedAt,
            error: null,
          }
        }

        return {
          ok: true,
          content: await htmlToMarkdown(await response.text()),
          statusCode: response.status,
          statusText: response.statusText || null,
          fetchedAt,
          error: null,
        }
      } catch (error) {
        return {
          ok: false,
          content: null,
          statusCode: null,
          statusText: null,
          fetchedAt,
          error: error instanceof Error ? error.message : String(error),
        }
      }
    })()

    cache.set(url, pendingPromise)
    return pendingPromise
  }

  const entries = await Promise.all(allLinks.map(async (url): Promise<[string, DocumentEntry]> => {
    const entry = await getLinkedMarkdown(url)
    return [url, entry]
  }))

  const documents = Object.fromEntries(entries)

  return {
    meta: {
      builtAt: new Date().toISOString(),
      sourceUrl: options.sourceUrl ?? 'unknown',
    },
    structure: document,
    documents,
  }
}

function collectAllLinks(document: ParsedCodexDocument): string[] {
  const allLinks = new Set<string>()

  for (const section of document.sections) {
    for (const link of section.links) {
      allLinks.add(link.url)
    }

    for (const subsection of section.subsections) {
      for (const link of subsection.links) {
        allLinks.add(link.url)
      }
    }
  }

  return [...allLinks]
}
