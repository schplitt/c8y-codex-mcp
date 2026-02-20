import type {
  CodexSnapshot,
  DocumentEntry,
  EnrichCodexDocumentWithLinkedMarkdownOptions,
  ParsedCodexDocument,
  ResolveDocumentOptions,
  ResolveDocumentsOptions,
} from '../c8y/types'
import { htmlToMarkdown } from '../html-parser'
import { createCachedFunction } from '../cache-fn'
import {
  resolveDocument as resolveBrowserDocument,
  resolveDocuments as resolveBrowserDocuments,
  resolveEnrichedDocument as resolveBrowserEnrichedDocument,
  resolveEnrichedDocuments as resolveBrowserEnrichedDocuments,
} from './enrich-browser'

const RAW_CACHE_KEY_PREFIX = 'c8y:raw:v1:'
const DEFAULT_RAW_CACHE_TTL_SECONDS = 60 * 60 * 2
const DEFAULT_CONCURRENCY = 2

const resolveRawDocumentCached = createCachedFunction(
  async (
    url: string,
  ): Promise<DocumentEntry> => {
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
  },
  {
    key: (url) => `${RAW_CACHE_KEY_PREFIX}${encodeURIComponent(url)}`,
    maxAge: () => DEFAULT_RAW_CACHE_TTL_SECONDS,
    shouldCache: (value) => value.ok && !!value.content,
  },
)

export async function resolveRawDocument(url: string): Promise<DocumentEntry> {
  return resolveRawDocumentCached(url)
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

export async function resolveRawDocuments(urls: string[]): Promise<Record<string, DocumentEntry>> {
  const dedupedUrls = [...new Set(urls)]

  const entries = await mapWithConcurrency(
    dedupedUrls,
    DEFAULT_CONCURRENCY,
    async (url): Promise<[string, DocumentEntry]> => {
      return [url, await resolveRawDocument(url)]
    },
  )

  return Object.fromEntries(entries)
}

export async function resolveEnrichedDocument(
  url: string,
): Promise<DocumentEntry> {
  return resolveBrowserEnrichedDocument(url, resolveRawDocument)
}

export async function resolveEnrichedDocuments(urls: string[]): Promise<Record<string, DocumentEntry>> {
  return resolveBrowserEnrichedDocuments(urls, resolveRawDocument)
}

export async function resolveDocument(
  url: string,
  options: ResolveDocumentOptions = {},
): Promise<DocumentEntry> {
  return resolveBrowserDocument(url, resolveRawDocument, options)
}

export async function resolveDocuments(
  urls: string[],
  options: ResolveDocumentsOptions = {},
): Promise<Record<string, DocumentEntry>> {
  return resolveBrowserDocuments(urls, resolveRawDocument, options)
}

export async function enrichCodexDocumentWithLinkedMarkdown(
  document: ParsedCodexDocument,
  options: EnrichCodexDocumentWithLinkedMarkdownOptions = {},
): Promise<CodexSnapshot> {
  const allLinks = collectAllLinks(document)
  const documents = await resolveRawDocuments(allLinks)

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

      for (const subsubsection of subsection.subsubsections) {
        for (const link of subsubsection.links) {
          allLinks.add(link.url)
        }
      }
    }
  }

  return [...allLinks]
}