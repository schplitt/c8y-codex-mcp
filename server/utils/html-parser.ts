import { convert, initWasm, wasmReady } from '@kreuzberg/html-to-markdown-wasm'

/**
 * Converts HTML content to markdown.
 * Handles detection of HTML content and converts it to markdown format.
 * Normalizes single-character Hugo escape sequences.
 * @param content - The HTML content to convert
 * @returns Promise resolving to markdown string
 */
export async function htmlToMarkdown(content: string): Promise<string> {
  let result = content

  if (!looksLikeHtml(content)) {
    return replaceSingleCharHugoEscapes(result)
  }

  try {
    const ready = wasmReady ?? initWasm()
    await ready
    const markdown = convert(content, {
      wrap: true,
      wrapWidth: 80,
      escapeAsterisks: false,
      escapeUnderscores: false,
      escapeMisc: false,
    })
    result = markdown || content
  } catch {
    result = content
  }

  return replaceSingleCharHugoEscapes(result)
}

/**
 * Detects if content looks like HTML based on common HTML patterns.
 * @param content - The content to check
 * @returns true if content appears to be HTML
 */
function looksLikeHtml(content: string): boolean {
  const trimmed = content.trim()

  if (!trimmed) {
    return false
  }

  return /<!doctype\s+html/i.test(trimmed)
    || /<html[\s>]/i.test(trimmed)
    || /<body[\s>]/i.test(trimmed)
    || /<head[\s>]/i.test(trimmed)
    || /<([a-z][a-z0-9-]*)(\s[^>]*)?>[\s\S]*<\/\1>/i.test(trimmed)
}

/**
 * Replaces single-character Hugo escape sequences with their literal characters.
 * Matches patterns like {{'c'}} and replaces with c
 * @param content - The content to process
 * @returns Content with Hugo escapes replaced
 */
function replaceSingleCharHugoEscapes(content: string): string {
  return content.replace(/\{\{'([^'\n\r])'\}\}/g, '$1')
}
