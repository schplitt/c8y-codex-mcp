import { readFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { afterEach, describe, expect, test, vi } from 'vitest'
import { enrichCodexDocumentWithLinkedMarkdown } from '../server/utils/c8y/enrich'

const __dirname = dirname(fileURLToPath(import.meta.url))

afterEach(() => {
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})

describe('HTML content normalization', () => {
  test('detects and converts html snapshot content to markdown', async () => {
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

    vi.stubGlobal('fetch', vi.fn(async (): Promise<Response> => {
      return new Response(htmlSnapshot, {
        status: 200,
        statusText: 'OK',
        headers: {
          'content-type': 'text/html; charset=utf-8',
        },
      })
    }))

    const snapshot = await enrichCodexDocumentWithLinkedMarkdown(parsed, { sourceUrl: 'https://example.com/llms.txt' })
    const convertedContent = snapshot.documents[htmlUrl]?.content

    expect(snapshot.documents[htmlUrl]?.ok).toBe(true)
    expect(convertedContent).toBeTruthy()
    expect(convertedContent).not.toBe(htmlSnapshot)
    expect(convertedContent).not.toContain('<div class="row card-group m-t-40">')
    expect(convertedContent).toContain('Foundations')
    expect(convertedContent).toContain('By following these guidelines, you will be able to:')
  })

  test('replaces single-char hugo escapes after html to markdown conversion', async () => {
    const htmlUrl = 'https://example.com/docs/placeholders.md'
    const htmlWithHugoEscapes = '<p>Escapes: {{\'>\'}} {{\'<\'}} {{\'}\'}} {{\'ab\'}}.</p>'

    const parsed = {
      title: 'Doc',
      description: 'Root description',
      sections: [
        {
          title: 'Placeholders',
          description: 'Section description',
          links: [{ title: 'Placeholder doc', url: htmlUrl }],
          subsections: [],
        },
      ],
    }

    vi.stubGlobal('fetch', vi.fn(async (): Promise<Response> => {
      return new Response(htmlWithHugoEscapes, {
        status: 200,
        statusText: 'OK',
        headers: {
          'content-type': 'text/html; charset=utf-8',
        },
      })
    }))

    const snapshot = await enrichCodexDocumentWithLinkedMarkdown(parsed, { sourceUrl: 'https://example.com/llms.txt' })
    const convertedContent = snapshot.documents[htmlUrl]?.content ?? ''

    expect(convertedContent).toContain('Escapes: > < } {{\'ab\'}}.')
    expect(convertedContent).not.toContain('{{\'>\'}}')
    expect(convertedContent).not.toContain('{{\'<\'}}')
    expect(convertedContent).not.toContain('{{\'}\'}}')
    expect(convertedContent).toContain('{{\'ab\'}}')
  })
})
