import type {
  CachedDocumentEntry,
  CodexSnapshot,
  DocumentEntry,
  EnrichCodexDocumentWithLinkedMarkdownOptions,
  ParsedCodexDocument,
  ResolveDocumentOptions,
  ResolveDocumentsOptions,
} from './types'
import { createLazyBrowserRenderPool, getMainContentHTMLofPage } from '../browser'
import { htmlToMarkdown } from '../html-parser'
import { createCachedFunction } from '../cache-fn'

const CACHE_KEY_PREFIX = 'c8y:doc:v1:'
const DEFAULT_CACHE_TTL_SECONDS = 60 * 60 * 24
const DEFAULT_CONCURRENCY = 2
const DEFAULT_BROWSER_COUNT = 2
const DEFAULT_PAGES_PER_BROWSER_CONCURRENCY = 6

const resolveBrowserRenderedDocument = createCachedFunction(
  async (
    url: string,
    cacheTtlSeconds: number,
    renderHtml: (url: string) => Promise<string | null>,
  ): Promise<CachedDocumentEntry | null> => {
    const fetchedAt = new Date().toISOString()
    const renderedMainContentHtml = await renderHtml(url)

    if (!renderedMainContentHtml) {
      return null
    }

    return {
      url,
      ok: true,
      content: await htmlToMarkdown(renderedMainContentHtml),
      statusCode: 200,
      statusText: 'OK',
      fetchedAt,
      error: null,
      source: 'browser',
      expiresAt: new Date(Date.now() + cacheTtlSeconds * 1000).toISOString(),
    }
  },
  {
    key: (url) => `${CACHE_KEY_PREFIX}${encodeURIComponent(url)}`,
    maxAge: (_url, cacheTtlSeconds) => cacheTtlSeconds,
    shouldCache: (value) => value !== null,
  },
)

function toDocumentEntry(entry: CachedDocumentEntry): DocumentEntry {
  return {
    ok: entry.ok,
    content: entry.content,
    statusCode: entry.statusCode,
    statusText: entry.statusText,
    fetchedAt: entry.fetchedAt,
    error: entry.error,
  }
}

export async function resolveDocument(
  url: string,
  options: ResolveDocumentOptions = {},
): Promise<DocumentEntry> {
  const cacheTtlSeconds = options.cacheTtlSeconds ?? DEFAULT_CACHE_TTL_SECONDS
  const renderHtml = options.renderHtml ?? getMainContentHTMLofPage
  const cachedEntry = await resolveBrowserRenderedDocument(url, cacheTtlSeconds, renderHtml)

  if (cachedEntry) {
    return toDocumentEntry(cachedEntry)
  }

  const fetchedAt = new Date().toISOString()

  try {
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
}

export async function resolveDocuments(
  urls: string[],
  options: ResolveDocumentsOptions = {},
): Promise<Record<string, DocumentEntry>> {
  const renderPool = createLazyBrowserRenderPool(
    DEFAULT_BROWSER_COUNT,
    DEFAULT_PAGES_PER_BROWSER_CONCURRENCY,
  )

  const dedupedUrls = [...new Set(urls)]
  const concurrency = options.concurrency ?? DEFAULT_CONCURRENCY
  const inFlight = new Map<string, Promise<DocumentEntry>>()

  try {
    const entries = await mapWithConcurrency(
      dedupedUrls,
      concurrency,
      async (url): Promise<[string, DocumentEntry]> => {
        const existingPromise = inFlight.get(url)
        if (existingPromise) {
          return [url, await existingPromise]
        }

        const documentPromise = resolveDocument(url, {
          ...options,
          renderHtml: renderPool.render,
        })
        inFlight.set(url, documentPromise)

        try {
          return [url, await documentPromise]
        } finally {
          inFlight.delete(url)
        }
      },
    )

    return Object.fromEntries(entries)
  } finally {
    await renderPool.close()
  }
}

export async function enrichCodexDocumentWithLinkedMarkdown(
  document: ParsedCodexDocument,
  options: EnrichCodexDocumentWithLinkedMarkdownOptions = {},
): Promise<CodexSnapshot> {
  const allLinks = collectAllLinks(document)
  const documents = await resolveDocuments(allLinks)

  return {
    meta: {
      builtAt: new Date().toISOString(),
      sourceUrl: options.sourceUrl ?? 'unknown',
    },
    structure: document,
    documents,
  }
}

async function mapWithConcurrency<TItem, TResult>(
  items: TItem[],
  concurrency: number,
  mapper: (item: TItem) => Promise<TResult>,
): Promise<TResult[]> {
  if (items.length === 0) {
    return []
  }

  const output = new Array<TResult>(items.length)
  let index = 0

  const workers = new Array(Math.min(concurrency, items.length)).fill(null).map(async () => {
    while (true) {
      const currentIndex = index
      index += 1

      if (currentIndex >= items.length) {
        return
      }

      output[currentIndex] = await mapper(items[currentIndex])
    }
  })

  await Promise.all(workers)
  return output
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
