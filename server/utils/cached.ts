import { createCachedFunction } from './cache-fn'
import { fetchAndParseCodexLlms } from './c8y'
import { resolveDocuments } from './c8y/enrich'
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
  return resolveDocuments(urls, options)
}
