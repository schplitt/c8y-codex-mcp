export interface SubsectionLink {
  title: string
  url: string
}

export interface ParsedSubsection {
  title: string
  description: string
  links: SubsectionLink[]
}

export interface ParsedSection {
  title: string
  description: string
  links: SubsectionLink[]
  subsections: ParsedSubsection[]
}

export interface ParsedCodexDocument {
  title: string
  description: string
  sections: ParsedSection[]
}

export interface DocumentEntry {
  ok: boolean
  content: string | null
  statusCode: number | null
  statusText: string | null
  fetchedAt: string
  error: string | null
}

export interface CodexSnapshotMeta {
  builtAt: string
  sourceUrl: string
}

export interface CodexSnapshot {
  meta: CodexSnapshotMeta
  structure: ParsedCodexDocument
  documents: Record<string, DocumentEntry>
}

export type LinkedMarkdownPromiseCache = Map<string, Promise<DocumentEntry>>

export interface EnrichCodexDocumentWithLinkedMarkdownOptions {
  sourceUrl?: string
}

export interface ResolveSnapshotOptions {
  separator?: string
}
