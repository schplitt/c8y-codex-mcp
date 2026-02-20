import { describe, expect, test } from 'vitest'

import {
  buildSearchCandidates,
  normalizeMiniSearchScoreToConfidence,
  rankMatchesByQuery,
} from '../server/utils/mcp/search'
import {
  collectRequestedSectionUrls,
  getSectionQueryIncludeDocumentsDefault,
} from '../server/utils/mcp/sections'
import { chunkMarkdownByHeadings, searchChunks, sliceLines } from '../server/utils/c8y/chunk'
import type { DocumentEntry, ParsedCodexDocument, ParsedSection } from '../server/utils/c8y/types'

const structure: ParsedCodexDocument = {
  title: 'Codex',
  description: 'Root',
  sections: [
    {
      title: 'Design System',
      description: 'Design foundations and assets',
      links: [{ title: 'Design System Overview', url: 'https://example.com/design-system.md' }],
      subsections: [
        {
          title: 'Icons',
          description: 'Icon sets and usage',
          links: [{ title: 'Icons', url: 'https://example.com/icons.md' }],
          subsubsections: [],
        },
      ],
    },
    {
      title: 'Components',
      description: 'UI components catalog',
      links: [{ title: 'Components', url: 'https://example.com/components.md' }],
      subsections: [],
    },
  ],
}

const documents: Record<string, DocumentEntry | undefined> = {
  'https://example.com/design-system.md': {
    ok: true,
    statusCode: 200,
    statusText: 'OK',
    content: 'Design tokens and foundations including spacing primitives.',
    fetchedAt: '2026-01-01T00:00:00.000Z',
    error: null,
  },
  'https://example.com/icons.md': {
    ok: true,
    statusCode: 200,
    statusText: 'OK',
    content: 'Use c8y-icon and icon aliases for semantic actions.',
    fetchedAt: '2026-01-01T00:00:00.000Z',
    error: null,
  },
  'https://example.com/components.md': {
    ok: true,
    statusCode: 200,
    statusText: 'OK',
    content: 'Button variants and input controls.',
    fetchedAt: '2026-01-01T00:00:00.000Z',
    error: null,
  },
}

describe('normalizeMiniSearchScoreToConfidence', () => {
  test('converts relative MiniSearch score to rounded confidence percentage', () => {
    expect(normalizeMiniSearchScoreToConfidence(5, 5)).toBe(100)
    expect(normalizeMiniSearchScoreToConfidence(2.5, 5)).toBe(50)
    expect(normalizeMiniSearchScoreToConfidence(0, 5)).toBe(0)
  })
})

describe('buildSearchCandidates', () => {
  test('creates section and subsection candidates with metadata and linked content', () => {
    const candidates = buildSearchCandidates(structure, documents)

    expect(candidates.some((candidate) => candidate.matchType === 'section' && candidate.title === 'Design System')).toBe(true)
    expect(candidates.some((candidate) => candidate.matchType === 'subsection' && candidate.title === 'Icons' && candidate.sectionTitle === 'Design System')).toBe(true)
    expect(candidates.find((candidate) => candidate.title === 'Icons')?.content).toContain('c8y-icon')
  })
})

describe('rankMatchesByQuery', () => {
  test('returns ranked matches with non-increasing confidence', () => {
    const candidates = buildSearchCandidates(structure, documents)
    const matches = rankMatchesByQuery(candidates, 'icons', 5)

    expect(matches.length).toBeGreaterThan(0)
    expect(matches[0]?.candidate.title).toContain('Icons')

    for (let index = 1; index < matches.length; index += 1) {
      expect(matches[index - 1]!.confidence).toBeGreaterThanOrEqual(matches[index]!.confidence)
    }
  })

  test('matches content-only terms from linked document text', () => {
    const candidates = buildSearchCandidates(structure, documents)
    const matches = rankMatchesByQuery(candidates, 'aliases semantic actions', 5)

    expect(matches.length).toBeGreaterThan(0)
    expect(matches[0]?.candidate.title).toBe('Icons')
    expect(matches[0]?.matchSource).toBe('content')
  })
})

describe('smart minimal section defaults', () => {
  test('defaults to section docs when no subsections are requested', () => {
    expect(getSectionQueryIncludeDocumentsDefault({ title: 'Design System' })).toBe(true)
  })

  test('defaults to subsection-only when subsections are requested', () => {
    expect(getSectionQueryIncludeDocumentsDefault({ title: 'Design System', subsections: ['Icons'] })).toBe(false)
  })

  test('respects explicit includeSectionDocuments override', () => {
    expect(getSectionQueryIncludeDocumentsDefault({
      title: 'Design System',
      subsections: ['Icons'],
      includeSectionDocuments: true,
    })).toBe(true)
  })
})

describe('collectRequestedSectionUrls', () => {
  const section: ParsedSection = structure.sections[0]!

  test('returns only subsection links when section docs are excluded', () => {
    const urls = collectRequestedSectionUrls(section, ['Icons'], false)

    expect(urls).toEqual(['https://example.com/icons.md'])
  })

  test('returns section and subsection links when section docs are included', () => {
    const urls = collectRequestedSectionUrls(section, ['Icons'], true)

    expect(urls).toContain('https://example.com/design-system.md')
    expect(urls).toContain('https://example.com/icons.md')
  })
})

describe('chunkMarkdownByHeadings', () => {
  test('splits markdown by ## headings and tracks line ranges', () => {
    const markdown = [
      '# Title',
      '',
      'Intro text',
      '',
      '## First',
      'A',
      'B',
      '### Nested',
      'Still first',
      '## Second',
      'C',
    ].join('\n')

    const chunks = chunkMarkdownByHeadings(markdown)

    expect(chunks).toHaveLength(3)
    expect(chunks[0]?.heading).toBe('Document')
    expect(chunks[1]?.heading).toBe('First')
    expect(chunks[1]?.startLine).toBe(5)
    expect(chunks[1]?.endLine).toBe(9)
    expect(chunks[2]?.heading).toBe('Second')
  })
})

describe('searchChunks', () => {
  test('returns ranked chunk matches above confidence threshold', () => {
    const chunks = chunkMarkdownByHeadings([
      '## Icons',
      'Material icons and c8y-icon',
      '',
      '## Buttons',
      'Button usage',
    ].join('\n'))

    const matches = searchChunks(chunks, 'icon', 70, 3)

    expect(matches.length).toBeGreaterThan(0)
    expect(matches[0]?.chunk.heading).toBe('Icons')
    expect(matches[0]?.confidence).toBeGreaterThanOrEqual(70)
  })
})

describe('sliceLines', () => {
  test('returns exact requested line range', () => {
    const content = ['a', 'b', 'c', 'd'].join('\n')
    const sliced = sliceLines(content, 2, 3)

    expect(sliced).toBe('b\nc')
  })
})
