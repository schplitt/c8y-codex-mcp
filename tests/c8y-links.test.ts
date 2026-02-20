import { describe, expect, test } from 'vitest'
import { collectLinkedUrlsFromDocuments, extractCodexMarkdownLinks, normalizeCodexLinkToMarkdown } from '../server/utils/c8y/links'
import type { DocumentEntry } from '../server/utils/c8y/types'

describe('normalizeCodexLinkToMarkdown', () => {
  test('converts hash codex links to absolute markdown URL', () => {
    expect(normalizeCodexLinkToMarkdown('#/advanced-development/services/app-state-service')).toBe(
      'https://cumulocity.com/codex/advanced-development/services/app-state-service.md',
    )
  })
})

describe('extractCodexMarkdownLinks', () => {
  test('extracts normalized codex markdown links from markdown content', () => {
    const markdown = [
      '- [App State](#/advanced-development/services/app-state-service)',
      '- [Permissions](#/advanced-development/services/permissions-service)',
    ].join('\n')

    const links = extractCodexMarkdownLinks(markdown)

    expect(links).toContain('https://cumulocity.com/codex/advanced-development/services/app-state-service.md')
    expect(links).toContain('https://cumulocity.com/codex/advanced-development/services/permissions-service.md')
  })
})

describe('collectLinkedUrlsFromDocuments', () => {
  test('collects one-hop linked URLs that are not already in documents map', () => {
    const documents: Record<string, DocumentEntry | undefined> = {
      'https://cumulocity.com/codex/advanced-development/services.md': {
        ok: true,
        content: '- [App State](#/advanced-development/services/app-state-service)',
        statusCode: 200,
        statusText: 'OK',
        fetchedAt: '2026-01-01T00:00:00.000Z',
        error: null,
      },
    }

    const linked = collectLinkedUrlsFromDocuments(documents, 10)

    expect(linked).toEqual([
      'https://cumulocity.com/codex/advanced-development/services/app-state-service.md',
    ])
  })
})
