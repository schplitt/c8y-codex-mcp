import { MarkdownExit } from 'markdown-exit'
import type { Token } from 'markdown-exit'

import type { ParsedCodexDocument, ParsedSection, ParsedSubsection, SubsectionLink } from './types'

const DEFAULT_CODEX_ROOT_URL = 'https://cumulocity.com/codex/'

const parser = new MarkdownExit()

export function parseCodexLlmsMarkdown(markdown: string): ParsedCodexDocument {
  const codexRootUrl = DEFAULT_CODEX_ROOT_URL
  const tokens = parser.parse(markdown)

  const result: ParsedCodexDocument = {
    title: '',
    description: '',
    sections: [],
  }

  let activeSection: ParsedSection | null = null
  let activeSubsection: ParsedSubsection | null = null

  for (let index = 0; index < tokens.length; index += 1) {
    const token = tokens[index]

    if (!token) {
      continue
    }

    if (token.type === 'heading_open') {
      const level = getHeadingLevel(token)

      if (level >= 4) {
        continue
      }
      const headingText = normalizeWhitespace(readHeadingText(tokens, index))

      if (level === 1) {
        result.title = headingText
        activeSection = null
        activeSubsection = null
        continue
      }

      if (level === 2) {
        const section: ParsedSection = {
          title: headingText,
          description: '',
          links: [],
          subsections: [],
        }

        result.sections.push(section)
        activeSection = section
        activeSubsection = null
        continue
      }

      if (level === 3 && activeSection) {
        const subsection: ParsedSubsection = {
          title: headingText,
          description: '',
          links: [],
        }

        activeSection.subsections.push(subsection)
        activeSubsection = subsection
      }

      continue
    }

    if (token.type === 'paragraph_open') {
      const paragraphText = normalizeWhitespace(readParagraphText(tokens, index))

      if (!paragraphText) {
        continue
      }

      if (!result.description && result.title && !activeSection) {
        result.description = paragraphText
        continue
      }

      if (activeSubsection && !activeSubsection.description) {
        activeSubsection.description = paragraphText
        continue
      }

      if (activeSection && !activeSubsection && !activeSection.description) {
        activeSection.description = paragraphText
      }

      continue
    }

    if (token.type === 'bullet_list_open' && activeSection) {
      const { nextIndex, links } = collectBulletListLinks(tokens, index, codexRootUrl)

      if (links.length > 0) {
        if (activeSubsection) {
          activeSubsection.links.push(...links)
        } else {
          activeSection.links.push(...links)
        }
      }

      index = nextIndex
    }
  }

  return {
    ...result,
    sections: pruneEmptySections(result.sections),
  }
}

function getHeadingLevel(token: Token): number {
  if (!token.tag.startsWith('h')) {
    return 0
  }

  return Number.parseInt(token.tag.slice(1), 10)
}

function readHeadingText(tokens: Token[], headingOpenIndex: number): string {
  const inlineToken = tokens[headingOpenIndex + 1]
  return inlineToken?.type === 'inline' ? readInlineText(inlineToken) : ''
}

function readParagraphText(tokens: Token[], paragraphOpenIndex: number): string {
  const inlineToken = tokens[paragraphOpenIndex + 1]
  return inlineToken?.type === 'inline' ? readInlineText(inlineToken) : ''
}

function readInlineText(token: Token): string {
  if (token.children && token.children.length > 0) {
    const parts: string[] = []

    for (const child of token.children) {
      if (child.type === 'text' || child.type === 'code_inline' || child.type === 'html_inline') {
        parts.push(child.content)
      }
    }

    return parts.join(' ')
  }

  return token.content
}

function collectBulletListLinks(
  tokens: Token[],
  bulletListOpenIndex: number,
  codexRootUrl: string,
): { nextIndex: number, links: SubsectionLink[] } {
  const links: SubsectionLink[] = []
  let listDepth = 1
  let index = bulletListOpenIndex + 1

  while (index < tokens.length && listDepth > 0) {
    const token = tokens[index]

    if (!token) {
      index += 1
      continue
    }

    if (token.type === 'bullet_list_open') {
      listDepth += 1
      index += 1
      continue
    }

    if (token.type === 'bullet_list_close') {
      listDepth -= 1

      if (listDepth === 0) {
        break
      }

      index += 1
      continue
    }

    if (token.type === 'inline') {
      links.push(...extractInlineLinks(token, codexRootUrl))
    }

    index += 1
  }

  return {
    nextIndex: index,
    links,
  }
}

function extractInlineLinks(token: Token, codexRootUrl: string): SubsectionLink[] {
  const children = token.children ?? []
  const links: SubsectionLink[] = []

  for (let index = 0; index < children.length; index += 1) {
    const child = children[index]

    if (!child) {
      continue
    }

    if (child.type !== 'link_open') {
      continue
    }

    const href = getAttrValue(child, 'href')
    const titleParts: string[] = []
    let cursor = index + 1

    while (cursor < children.length) {
      const inner = children[cursor]

      if (!inner) {
        cursor += 1
        continue
      }

      if (inner.type === 'link_close') {
        break
      }

      if (inner.type === 'text' || inner.type === 'code_inline' || inner.type === 'html_inline') {
        titleParts.push(inner.content)
      }

      cursor += 1
    }

    const title = normalizeWhitespace(titleParts.join(' '))
    const normalizedUrl = normalizeCodexUrl(href, codexRootUrl)

    if (normalizedUrl && isMarkdownDocUrl(normalizedUrl)) {
      links.push({
        title: title || normalizedUrl,
        url: normalizedUrl,
      })
    }

    index = cursor
  }

  return links
}

function getAttrValue(token: Token, name: string): string {
  const attributes = token.attrs ?? []
  const pair = attributes.find(([key]) => key === name)
  return pair?.[1] ?? ''
}

function normalizeCodexUrl(rawUrl: string, codexRootUrl: string): string {
  const url = rawUrl.trim()

  if (!url) {
    return ''
  }

  if (url.startsWith('http://') || url.startsWith('https://')) {
    return url
  }

  if (url.startsWith('#/')) {
    return new URL(url.slice(2), codexRootUrl).toString()
  }

  try {
    return new URL(url, codexRootUrl).toString()
  } catch {
    return ''
  }
}

function normalizeWhitespace(value: string): string {
  return value.replace(/\s+/g, ' ').trim()
}

function isMarkdownDocUrl(url: string): boolean {
  try {
    return new URL(url).pathname.toLowerCase().endsWith('.md')
  } catch {
    return false
  }
}

function pruneEmptySections(sections: ParsedSection[]): ParsedSection[] {
  return sections
    .map((section): ParsedSection => {
      const subsections = section.subsections.filter((subsection) => subsection.links.length > 0)

      return {
        ...section,
        subsections,
      }
    })
    .filter((section) => section.links.length > 0 || section.subsections.length > 0)
}
