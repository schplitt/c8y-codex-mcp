import type { DocumentEntry } from './types'

const DEFAULT_CODEX_ROOT_URL = 'https://cumulocity.com/codex/'

function toMarkdownUrl(url: string): string {
  return url.endsWith('.md') ? url : `${url}.md`
}

export function toHumanReadableCodexUrl(url: string): string {
  try {
    const parsedUrl = new URL(url)
    if (parsedUrl.pathname.endsWith('.md')) {
      parsedUrl.pathname = parsedUrl.pathname.slice(0, -3)
    }

    return parsedUrl.toString()
  } catch {
    return url
  }
}

export function normalizeCodexLinkToMarkdown(rawUrl: string, codexRootUrl = DEFAULT_CODEX_ROOT_URL): string | null {
  const trimmed = rawUrl.trim()
  if (!trimmed) {
    return null
  }

  if (trimmed.startsWith('#/')) {
    return toMarkdownUrl(new URL(trimmed.slice(2), codexRootUrl).toString())
  }

  if (trimmed.startsWith('/')) {
    return toMarkdownUrl(new URL(trimmed.slice(1), codexRootUrl).toString())
  }

  if (/^https?:\/\//i.test(trimmed)) {
    if (!trimmed.startsWith(codexRootUrl)) {
      return null
    }

    return toMarkdownUrl(trimmed)
  }

  return null
}

export function extractCodexMarkdownLinks(markdown: string, codexRootUrl = DEFAULT_CODEX_ROOT_URL): string[] {
  const links = new Set<string>()
  const regex = /\[[^\]]+\]\(([^)]+)\)/g

  for (const match of markdown.matchAll(regex)) {
    const href = match[1]?.trim()
    if (!href) {
      continue
    }

    const normalized = normalizeCodexLinkToMarkdown(href, codexRootUrl)
    if (normalized) {
      links.add(normalized)
    }
  }

  return [...links]
}

export function collectLinkedUrlsFromDocuments(
  documents: Record<string, DocumentEntry | undefined>,
  maxLinks: number,
): string[] {
  const links = new Set<string>()
  const knownUrls = new Set(Object.keys(documents))
  const safeMaxLinks = Math.max(1, maxLinks)

  for (const entry of Object.values(documents)) {
    if (!entry?.ok || !entry.content) {
      continue
    }

    const documentLinks = extractCodexMarkdownLinks(entry.content)
    for (const url of documentLinks) {
      if (!knownUrls.has(url)) {
        links.add(url)
      }

      if (links.size >= safeMaxLinks) {
        return [...links]
      }
    }
  }

  return [...links]
}
