import { expect, test } from 'vitest'
import { htmlToMarkdown } from '../server/utils/html-parser'
import fs from 'fs'
import path from 'path'

test('should convert HTML to markdown without escaping hyphens in icon names', async () => {
  const iconHtmlPath = path.join(__dirname, 'snapshots', 'icons.html')
  const iconHtml = fs.readFileSync(iconHtmlPath, 'utf-8')

  const markdown = await htmlToMarkdown(iconHtml)

  // Should contain icon names with hyphens, not escaped
  expect(markdown).toContain('empty-battery')
  expect(markdown).not.toContain('empty\\-battery')

  // Should contain other icon names correctly
  expect(markdown).toContain('collapse-arrow')
  expect(markdown).not.toContain('collapse\\-arrow')

  expect(markdown).toContain('dlt-c8y-icon')
  expect(markdown).not.toContain('dlt\\-c8y\\-icon')

  expect(markdown).toContain('c8y-icon')
  expect(markdown).not.toContain('c8y\\-icon')

  // Verify it's markdown format (contains headings, bullets, etc)
  expect(markdown).toContain('##')
  expect(markdown).toContain('-')
})

test('should preserve normal list formatting and content', async () => {
  const iconHtmlPath = path.join(__dirname, 'snapshots', 'icons.html')
  const iconHtml = fs.readFileSync(iconHtmlPath, 'utf-8')

  const markdown = await htmlToMarkdown(iconHtml)

  // Should have the intro text
  expect(markdown).toContain('Icons serve as a powerful visual language')
  expect(markdown).toContain('universally recognizable')

  // Should have the two icon sets mentioned
  expect(markdown).toContain('Material Sharp')
  expect(markdown).toContain('iconmonstr')
})

test('should handle backticks in code blocks', async () => {
  const iconHtmlPath = path.join(__dirname, 'snapshots', 'icons.html')
  const iconHtml = fs.readFileSync(iconHtmlPath, 'utf-8')

  const markdown = await htmlToMarkdown(iconHtml)

  // Should preserve backticks for code
  expect(markdown).toContain('`icon-')
})

test('replaces single-char hugo escapes and preserves multi-char ones', async () => {
  const html = '<p>Escapes: {{\'>\'}} {{\'<\'}} {{\'}\'}}</p><p>Multi: {{\'ab\'}}.</p>'
  const markdown = await htmlToMarkdown(html)

  // single-char placeholders are replaced
  expect(markdown).not.toContain('{{\'>\'}}')
  expect(markdown).not.toContain('{{\'<\'}}')
  expect(markdown).not.toContain('{{\'}\'}}')
  // multi-char placeholder is preserved
  expect(markdown).toContain('{{\'ab\'}}')
})
