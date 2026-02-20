import type { DocumentEntry, ParsedCodexDocument } from '../c8y/types'
import { normalizeCodexLinkToMarkdown, toHumanReadableCodexUrl } from '../c8y/links'
import type { RankedSearchMatch, SearchCandidate } from './search'

function rewriteCodexLinksToMarkdown(content: string): string {
  return content.replace(/\[([^\]]+)\]\(([^)]+)\)/g, (fullMatch, text: string, href: string) => {
    const normalizedMarkdown = normalizeCodexLinkToMarkdown(href)
    if (!normalizedMarkdown) {
      return fullMatch
    }

    return `[${text}](${toHumanReadableCodexUrl(normalizedMarkdown)})`
  })
}

export function resolveLinkedDocument(documentEntry: DocumentEntry | undefined, url: string): string {
  if (documentEntry?.ok && documentEntry.content) {
    return rewriteCodexLinksToMarkdown(documentEntry.content)
  }

  if (!documentEntry) {
    return `Document not found in snapshot for ${url}.`
  }

  return `Failed to fetch document content. Status: ${documentEntry.statusCode} ${documentEntry.statusText}. Error: ${documentEntry.error}`
}

export function formatStructureMarkdown(structure: ParsedCodexDocument): string {
  let toolOutput = `# ${structure.title}\n\n${structure.description}\n\n`

  for (const section of structure.sections) {
    toolOutput += `## ${section.title}\n`
    toolOutput += `${section.description}\n\n`

    if (section.links.length > 0) {
      toolOutput += `${section.links.map((link) => `- [${link.title}](${toHumanReadableCodexUrl(link.url)})`).join('\n')}\n\n`
    }

    for (const subsection of section.subsections) {
      toolOutput += `### ${subsection.title}\n`
      toolOutput += `${subsection.description}\n\n`

      if (subsection.links.length > 0) {
        toolOutput += `${subsection.links.map((link) => `- [${link.title}](${toHumanReadableCodexUrl(link.url)})`).join('\n')}\n\n`
      }

      for (const subsubsection of subsection.subsubsections) {
        toolOutput += `#### ${subsubsection.title}\n`
        toolOutput += `${subsubsection.description}\n\n`

        if (subsubsection.links.length > 0) {
          toolOutput += `${subsubsection.links.map((link) => `- [${link.title}](${toHumanReadableCodexUrl(link.url)})`).join('\n')}\n\n`
        }
      }
    }
  }

  return toolOutput
}

function toCandidateLabel(candidate: SearchCandidate): string {
  if (candidate.matchType === 'subsubsection') {
    return `${candidate.sectionTitle} > ${candidate.subsectionTitle ?? 'Unknown'} > ${candidate.title}`
  }

  if (candidate.matchType === 'subsection') {
    return `${candidate.sectionTitle} > ${candidate.title}`
  }

  return candidate.title
}

export function buildQueryCodexOutput(query: string, matches: RankedSearchMatch[]): string {
  let output = '# Query Codex\n\n'
  output += `- query: ${query}\n\n`

  if (matches.length === 0) {
    output += 'No matching section/subsection documents found.\n'
    return output
  }

  for (const match of matches) {
    const candidate = match.candidate

    output += `## ${toCandidateLabel(candidate)}\n`
    output += `- confidence: ${match.confidence}\n`
    output += `- matchSource: ${match.matchSource}\n`
    output += `- title: ${candidate.title}\n`
    output += `- description: ${candidate.description || 'N/A'}\n`
    if (match.snippet) {
      output += `- snippet: ${match.snippet}\n`
    }

    if (candidate.urls.length === 0) {
      output += '- urls: none\n\n'
      continue
    }

    output += '- urls:\n'
    output += `${candidate.urls.map((url) => `  - ${toHumanReadableCodexUrl(url)}`).join('\n')}\n\n`
  }

  return output
}
