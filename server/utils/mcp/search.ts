import MiniSearch from 'minisearch'
import type { DocumentEntry, ParsedCodexDocument } from '../c8y/types'
import { extractCodexMarkdownLinks } from '../c8y/links'

export type SearchMatchType = 'section' | 'subsection' | 'subsubsection'

export interface SearchCandidate {
  matchType: SearchMatchType
  title: string
  description: string
  sectionTitle: string
  subsectionTitle: string | null
  urls: string[]
}

export interface SearchIndexRecord extends SearchCandidate {
  id: string
  content: string
}

export interface RankedSearchMatch {
  candidate: SearchCandidate
  confidence: number
  score: number
  snippet: string | null
  matchSource: 'metadata' | 'content'
}

export function normalizeMiniSearchScoreToConfidence(score: number, topScore: number): number {
  if (score <= 0 || topScore <= 0) {
    return 0
  }

  return Math.max(0, Math.min(100, Math.round((score / topScore) * 100)))
}

function toQueryTokens(query: string): string[] {
  return query
    .toLowerCase()
    .split(/\s+/)
    .map((token) => token.trim())
    .filter(Boolean)
}

function hasTokenHit(text: string, queryTokens: string[]): boolean {
  if (!text) {
    return false
  }

  const normalized = text.toLowerCase()
  return queryTokens.some((token) => normalized.includes(token))
}

function toContentSnippet(content: string, queryTokens: string[]): string | null {
  if (!content.trim()) {
    return null
  }

  const lines = content.split('\n')
  const matchingLine = lines.find((line) => {
    const normalized = line.toLowerCase()
    return queryTokens.some((token) => normalized.includes(token))
  })

  if (!matchingLine) {
    return null
  }

  return matchingLine.trim().slice(0, 220)
}

function collectLinkedContent(urls: string[], documents: Record<string, DocumentEntry | undefined>): string {
  const contentParts: string[] = []
  const seenUrls = new Set<string>()

  for (const url of urls) {
    const entry = documents[url]
    if (!entry?.ok || !entry.content) {
      continue
    }

    contentParts.push(entry.content)
    seenUrls.add(url)

    const linkedUrls = extractCodexMarkdownLinks(entry.content)
    for (const linkedUrl of linkedUrls) {
      if (seenUrls.has(linkedUrl)) {
        continue
      }

      const linkedEntry = documents[linkedUrl]
      if (!linkedEntry?.ok || !linkedEntry.content) {
        continue
      }

      contentParts.push(linkedEntry.content)
      seenUrls.add(linkedUrl)
    }
  }

  return contentParts.join('\n\n')
}

export function collectAllStructureUrls(structure: ParsedCodexDocument): string[] {
  const urls = new Set<string>()

  for (const section of structure.sections) {
    for (const link of section.links) {
      urls.add(link.url)
    }

    for (const subsection of section.subsections) {
      for (const link of subsection.links) {
        urls.add(link.url)
      }

      for (const subsubsection of subsection.subsubsections) {
        for (const link of subsubsection.links) {
          urls.add(link.url)
        }
      }
    }
  }

  return [...urls]
}

export function buildSearchCandidates(
  structure: ParsedCodexDocument,
  documents: Record<string, DocumentEntry | undefined>,
): SearchIndexRecord[] {
  const candidates: SearchIndexRecord[] = []

  for (const section of structure.sections) {
    const sectionUrls = section.links.map((link) => link.url)
    candidates.push({
      id: `section:${section.title}`,
      matchType: 'section',
      title: section.title,
      description: section.description,
      sectionTitle: section.title,
      subsectionTitle: null,
      urls: sectionUrls,
      content: collectLinkedContent(sectionUrls, documents),
    })

    for (const subsection of section.subsections) {
      const subsectionUrls = subsection.links.map((link) => link.url)
      candidates.push({
        id: `subsection:${section.title}:${subsection.title}`,
        matchType: 'subsection',
        title: subsection.title,
        description: subsection.description,
        sectionTitle: section.title,
        subsectionTitle: subsection.title,
        urls: subsectionUrls,
        content: collectLinkedContent(subsectionUrls, documents),
      })

      for (const subsubsection of subsection.subsubsections) {
        const subsubsectionUrls = subsubsection.links.map((link) => link.url)
        candidates.push({
          id: `subsubsection:${section.title}:${subsection.title}:${subsubsection.title}`,
          matchType: 'subsubsection',
          title: subsubsection.title,
          description: subsubsection.description,
          sectionTitle: section.title,
          subsectionTitle: subsection.title,
          urls: subsubsectionUrls,
          content: collectLinkedContent(subsubsectionUrls, documents),
        })
      }
    }
  }

  return candidates
}

export function rankMatchesByQuery(
  candidates: SearchIndexRecord[],
  query: string,
  limit: number,
): RankedSearchMatch[] {
  if (!query.trim() || candidates.length === 0) {
    return []
  }

  const search = new MiniSearch<SearchIndexRecord>({
    idField: 'id',
    fields: ['title', 'description', 'sectionTitle', 'content'],
    storeFields: ['matchType', 'title', 'description', 'sectionTitle', 'subsectionTitle', 'urls', 'content'],
  })

  search.addAll(candidates)

  const results = search.search(query, {
    prefix: true,
    fuzzy: 0.2,
    boost: {
      title: 4,
      description: 3,
      sectionTitle: 2,
      content: 1,
    },
    combineWith: 'OR',
  })

  const topScore = results[0]?.score ?? 0
  const queryTokens = toQueryTokens(query)

  return results
    .map((match) => {
      const score = match.score ?? 0
      const title = String(match.title ?? '')
      const description = String(match.description ?? '')
      const sectionTitle = String(match.sectionTitle ?? '')
      const snippet = toContentSnippet(String(match.content ?? ''), queryTokens)
      const metadataHit = hasTokenHit(title, queryTokens)
        || hasTokenHit(description, queryTokens)
        || hasTokenHit(sectionTitle, queryTokens)

      return {
        candidate: {
          matchType: match.matchType as SearchMatchType,
          title,
          description,
          sectionTitle,
          subsectionTitle: match.subsectionTitle ? String(match.subsectionTitle) : null,
          urls: Array.isArray(match.urls) ? match.urls.map((url) => String(url)) : [],
        },
        score,
        confidence: normalizeMiniSearchScoreToConfidence(score, topScore),
        snippet,
        matchSource: (!metadataHit && snippet ? 'content' : 'metadata') as 'content' | 'metadata',
      }
    })
    .sort((left, right) => {
      if (right.confidence !== left.confidence) {
        return right.confidence - left.confidence
      }

      if (left.candidate.title !== right.candidate.title) {
        return left.candidate.title.localeCompare(right.candidate.title)
      }

      return left.candidate.sectionTitle.localeCompare(right.candidate.sectionTitle)
    })
    .slice(0, Math.max(1, limit))
}
