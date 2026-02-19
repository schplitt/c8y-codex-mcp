import { readFile } from 'node:fs/promises'
import { afterEach, describe, expect, test, vi } from 'vitest'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

import { fetchParseAndEnrichCodexLlms } from '../server/utils/c8y'
import { enrichCodexDocumentWithLinkedMarkdown } from '../server/utils/c8y/enrich'
import { parseCodexLlmsMarkdown } from '../server/utils/c8y/parse'
import { resolveSectionMarkdown, resolveSubsectionMarkdown } from '../server/utils/c8y/resolve'

vi.mock('@cloudflare/playwright', () => ({
  launch: vi.fn().mockRejectedValue(new Error('Not available in test environment')),
}))

vi.mock('cloudflare:workers', () => ({
  env: {},
}))

const __dirname = dirname(fileURLToPath(import.meta.url))

afterEach(() => {
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})

describe('parseCodexLlmsMarkdown', () => {
  test('parses llms snapshot and keeps section-level links for sections without subsections', async () => {
    const markdown = await readFile(join(__dirname, './snapshots/llms.txt'), 'utf8')

    const parsed = parseCodexLlmsMarkdown(markdown)

    expect(parsed.title).toBe('Cumulocity Web SDK Codex')
    expect(parsed.description.length).toBeGreaterThan(0)
    expect(parsed.sections.length).toBeGreaterThan(0)

    const migrationSection = parsed.sections.find((section) => section.title === 'Migration guides')
    expect(migrationSection).toBeDefined()
    expect(migrationSection?.subsections).toHaveLength(0)
    expect(migrationSection?.links.length).toBeGreaterThan(0)
    expect(migrationSection?.links.some((link) => link.url.endsWith('.md'))).toBe(true)

    const quickStartSection = parsed.sections.find((section) => section.title === 'Quick start')
    expect(quickStartSection).toBeDefined()
    expect(quickStartSection?.links.length).toBeGreaterThan(0)
  })

  test('keeps only .md links and prunes empty subsections/sections', () => {
    const markdown = [
      '# Test',
      '',
      'desc',
      '',
      '## Keep Section',
      'section desc',
      '- [md keep](https://example.com/a.md)',
      '- [pdf drop](https://example.com/a.pdf)',
      '',
      '### Keep Sub',
      'sub desc',
      '- [md keep sub](https://example.com/sub.md)',
      '',
      '### Drop Sub',
      'sub desc',
      '- [txt drop](https://example.com/sub.txt)',
      '',
      '## Drop Section',
      'drop desc',
      '- [html drop](https://example.com/page.html)',
      '',
    ].join('\n')

    const parsed = parseCodexLlmsMarkdown(markdown)

    expect(parsed.sections).toHaveLength(1)
    expect(parsed.sections[0]?.title).toBe('Keep Section')
    expect(parsed.sections[0]?.links).toHaveLength(1)
    expect(parsed.sections[0]?.subsections).toHaveLength(1)
    expect(parsed.sections[0]?.subsections[0]?.title).toBe('Keep Sub')
    expect(parsed.sections[0]?.subsections[0]?.links).toHaveLength(1)
  })
})

describe('enrichCodexDocumentWithLinkedMarkdown', () => {
  test('builds a deduplicated documents store with status metadata', async () => {
    const sharedUrl = 'https://example.com/docs/shared.md'
    const missingUrl = 'https://example.com/docs/missing.md'

    const parsed = {
      title: 'Doc',
      description: 'Root description',
      sections: [
        {
          title: 'Section',
          description: 'Section description',
          links: [{ title: 'Shared section', url: sharedUrl }],
          subsections: [
            {
              title: 'Subsection A',
              description: 'Subsection A description',
              links: [
                { title: 'Shared duplicate', url: sharedUrl },
                { title: 'Missing', url: missingUrl },
              ],
            },
          ],
        },
      ],
    }

    const fetchMock = vi.fn(async (input: unknown): Promise<Response> => {
      const url = typeof input === 'string'
        ? input
        : input instanceof URL
          ? input.toString()
          : String(input)

      if (url === missingUrl) {
        return new Response('not found', { status: 404, statusText: 'Not Found' })
      }

      return new Response(`content:${url}`, { status: 200, statusText: 'OK' })
    })

    vi.stubGlobal('fetch', fetchMock)

    const snapshot = await enrichCodexDocumentWithLinkedMarkdown(parsed, { sourceUrl: 'https://example.com/llms.txt' })

    expect(fetchMock).toHaveBeenCalledTimes(2)
    expect(snapshot.meta.sourceUrl).toBe('https://example.com/llms.txt')
    expect(snapshot.documents[sharedUrl]?.ok).toBe(true)
    expect(snapshot.documents[sharedUrl]?.content).toBe(`content:${sharedUrl}`)
    expect(snapshot.documents[missingUrl]?.ok).toBe(false)
    expect(snapshot.documents[missingUrl]?.statusCode).toBe(404)
    expect(snapshot.documents[missingUrl]?.statusText).toBe('Not Found')
    expect(snapshot.documents[missingUrl]?.content).toBeNull()
  })

  test('detects HTML documents and converts them to markdown-like content', async () => {
    const htmlUrl = 'https://example.com/docs/design-system.md'
    const htmlSnapshot = await readFile(join(__dirname, './snapshots/html.html'), 'utf8')

    const parsed = {
      title: 'Doc',
      description: 'Root description',
      sections: [
        {
          title: 'Design system',
          description: 'Section description',
          links: [{ title: 'Design system doc', url: htmlUrl }],
          subsections: [],
        },
      ],
    }

    const fetchMock = vi.fn(async (): Promise<Response> => {
      return new Response(htmlSnapshot, {
        status: 200,
        statusText: 'OK',
        headers: {
          'content-type': 'text/html; charset=utf-8',
        },
      })
    })

    vi.stubGlobal('fetch', fetchMock)

    const snapshot = await enrichCodexDocumentWithLinkedMarkdown(parsed, { sourceUrl: 'https://example.com/llms.txt' })
    const convertedContent = snapshot.documents[htmlUrl]?.content

    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(snapshot.documents[htmlUrl]?.ok).toBe(true)
    expect(convertedContent).toBeTruthy()
    expect(convertedContent).not.toBe(htmlSnapshot)
    expect(convertedContent).not.toContain('<div class="row card-group m-t-40">')
    expect(convertedContent).toContain('Foundations')
    expect(convertedContent).toContain('By following these guidelines, you will be able to:')
  })
})

describe('resolve helpers', () => {
  test('resolves section and subsection markdown from document store with fallback for missing docs', () => {
    const snapshot = {
      meta: {
        builtAt: '2026-02-17T00:00:00.000Z',
        sourceUrl: 'https://example.com/llms.txt',
      },
      structure: {
        title: 'Doc',
        description: 'desc',
        sections: [
          {
            title: 'Section A',
            description: 'section',
            links: [{ title: 'Section Doc', url: 'https://example.com/section.md' }],
            subsections: [
              {
                title: 'Sub A',
                description: 'sub',
                links: [{ title: 'Missing Doc', url: 'https://example.com/missing.md' }],
              },
            ],
          },
        ],
      },
      documents: {
        'https://example.com/section.md': {
          ok: true,
          content: '# Section content',
          statusCode: 200,
          statusText: 'OK',
          fetchedAt: '2026-02-17T00:00:00.000Z',
          error: null,
        },
        'https://example.com/missing.md': {
          ok: false,
          content: null,
          statusCode: 404,
          statusText: 'Not Found',
          fetchedAt: '2026-02-17T00:00:00.000Z',
          error: null,
        },
      },
    }

    const sectionMarkdown = resolveSectionMarkdown(snapshot, 'Section A')
    const subsectionMarkdown = resolveSubsectionMarkdown(snapshot, 'Section A', 'Sub A')

    expect(sectionMarkdown).toContain('# Section content')
    expect(sectionMarkdown).toContain('Documentation unavailable for https://example.com/missing.md. Fetch returned 404 Not Found.')
    expect(subsectionMarkdown).toBe(
      'Documentation unavailable for https://example.com/missing.md. Fetch returned 404 Not Found.',
    )
  })
})

describe('fetchParseAndEnrichCodexLlms', () => {
  test('fetches llms markdown and returns snapshot with structure + documents', async () => {
    const llmsMarkdown = [
      '# Test Codex',
      '',
      'Top description',
      '',
      '## Section A',
      'Section description',
      '- [Section Doc](https://example.com/docs/section.md)',
      '',
      '### Subsection A',
      'Subsection description',
      '',
      '- [Doc A](https://example.com/docs/a.md)',
      '- [Doc B](https://example.com/docs/b.md)',
      '- [Doc txt ignored](https://example.com/docs/ignored.txt)',
      '',
    ].join('\n')

    const fetchMock = vi.fn(async (input: unknown): Promise<Response> => {
      const url = typeof input === 'string'
        ? input
        : input instanceof URL
          ? input.toString()
          : String(input)

      if (url === 'https://cumulocity.com/codex/llms.txt') {
        return new Response(llmsMarkdown, { status: 200 })
      }

      return new Response(`content:${url}`, { status: 200 })
    })

    vi.stubGlobal('fetch', fetchMock)

    const snapshot = await fetchParseAndEnrichCodexLlms()

    expect(snapshot.structure.title).toBe('Test Codex')
    expect(snapshot.structure.sections[0]?.links).toEqual([
      { title: 'Section Doc', url: 'https://example.com/docs/section.md' },
    ])
    expect(snapshot.structure.sections[0]?.subsections[0]?.links).toHaveLength(2)
    expect(snapshot.documents['https://example.com/docs/a.md']?.content).toBe('content:https://example.com/docs/a.md')
    expect(snapshot.documents['https://example.com/docs/section.md']?.ok).toBe(true)
    expect(snapshot.documents['https://example.com/docs/ignored.txt']).toBeUndefined()
    expect(fetchMock).toHaveBeenCalledTimes(4)
  })
})
