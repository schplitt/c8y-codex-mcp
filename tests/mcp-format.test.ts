import { describe, expect, test } from 'vitest'
import { buildQueryCodexOutput, resolveLinkedDocument } from '../server/utils/mcp/format'
import type { DocumentEntry } from '../server/utils/c8y/types'
import type { RankedSearchMatch } from '../server/utils/mcp/search'

describe('resolveLinkedDocument', () => {
  test('rewrites internal codex hash links to absolute human-readable links', () => {
    const entry: DocumentEntry = {
      ok: true,
      content: '- [App state](#/advanced-development/services/app-state-service)',
      statusCode: 200,
      statusText: 'OK',
      fetchedAt: '2026-01-01T00:00:00.000Z',
      error: null,
    }

    const rendered = resolveLinkedDocument(entry, 'https://cumulocity.com/codex/advanced-development/services.md')

    expect(rendered).toContain('[App state](https://cumulocity.com/codex/advanced-development/services/app-state-service)')
  })
})

describe('buildQueryCodexOutput', () => {
  test('formats multi-query results grouped by input query', () => {
    const rendered = buildQueryCodexOutput([
      {
        query: 'icons',
        matches: [
          {
            confidence: 97,
            matchSource: 'title',
            snippet: 'Icon assets and usage',
            candidate: {
              matchType: 'subsection',
              title: 'Icons',
              description: 'Find icon assets and names',
              sectionTitle: 'Foundations',
              subsectionTitle: undefined,
              urls: [
                'https://cumulocity.com/codex/foundations/icons.md',
                'https://cumulocity.com/codex/foundations/icons/library.md',
              ],
              content: '',
            },
          },
        ],
      },
      {
        query: 'services',
        matches: [
          {
            confidence: 91,
            matchSource: 'content',
            snippet: 'App state service and related APIs',
            candidate: {
              matchType: 'subsubsection',
              title: 'App state service',
              description: 'Service-related guidance',
              sectionTitle: 'Advanced development',
              subsectionTitle: 'Services',
              urls: [
                'https://cumulocity.com/codex/advanced-development/services/app-state-service.md',
              ],
              content: '',
            },
          },
        ],
      },
    ])

    expect(rendered).toContain('- queries: icons, services')
    expect(rendered).toContain('Review the listed URLs and fetch the ones relevant to your task')
    expect(rendered).toContain('## Query: icons')
    expect(rendered).toContain('## Query: services')
    expect(rendered).toContain('### Best Matches')
    expect(rendered).toContain('- **Foundations > Icons**')
    expect(rendered).toContain('- **Advanced development > Services > App state service**')
    expect(rendered).toContain('https://cumulocity.com/codex/foundations/icons')
    expect(rendered).toContain('https://cumulocity.com/codex/advanced-development/services/app-state-service')
    expect(rendered.match(/## Query:/g)).toHaveLength(2)
    expect(rendered.match(/### Best Matches/g)).toHaveLength(2)
  })

  test('shows an empty-state section for a query with no matches', () => {
    const matches: RankedSearchMatch[] = [
      {
        confidence: 97,
        matchSource: 'title',
        snippet: 'Icon assets and usage',
        candidate: {
          matchType: 'subsection',
          title: 'Icons',
          description: 'Find icon assets and names',
          sectionTitle: 'Foundations',
          subsectionTitle: undefined,
          urls: [
            'https://cumulocity.com/codex/foundations/icons.md',
          ],
          content: '',
        },
      },
    ]

    const rendered = buildQueryCodexOutput([
      { query: 'icons', matches },
      { query: 'services', matches: [] },
    ])

    expect(rendered).toContain('## Query: services')
    expect(rendered).toContain('No matching section/subsection documents found for this query.')
  })
})
