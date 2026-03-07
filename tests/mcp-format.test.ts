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
  test('formats merged multi-query results with selective fetch guidance', () => {
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
            'https://cumulocity.com/codex/foundations/icons/library.md',
          ],
          content: '',
        },
      },
      {
        confidence: 91,
        matchSource: 'content',
        snippet: 'Design token assets',
        candidate: {
          matchType: 'subsubsection',
          title: 'Design assets',
          description: 'Asset-related guidance',
          sectionTitle: 'Foundations',
          subsectionTitle: 'Resources',
          urls: [
            'https://cumulocity.com/codex/foundations/resources/design-assets.md',
          ],
          content: '',
        },
      },
    ]

    const rendered = buildQueryCodexOutput(['icons', 'design system assets'], matches)

    expect(rendered).toContain('- queries: icons, design system assets')
    expect(rendered).toContain('Review the listed URLs and fetch the ones relevant to your task')
    expect(rendered).toContain('If you need a subtopic, fetch that subtopic URL')
    expect(rendered).toContain('## Foundations > Icons')
    expect(rendered).toContain('## Foundations > Resources > Design assets')
    expect(rendered).toContain('https://cumulocity.com/codex/foundations/icons')
    expect(rendered).toContain('https://cumulocity.com/codex/foundations/resources/design-assets')
  })
})
