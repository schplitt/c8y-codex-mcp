import type { CodexSnapshot, DocumentEntry, ResolveSnapshotOptions, SubsectionLink } from './types'

export function resolveSectionMarkdown(
  snapshot: CodexSnapshot,
  sectionTitle: string,
  options: ResolveSnapshotOptions = {},
): string {
  const section = snapshot.structure.sections.find((candidate) => candidate.title === sectionTitle)

  if (!section) {
    return ''
  }

  const subsectionLinks = section.subsections.flatMap((subsection) => subsection.links)
  const links = dedupeLinksByUrl([...section.links, ...subsectionLinks])

  return concatenateLinks(snapshot, links, options)
}

export function resolveSubsectionMarkdown(
  snapshot: CodexSnapshot,
  sectionTitle: string,
  subsectionTitle: string,
  options: ResolveSnapshotOptions = {},
): string {
  const section = snapshot.structure.sections.find((candidate) => candidate.title === sectionTitle)

  if (!section) {
    return ''
  }

  const subsection = section.subsections.find((candidate) => candidate.title === subsectionTitle)

  if (!subsection) {
    return ''
  }

  return concatenateLinks(snapshot, subsection.links, options)
}

function concatenateLinks(snapshot: CodexSnapshot, links: SubsectionLink[], options: ResolveSnapshotOptions): string {
  const separator = options.separator ?? '\n\n'
  const chunks = links.map((link) => getDocumentContent(snapshot.documents[link.url], link.url))

  return chunks.join(separator)
}

function getDocumentContent(documentEntry: DocumentEntry | undefined, url: string): string {
  if (documentEntry?.content) {
    return documentEntry.content
  }

  const statusCode = documentEntry?.statusCode ?? 'N/A'
  const statusText = documentEntry?.statusText ?? documentEntry?.error ?? 'Unavailable'

  return `Documentation unavailable for ${url}. Fetch returned ${statusCode} ${statusText}.`
}

function dedupeLinksByUrl(links: SubsectionLink[]): SubsectionLink[] {
  const seen = new Set<string>()
  const uniqueLinks: SubsectionLink[] = []

  for (const link of links) {
    if (seen.has(link.url)) {
      continue
    }

    seen.add(link.url)
    uniqueLinks.push(link)
  }

  return uniqueLinks
}
