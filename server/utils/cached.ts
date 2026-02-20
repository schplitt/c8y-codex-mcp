import { createCachedFunction } from './cache-fn'
import { fetchAndParseCodexLlms } from './c8y'
import { resolveEnrichedDocuments, resolveRawDocuments } from './rendering/enrich'
import type { ResolveDocumentsOptions } from './c8y/types'

const STRUCTURE_CACHE_KEY = 'codex:structure:v1'
const STRUCTURE_CACHE_TTL_SECONDS = 60 * 10

export const useCodexStructure = createCachedFunction(
  () => fetchAndParseCodexLlms(),
  {
    key: STRUCTURE_CACHE_KEY,
    maxAge: STRUCTURE_CACHE_TTL_SECONDS,
  },
)

export async function useCodexDocuments(urls: string[], options: ResolveDocumentsOptions = {}) {
  if (options.renderHtml) {
    return resolveEnrichedDocuments(urls)
  }

  return resolveRawDocuments(urls)
}

export async function useCodexRawDocuments(urls: string[]) {
  return resolveRawDocuments(urls)
}

export async function useCodexEnrichedDocuments(urls: string[]) {
  return resolveEnrichedDocuments(urls)
}
