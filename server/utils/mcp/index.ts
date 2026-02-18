import { McpServer } from 'tmcp';
import { ValibotJsonSchemaAdapter } from '@tmcp/adapter-valibot';
import * as v from 'valibot';
import { HttpTransport } from '@tmcp/transport-http';
import pkgjson from "../../../package.json"
import { tool } from 'tmcp/utils';
import Fuse from 'fuse.js';
import { useCodexContext } from '../cached';

const adapter = new ValibotJsonSchemaAdapter();
const server = new McpServer(
	{
		name: pkgjson.name,
		version: pkgjson.version,
		description: pkgjson.description,
	},
	{
		adapter,
		capabilities: {
			tools: { listChanged: true },
		},
	},
);

// While the adapter is optional (you can opt out by explicitly passing `adapter: undefined`) without an adapter the server cannot accept inputs, produce structured outputs, or request elicitations at all only do this for very simple servers.

// Define a tool with type-safe schema
server.tool(
	{
		name: 'list-codex-documentation',
		description: 'List Codex documentation by section and subsection, including their title and description and their links.',
		title: 'List Codex Documentation',
		annotations: {
			idempotentHint: true,
			readOnlyHint: true,
		}
        
	},
	async () => {
		const codexConext = await useCodexContext()
		// create a markdown representation of the codex context
		let toolOutput = `# ${codexConext.structure.title}\n\n${codexConext.structure.description}\n\n`
		for (const section of codexConext.structure.sections) {
			toolOutput += `## ${section.title}\n${
				section.links.map(link => `[${link.title}](${link.url})`).join('\n')
			}\n${section.description}\n\n`
			for (const subsection of section.subsections) {
				toolOutput += `### ${subsection.title}\n${
					subsection.links.map(link => `[${link.title}](${link.url})`).join('\n')
				}\n${subsection.description}\n\n`
			}
		}
		return tool.text(toolOutput)
	},
);

server.tool({
	name: 'get-codex-documentations',
	description: 'Get the full content of Codex documentation documents by their URL.',
	title: 'Get Codex Documentations',
	annotations: {
		idempotentHint: true,
		readOnlyHint: true,
	},
	schema: v.object({
	urls: v.array(v.string()),
}),
}, async ({ urls }) => {
	const codexConext = await useCodexContext()
	const documents = codexConext.documents

	let resultMD = ""
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
		resultMD += `Document not found in snapshot.\n\n`
	}
}
	return tool.text(resultMD)
})

server.tool({
	name: 'search-documentation-sections',
	description: 'Fuzzy-search section title and description using one or more patterns and return matching section names only.',
	title: 'Search Documentation Sections',
	annotations: {
		idempotentHint: true,
		readOnlyHint: true,
	},
	schema: v.object({
		patterns: v.pipe(v.array(v.string()), v.minLength(1, 'At least one search pattern must be provided.')),
		limitPerPattern: v.optional(v.pipe(v.number(), v.integer(), v.minValue(1), v.maxValue(25), ), 8),
	}),
}, async ({ patterns, limitPerPattern }) => {
	const codexConext = await useCodexContext()
	const sections = codexConext.structure.sections.map(section => ({
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
		const sectionNames = matches.map(match => match.item.title)

		for (const name of sectionNames) {
			allNames.add(name)
		}

		byPattern.push({ pattern, sectionNames })
	}

	let resultMD = '# Matching Section Names\n\n'
	resultMD += Array.from(allNames).length > 0
		? `${Array.from(allNames).map(name => `- ${name}`).join('\n')}\n\n`
		: 'No section names matched.\n\n'

	resultMD += '## Results by Pattern\n\n'
	for (const patternResult of byPattern) {
		resultMD += `### ${patternResult.pattern}\n`
		resultMD += patternResult.sectionNames.length > 0
			? `${patternResult.sectionNames.map(name => `- ${name}`).join('\n')}\n\n`
			: '- No matches\n\n'
	}

	return tool.text(resultMD)
})

server.tool({
	name: 'list-documentation-sections',
	description: 'Return content for requested Codex sections. At least one section is required. Subsections are optional per section; if omitted or empty, all subsections for that section are returned.',
	title: 'List Documentation Sections',
	annotations: {
		idempotentHint: true,
		readOnlyHint: true,
	},
	schema: v.object({
		sections: v.pipe(v.array(v.object({
			title: v.string(),
			subsections: v.optional(v.array(v.string())),
		})), v.minLength(1, 'At least one section must be provided.')),
	}),
}, async ({ sections }) => {
	if (sections.length === 0) {
		return tool.error('At least one section must be provided.')
	}

	const codexConext = await useCodexContext()
	const { structure, documents } = codexConext

	let resultMD = `# ${structure.title}\n\n`

	for (const requestedSection of sections) {
		const section = structure.sections.find(candidate => candidate.title === requestedSection.title)

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
			: section.subsections.map(subsection => subsection.title)

		for (const subsectionTitle of subsectionTitles) {
			const subsection = section.subsections.find(candidate => candidate.title === subsectionTitle)

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

	return tool.text(resultMD)
})

function resolveLinkedDocument(
	documentEntry: {
		ok: boolean
		content: string | null
		statusCode: number | null
		statusText: string | null
		error: string | null
	} | undefined,
	url: string,
): string {
	if (documentEntry?.ok && documentEntry.content) {
		return documentEntry.content
	}

	if (!documentEntry) {
		return `Document not found in snapshot for ${url}.`
	}

	return `Failed to fetch document content. Status: ${documentEntry.statusCode} ${documentEntry.statusText}. Error: ${documentEntry.error}`
}

export function mcpServer() {
// Start the server with HTTP transport
return new HttpTransport(server);
}