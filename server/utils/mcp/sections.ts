import type { ParsedSection } from '../c8y/types'

export interface SectionQueryInput {
  title: string
  subsections?: string[]
  includeSectionDocuments?: boolean
}

export function collectRequestedSectionUrls(
  section: ParsedSection,
  requestedSubsections?: string[],
  includeSectionDocuments = true,
): string[] {
  const urls = new Set<string>()

  if (includeSectionDocuments) {
    for (const link of section.links) {
      urls.add(link.url)
    }
  }

  const subsectionTitles = requestedSubsections && requestedSubsections.length > 0
    ? requestedSubsections
    : section.subsections.map((subsection) => subsection.title)

  for (const subsectionTitle of subsectionTitles) {
    const subsection = section.subsections.find((candidate) => candidate.title === subsectionTitle)
    if (!subsection) {
      continue
    }

    for (const link of subsection.links) {
      urls.add(link.url)
    }

    for (const subsubsection of subsection.subsubsections) {
      for (const link of subsubsection.links) {
        urls.add(link.url)
      }
    }
  }

  return [...urls]
}

export function getSectionQueryIncludeDocumentsDefault(section: SectionQueryInput): boolean {
  if (typeof section.includeSectionDocuments === 'boolean') {
    return section.includeSectionDocuments
  }

  return !(section.subsections && section.subsections.length > 0)
}