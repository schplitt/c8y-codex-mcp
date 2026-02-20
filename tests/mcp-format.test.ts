import { describe, expect, test } from 'vitest'
import { resolveLinkedDocument } from '../server/utils/mcp/format'
import type { DocumentEntry } from '../server/utils/c8y/types'

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