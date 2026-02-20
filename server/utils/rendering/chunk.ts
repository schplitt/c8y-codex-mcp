import MiniSearch from 'minisearch'

export interface DocumentChunk {
  heading: string
  startLine: number
  endLine: number
  content: string
}

export interface RankedChunkMatch {
  chunk: DocumentChunk
  score: number
  confidence: number
  snippet: string
}

export function normalizeMiniSearchScoreToConfidence(score: number, topScore: number): number {
  if (score <= 0 || topScore <= 0) {
    return 0
  }

  return Math.max(0, Math.min(100, Math.round((score / topScore) * 100)))
}

function toQueryTokens(query: string): string[] {
  return query
    .toLowerCase()
    .split(/\s+/)
    .map((token) => token.trim())
    .filter(Boolean)
}

function toSnippet(content: string, queryTokens: string[]): string {
  const lines = content.split('\n')
  const matchingLine = lines.find((line) => {
    const normalized = line.toLowerCase()
    return queryTokens.some((token) => normalized.includes(token))
  })

  return (matchingLine ?? content).trim().slice(0, 220)
}

export function chunkMarkdownByHeadings(text: string): DocumentChunk[] {
  const lines = text.split('\n')

  if (lines.length === 0) {
    return []
  }

  const chunks: DocumentChunk[] = []
  let currentHeading = 'Document'
  let currentStartLine = 1
  let currentLines: string[] = []

  const pushCurrentChunk = (endLine: number) => {
    const content = currentLines.join('\n').trim()
    if (!content) {
      return
    }

    chunks.push({
      heading: currentHeading,
      startLine: currentStartLine,
      endLine,
      content,
    })
  }

  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index]!
    const lineNumber = index + 1

    if (/^##\s+/.test(line)) {
      pushCurrentChunk(lineNumber - 1)
      currentHeading = line.replace(/^##\s+/, '').trim() || 'Section'
      currentStartLine = lineNumber
      currentLines = [line]
      continue
    }

    currentLines.push(line)
  }

  pushCurrentChunk(lines.length)
  return chunks
}

export function searchChunks(
  chunks: DocumentChunk[],
  query: string,
  confidenceThreshold = 80,
  topK = 3,
): RankedChunkMatch[] {
  const normalizedQuery = query.trim()
  if (!normalizedQuery || chunks.length === 0) {
    return []
  }

  const search = new MiniSearch<{ id: string, heading: string, content: string }>({
    idField: 'id',
    fields: ['heading', 'content'],
    storeFields: ['heading', 'content'],
  })

  search.addAll(
    chunks.map((chunk, index) => ({
      id: String(index),
      heading: chunk.heading,
      content: chunk.content,
    })),
  )

  const matches = search.search(normalizedQuery, {
    prefix: true,
    fuzzy: 0.2,
    boost: {
      heading: 2,
      content: 1,
    },
    combineWith: 'OR',
  })

  const topScore = matches[0]?.score ?? 0
  const queryTokens = toQueryTokens(normalizedQuery)

  return matches
    .map((match) => {
      const score = match.score ?? 0
      const confidence = normalizeMiniSearchScoreToConfidence(score, topScore)
      const chunkIndex = Number.parseInt(String(match.id), 10)
      const chunk = chunks[chunkIndex]

      if (!chunk) {
        return null
      }

      return {
        chunk,
        score,
        confidence,
        snippet: toSnippet(chunk.content, queryTokens),
      }
    })
    .filter((match): match is RankedChunkMatch => match !== null)
    .filter((match) => match.confidence >= confidenceThreshold)
    .sort((left, right) => {
      if (right.confidence !== left.confidence) {
        return right.confidence - left.confidence
      }

      return left.chunk.startLine - right.chunk.startLine
    })
    .slice(0, Math.max(topK, 1))
}

export function sliceLines(text: string, startLine: number, endLine: number): string {
  const lines = text.split('\n')
  const safeStart = Math.max(1, startLine)
  const safeEnd = Math.max(safeStart, endLine)

  return lines.slice(safeStart - 1, safeEnd).join('\n')
}

export function splitChunksByLines(chunks: DocumentChunk[], maxLinesPerChunk: number): DocumentChunk[] {
  const safeMaxLines = Math.max(1, maxLinesPerChunk)
  const output: DocumentChunk[] = []

  for (const chunk of chunks) {
    const lines = chunk.content.split('\n')

    if (lines.length <= safeMaxLines) {
      output.push(chunk)
      continue
    }

    const totalParts = Math.ceil(lines.length / safeMaxLines)

    for (let index = 0; index < lines.length; index += safeMaxLines) {
      const partIndex = Math.floor(index / safeMaxLines)
      const partLines = lines.slice(index, index + safeMaxLines)
      const startLine = chunk.startLine + index
      const endLine = startLine + partLines.length - 1

      output.push({
        heading: `${chunk.heading} (part ${partIndex + 1}/${totalParts})`,
        startLine,
        endLine,
        content: partLines.join('\n'),
      })
    }
  }

  return output
}