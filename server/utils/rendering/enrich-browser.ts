import type { CachedDocumentEntry, DocumentEntry, ResolveDocumentOptions, ResolveDocumentsOptions } from '../c8y/types'
import { createLazyBrowserRenderPool, getMainContentHTMLofPage } from './browser'
import { htmlToMarkdown } from '../html-parser'
import { createCachedFunction } from '../cache-fn'

const CACHE_KEY_PREFIX = 'c8y:rendered-doc:v2:'
const ENRICHED_CACHE_KEY_PREFIX = 'c8y:rendered-content:v2:'
const DEFAULT_CACHE_TTL_SECONDS = 60 * 60 * 24
const DEFAULT_ENRICHED_CACHE_TTL_SECONDS = 60 * 60 * 12
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

const resolveEnrichedDocumentCached = createCachedFunction(
  async (
    url: string,
    renderHtml: (url: string) => Promise<string | null>,
  ): Promise<DocumentEntry | null> => {
    const fetchedAt = new Date().toISOString()
    const renderedMainContentHtml = await renderHtml(url)

    if (!renderedMainContentHtml) {
      return null
    }

    return {
      ok: true,
      content: await htmlToMarkdown(renderedMainContentHtml),
      statusCode: 200,
      statusText: 'OK',
      fetchedAt,
      error: null,
    }
  },
  {
    key: (url) => `${ENRICHED_CACHE_KEY_PREFIX}${encodeURIComponent(url)}`,
    maxAge: () => DEFAULT_ENRICHED_CACHE_TTL_SECONDS,
    shouldCache: (value) => value !== null && value.ok && !!value.content,
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

export async function resolveEnrichedDocument(
  url: string,
  resolveRawDocument: (url: string) => Promise<DocumentEntry>,
  renderHtml: (url: string) => Promise<string | null> = getMainContentHTMLofPage,
): Promise<DocumentEntry> {
  const cachedEnrichedEntry = await resolveEnrichedDocumentCached(url, renderHtml)
  if (cachedEnrichedEntry) {
    return cachedEnrichedEntry
  }

  return resolveRawDocument(url)
}

export async function resolveEnrichedDocuments(
  urls: string[],
  resolveRawDocument: (url: string) => Promise<DocumentEntry>,
): Promise<Record<string, DocumentEntry>> {
  const renderPool = createLazyBrowserRenderPool(
    DEFAULT_BROWSER_COUNT,
    DEFAULT_PAGES_PER_BROWSER_CONCURRENCY,
  )

  const dedupedUrls = [...new Set(urls)]

  try {
    const entries = await mapWithConcurrency(
      dedupedUrls,
      DEFAULT_CONCURRENCY,
      async (url): Promise<[string, DocumentEntry]> => {
        return [url, await resolveEnrichedDocument(url, resolveRawDocument, renderPool.render)]
      },
    )

    return Object.fromEntries(entries)
  } finally {
    await renderPool.close()
  }
}

export async function resolveDocument(
  url: string,
  resolveRawDocument: (url: string) => Promise<DocumentEntry>,
  options: ResolveDocumentOptions = {},
): Promise<DocumentEntry> {
  const cacheTtlSeconds = options.cacheTtlSeconds ?? DEFAULT_CACHE_TTL_SECONDS
  const renderHtml = options.renderHtml ?? getMainContentHTMLofPage
  const cachedEntry = await resolveBrowserRenderedDocument(url, cacheTtlSeconds, renderHtml)

  if (cachedEntry) {
    return toDocumentEntry(cachedEntry)
  }

  return resolveRawDocument(url)
}

export async function resolveDocuments(
  urls: string[],
  resolveRawDocument: (url: string) => Promise<DocumentEntry>,
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

        const documentPromise = resolveDocument(url, resolveRawDocument, {
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
