import Fuse from 'fuse.js'
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { McpAgent } from 'agents/mcp'
import { z } from 'zod'
import pkgjson from '../../../package.json'
import { useCodexDocuments, useCodexStructure } from '../cached'
import type { DocumentEntry, ParsedSection } from '../c8y/types'

function resolveLinkedDocument(documentEntry: DocumentEntry | undefined, url: string): string {
  if (documentEntry?.ok && documentEntry.content) {
    return documentEntry.content
  }

  if (!documentEntry) {
    return `Document not found in snapshot for ${url}.`
  }

  return `Failed to fetch document content. Status: ${documentEntry.statusCode} ${documentEntry.statusText}. Error: ${documentEntry.error}`
}

function collectRequestedSectionUrls(section: ParsedSection, requestedSubsections?: string[]): string[] {
  const urls = new Set<string>(section.links.map((link) => link.url))

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
  }

  return [...urls]
}

export class CodexMcpAgent extends McpAgent {
  server = new McpServer({
    name: pkgjson.name,
    version: pkgjson.version,
    description: pkgjson.description,
  })

  async init() {
    this.server.registerTool(
      'list-codex-index',
      {
        title: 'List Codex Index',
        description: 'List the Codex documentation index (sections and subsections) with titles, descriptions, and links.',
      },
      async () => {
        const structure = await useCodexStructure()
        let toolOutput = `# ${structure.title}\n\n${structure.description}\n\n`
        for (const section of structure.sections) {
          toolOutput += `## ${section.title}\n${
            section.links.map((link) => `[${link.title}](${link.url})`).join('\n')
          }\n${section.description}\n\n`
          for (const subsection of section.subsections) {
            toolOutput += `### ${subsection.title}\n${
              subsection.links.map((link) => `[${link.title}](${link.url})`).join('\n')
            }\n${subsection.description}\n\n`
          }
        }

        return {
          content: [{ type: 'text', text: toolOutput }],
        }
      },
    )

    this.server.registerTool(
      'get-codex-documents',
      {
        title: 'Get Codex Documents',
        description: 'Get full stored document content by one or more Codex document URLs.',
        inputSchema: {
          urls: z.array(z.string()),
        },
      },
      async ({ urls }) => {
        const documents = await useCodexDocuments(urls)

        let resultMD = ''
        for (const url of urls) {
          const documentEntry = documents[url]
          if (documentEntry) {
            if (documentEntry.ok && documentEntry.content) {
              resultMD += `# Document: ${url}\n\n`
              resultMD += `${documentEntry.content}\n\n`
            } else {
              resultMD += `# Document: ${url}\n\n`
              resultMD += `Failed to fetch document content. Status: ${documentEntry.statusCode} ${documentEntry.statusText}. Error: ${documentEntry.error}\n\n`
            }
          } else {
            resultMD += `# Document: ${url}\n\n`
            resultMD += 'Document not found in snapshot.\n\n'
          }
        }

        return {
          content: [{ type: 'text', text: resultMD }],
        }
      },
    )

    this.server.registerTool(
      'search-codex-sections',
      {
        title: 'Search Codex Sections',
        description: 'Fuzzy-search Codex section titles and descriptions using one or more patterns and return section names only.',
        inputSchema: {
          patterns: z.array(z.string()).min(1),
          limitPerPattern: z.number().int().min(1).max(25).optional(),
        },
      },
      async ({ patterns, limitPerPattern }) => {
        const structure = await useCodexStructure()
        const sections = structure.sections.map((section) => ({
          title: section.title,
          description: section.description,
        }))

        const fuse = new Fuse(sections, {
          keys: ['title', 'description'],
          isCaseSensitive: false,
          includeScore: true,
          threshold: 0.4,
          ignoreLocation: true,
        })

        const effectiveLimit = limitPerPattern ?? 8
        const byPattern: Array<{ pattern: string, sectionNames: string[] }> = []
        const allNames = new Set<string>()

        for (const pattern of patterns) {
          const matches = fuse.search(pattern, { limit: effectiveLimit })
          const sectionNames = matches.map((match) => match.item.title)

          for (const name of sectionNames) {
            allNames.add(name)
          }

          byPattern.push({ pattern, sectionNames })
        }

        let resultMD = '# Matching Section Names\n\n'
        resultMD += Array.from(allNames).length > 0
          ? `${Array.from(allNames).map((name) => `- ${name}`).join('\n')}\n\n`
          : 'No section names matched.\n\n'

        resultMD += '## Results by Pattern\n\n'
        for (const patternResult of byPattern) {
          resultMD += `### ${patternResult.pattern}\n`
          resultMD += patternResult.sectionNames.length > 0
            ? `${patternResult.sectionNames.map((name) => `- ${name}`).join('\n')}\n\n`
            : '- No matches\n\n'
        }

        return {
          content: [{ type: 'text', text: resultMD }],
        }
      },
    )

    this.server.registerTool(
      'get-codex-sections',
      {
        title: 'Get Codex Sections',
        description: 'Return content for requested Codex sections by title. At least one section is required. Subsections are optional per section; if omitted or empty, all subsections for that section are returned.',
        inputSchema: {
          sections: z.array(z.object({
            title: z.string(),
            subsections: z.array(z.string()).optional(),
          })).min(1),
        },
      },
      async ({ sections }) => {
        if (sections.length === 0) {
          return {
            content: [{ type: 'text', text: 'At least one section must be provided.' }],
            isError: true,
          }
        }

        const structure = await useCodexStructure()

        const requestedUrls = new Set<string>()

        for (const requestedSection of sections) {
          const section = structure.sections.find((candidate) => candidate.title === requestedSection.title)
          if (!section) {
            continue
          }

          for (const url of collectRequestedSectionUrls(section, requestedSection.subsections)) {
            requestedUrls.add(url)
          }
        }

        const documents = await useCodexDocuments([...requestedUrls])

        let resultMD = `# ${structure.title}\n\n`

        for (const requestedSection of sections) {
          const section = structure.sections.find((candidate) => candidate.title === requestedSection.title)

          if (!section) {
            resultMD += `## ${requestedSection.title}\nSection not found in snapshot.\n\n`
            continue
          }

          resultMD += `## ${section.title}\n${section.description}\n\n`

          if (section.links.length > 0) {
            resultMD += '### Section Documents\n\n'
            for (const link of section.links) {
              resultMD += `#### ${link.title}\nURL: ${link.url}\n\n`
              resultMD += `${resolveLinkedDocument(documents[link.url], link.url)}\n\n`
            }
          }

          const subsectionTitles = requestedSection.subsections && requestedSection.subsections.length > 0
            ? requestedSection.subsections
            : section.subsections.map((subsection) => subsection.title)

          for (const subsectionTitle of subsectionTitles) {
            const subsection = section.subsections.find((candidate) => candidate.title === subsectionTitle)

            if (!subsection) {
              resultMD += `### ${subsectionTitle}\nSubsection not found in section ${section.title}.\n\n`
              continue
            }

            resultMD += `### ${subsection.title}\n${subsection.description}\n\n`

            for (const link of subsection.links) {
              resultMD += `#### ${link.title}\nURL: ${link.url}\n\n`
              resultMD += `${resolveLinkedDocument(documents[link.url], link.url)}\n\n`
            }
          }
        }

        return {
          content: [{ type: 'text', text: resultMD }],
        }
      },
    )
  }
}
